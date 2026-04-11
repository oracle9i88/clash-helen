import { copyFile, mkdir, writeFile, readFile, stat } from 'fs/promises'
import vm from 'vm'
import { existsSync, writeFileSync } from 'fs'
import path from 'path'
import {
  getControledMihomoConfig,
  getProfileConfig,
  getProfile,
  getProfileItem,
  getOverride,
  getOverrideItem,
  getOverrideConfig,
  getAppConfig
} from '../config'
import {
  mihomoProfileWorkDir,
  mihomoWorkConfigPath,
  mihomoWorkDir,
  overridePath,
  rulePath
} from '../utils/dirs'
import { parse, stringify } from '../utils/yaml'
import { deepMerge } from '../utils/merge'
import { createLogger } from '../utils/logger'

const factoryLogger = createLogger('Factory')

let runtimeConfigStr: string = ''
let runtimeConfig: IMihomoConfig = {} as IMihomoConfig

// 辅助函数：处理带偏移量的规则
function processRulesWithOffset(ruleStrings: string[], currentRules: string[], isAppend = false) {
  const normalRules: string[] = []
  const rules = [...currentRules]

  ruleStrings.forEach((ruleStr) => {
    const parts = ruleStr.split(',')
    const firstPartIsNumber =
      !isNaN(Number(parts[0])) && parts[0].trim() !== '' && parts.length >= 3

    if (firstPartIsNumber) {
      const offset = parseInt(parts[0])
      const rule = parts.slice(1).join(',')

      if (isAppend) {
        // 后置规则的插入位置计算
        const insertPosition = Math.max(0, rules.length - Math.min(offset, rules.length))
        rules.splice(insertPosition, 0, rule)
      } else {
        // 前置规则的插入位置计算
        const insertPosition = Math.min(offset, rules.length)
        rules.splice(insertPosition, 0, rule)
      }
    } else {
      normalRules.push(ruleStr)
    }
  })

  return { normalRules, insertRules: rules }
}

function applyHysteria2PortHopping(
  profile: IMihomoConfig,
  appConfig: IAppConfig
): IMihomoConfig {
  const { hysteria2PortHopping, hysteria2Ports = '20000-40000', hysteria2HopInterval = 30 } =
    appConfig
  if (!hysteria2PortHopping || !Array.isArray(profile.proxies)) {
    return profile
  }
  const proxies = profile.proxies.map((proxy: Record<string, unknown>) => {
    if (proxy.type === 'hysteria2' && !proxy.ports) {
      return { ...proxy, ports: hysteria2Ports, 'hop-interval': hysteria2HopInterval }
    }
    return proxy
  })
  return { ...profile, proxies } as IMihomoConfig
}

export async function generateProfile(): Promise<string | undefined> {
  // 读取最新的配置
  const { current } = await getProfileConfig(true)
  const appConfig = await getAppConfig()
  const {
    diffWorkDir = false,
    controlDns = true,
    controlSniff = true,
    useNameserverPolicy
  } = appConfig
  const baseProfile = await getProfile(current)
  const overrideIds = await getOrderedOverrideIds(current)
  const profileWithOverride = await applyOverrides(baseProfile, overrideIds)
  const currentProfile = await applyRuleOverride(current, profileWithOverride)
  const profileWithHopping = applyHysteria2PortHopping(currentProfile, appConfig)
  let controledMihomoConfig = await getControledMihomoConfig()

  // 根据开关状态过滤控制配置
  controledMihomoConfig = { ...controledMihomoConfig }
  if (!controlDns) {
    delete controledMihomoConfig.dns
    delete controledMihomoConfig.hosts
  }
  if (!controlSniff) {
    delete controledMihomoConfig.sniffer
  }
  if (!useNameserverPolicy) {
    delete controledMihomoConfig?.dns?.['nameserver-policy']
  }

  const profile = deepMerge(profileWithHopping, controledMihomoConfig)
  // 确保可以拿到基础日志信息
  // 使用 debug 可以调试内核相关问题 `debug/pprof`
  if (['info', 'debug'].includes(profile['log-level']) === false) {
    profile['log-level'] = 'info'
  }
  // 删除空的局域网允许列表，避免局域网访问异常
  if (!profile['lan-allowed-ips']?.length) {
    delete profile['lan-allowed-ips']
  }
  runtimeConfig = profile
  runtimeConfigStr = stringify(profile)
  if (diffWorkDir) {
    await prepareProfileWorkDir(current)
  }
  await writeFile(
    diffWorkDir ? mihomoWorkConfigPath(current) : mihomoWorkConfigPath('work'),
    runtimeConfigStr
  )
  return current
}

async function applyRuleOverride(
  current: string | undefined,
  profile: IMihomoConfig
): Promise<IMihomoConfig> {
  try {
    const ruleFilePath = rulePath(current || 'default')
    if (!existsSync(ruleFilePath)) {
      return profile
    }

    const ruleFileContent = await readFile(ruleFilePath, 'utf-8')
    const ruleData = parse(ruleFileContent) as {
      prepend?: string[]
      append?: string[]
      delete?: string[]
    } | null

    if (!ruleData || typeof ruleData !== 'object') {
      return profile
    }

    if (!profile.rules) {
      profile.rules = [] as unknown as []
    }

    let rules = [...profile.rules] as unknown as string[]

    if (ruleData.prepend?.length) {
      const { normalRules: prependRules, insertRules } = processRulesWithOffset(
        ruleData.prepend,
        rules
      )
      rules = [...prependRules, ...insertRules]
    }

    if (ruleData.append?.length) {
      const { normalRules: appendRules, insertRules } = processRulesWithOffset(
        ruleData.append,
        rules,
        true
      )
      rules = [...insertRules, ...appendRules]
    }

    if (ruleData.delete?.length) {
      const deleteSet = new Set(ruleData.delete)
      rules = rules.filter((rule) => {
        const ruleStr = Array.isArray(rule) ? rule.join(',') : rule
        return !deleteSet.has(ruleStr)
      })
    }

    profile.rules = rules as unknown as []
    return profile
  } catch (error) {
    factoryLogger.error('Failed to read or apply rule file', error)
    return profile
  }
}

async function prepareProfileWorkDir(current: string | undefined): Promise<void> {
  if (!existsSync(mihomoProfileWorkDir(current))) {
    await mkdir(mihomoProfileWorkDir(current), { recursive: true })
  }

  const isSourceNewer = async (sourcePath: string, targetPath: string): Promise<boolean> => {
    try {
      const [sourceStats, targetStats] = await Promise.all([stat(sourcePath), stat(targetPath)])
      return sourceStats.mtime > targetStats.mtime
    } catch {
      return true
    }
  }

  const copy = async (file: string): Promise<void> => {
    const targetPath = path.join(mihomoProfileWorkDir(current), file)
    const sourcePath = path.join(mihomoWorkDir(), file)
    if (!existsSync(sourcePath)) return
    // 复制条件：目标不存在 或 源文件更新
    const shouldCopy = !existsSync(targetPath) || (await isSourceNewer(sourcePath, targetPath))
    if (shouldCopy) {
      await copyFile(sourcePath, targetPath)
    }
  }
  await Promise.all([
    copy('country.mmdb'),
    copy('geoip.metadb'),
    copy('geoip.dat'),
    copy('geosite.dat'),
    copy('ASN.mmdb')
  ])
}

async function getOrderedOverrideIds(current: string | undefined): Promise<string[]> {
  const { items = [] } = (await getOverrideConfig()) || {}
  const globalOverride = items.filter((item) => item.global).map((item) => item.id)
  const { override = [] } = (await getProfileItem(current)) || {}
  return [...new Set(globalOverride.concat(override))]
}

async function applyOverrides(
  profile: IMihomoConfig,
  overrideIds: string[]
): Promise<IMihomoConfig> {
  for (const ov of overrideIds) {
    const item = await getOverrideItem(ov)
    const content = await getOverride(ov, item?.ext || 'js')
    switch (item?.ext) {
      case 'js':
        profile = runOverrideScript(profile, content, item)
        break
      case 'yaml': {
        let patch = parse(content) || {}
        if (typeof patch !== 'object') patch = {}
        profile = deepMerge(profile, patch)
        break
      }
    }
  }
  return profile
}

function runOverrideScript(
  profile: IMihomoConfig,
  script: string,
  item: IOverrideItem
): IMihomoConfig {
  const log = (type: string, data: string, flag = 'a'): void => {
    writeFileSync(overridePath(item.id, 'log'), `[${type}] ${data}\n`, {
      encoding: 'utf-8',
      flag
    })
  }
  try {
    const ctx = {
      console: Object.freeze({
        log(data: never) {
          log('log', JSON.stringify(data))
        },
        info(data: never) {
          log('info', JSON.stringify(data))
        },
        error(data: never) {
          log('error', JSON.stringify(data))
        },
        debug(data: never) {
          log('debug', JSON.stringify(data))
        }
      })
    }
    vm.createContext(ctx)
    const code = `${script} main(${JSON.stringify(profile)})`
    log('info', '开始执行脚本', 'w')
    const newProfile = vm.runInContext(code, ctx)
    if (typeof newProfile !== 'object') {
      throw new Error('脚本返回值必须是对象')
    }
    log('info', '脚本执行成功')
    return newProfile
  } catch (e) {
    log('exception', `脚本执行失败：${e}`)
    return profile
  }
}

export async function getRuntimeConfigStr(): Promise<string> {
  return runtimeConfigStr
}

export async function getRuntimeConfig(): Promise<IMihomoConfig> {
  return runtimeConfig
}
