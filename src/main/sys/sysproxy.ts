import fs from 'fs'
import { triggerAutoProxy, triggerManualProxy } from 'sysproxy-rs'
import { net } from 'electron'
import axios from 'axios'
import { getAppConfig, getControledMihomoConfig } from '../config'
import { pacPort, startPacServer, stopPacServer } from '../resolve/server'
import { proxyLogger } from '../utils/logger'
import { setLinuxProxy } from './linuxProxy'

let triggerSysProxyTimer: NodeJS.Timeout | null = null
const helperSocketPath = '/tmp/mihomo-party-helper.sock'

const defaultBypass: string[] = (() => {
  switch (process.platform) {
    case 'linux':
      return ['localhost', '127.0.0.1', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '::1']
    case 'darwin':
      return [
        '127.0.0.1',
        '192.168.0.0/16',
        '10.0.0.0/8',
        '172.16.0.0/12',
        'localhost',
        '*.local',
        '*.crashlytics.com',
        '<local>'
      ]
    case 'win32':
      return [
        'localhost',
        '127.*',
        '192.168.*',
        '10.*',
        '172.16.*',
        '172.17.*',
        '172.18.*',
        '172.19.*',
        '172.20.*',
        '172.21.*',
        '172.22.*',
        '172.23.*',
        '172.24.*',
        '172.25.*',
        '172.26.*',
        '172.27.*',
        '172.28.*',
        '172.29.*',
        '172.30.*',
        '172.31.*',
        '<local>'
      ]
    default:
      return ['localhost', '127.0.0.1', '192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '::1']
  }
})()

export async function triggerSysProxy(enable: boolean): Promise<void> {
  if (net.isOnline()) {
    if (enable) {
      await disableSysProxy()
      await enableSysProxy()
    } else {
      await disableSysProxy()
    }
  } else {
    if (triggerSysProxyTimer) clearTimeout(triggerSysProxyTimer)
    triggerSysProxyTimer = setTimeout(() => triggerSysProxy(enable), 5000)
  }
}

async function enableSysProxy(): Promise<void> {
  await startPacServer()
  const { sysProxy } = await getAppConfig()
  const { mode, host, bypass = defaultBypass } = sysProxy
  const { 'mixed-port': mixedPort = 7890, 'socks-port': socksPort = 7891 } =
    await getControledMihomoConfig()
  const proxyHost = host || '127.0.0.1'

  if (process.platform === 'linux') {
    // Linux: use gsettings / KDE / /etc/environment
    try {
      await setLinuxProxy(true, {
        host: proxyHost,
        httpPort: mixedPort,
        socksPort: socksPort,
        bypass: bypass
      })
    } catch (error) {
      proxyLogger.error('Linux gsettings proxy failed, falling back to sysproxy-rs', error)
      // Fallback to sysproxy-rs
      try {
        if (mode === 'auto') {
          triggerAutoProxy(true, `http://${proxyHost}:${pacPort}/pac`)
        } else {
          triggerManualProxy(true, proxyHost, mixedPort, bypass.join(','))
        }
      } catch (fallbackError) {
        proxyLogger.error('sysproxy-rs fallback also failed', fallbackError)
        throw fallbackError
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS 需要 helper 提权
    if (mode === 'auto') {
      await helperRequest(() =>
        axios.post(
          'http://localhost/pac',
          { url: `http://${proxyHost}:${pacPort}/pac` },
          { socketPath: helperSocketPath }
        )
      )
    } else {
      await helperRequest(() =>
        axios.post(
          'http://localhost/global',
          { host: proxyHost, port: mixedPort.toString(), bypass: bypass.join(',') },
          { socketPath: helperSocketPath }
        )
      )
    }
  } else {
    // Windows — sysproxy-rs
    try {
      if (mode === 'auto') {
        triggerAutoProxy(true, `http://${proxyHost}:${pacPort}/pac`)
      } else {
        triggerManualProxy(true, proxyHost, mixedPort, bypass.join(','))
      }
    } catch (error) {
      proxyLogger.error('Failed to enable system proxy', error)
      throw error
    }
  }
}

async function disableSysProxy(): Promise<void> {
  await stopPacServer()

  if (process.platform === 'linux') {
    try {
      await setLinuxProxy(false)
    } catch (error) {
      proxyLogger.warn('Linux proxy disable failed, trying sysproxy-rs fallback', error)
      try {
        triggerAutoProxy(false, '')
        triggerManualProxy(false, '', 0, '')
      } catch {
        // ignore
      }
    }
  } else if (process.platform === 'darwin') {
    await helperRequest(() => axios.get('http://localhost/off', { socketPath: helperSocketPath }))
  } else {
    // Windows
    try {
      triggerAutoProxy(false, '')
      triggerManualProxy(false, '', 0, '')
    } catch (error) {
      proxyLogger.error('Failed to disable system proxy', error)
      throw error
    }
  }
}

function isSocketFileExists(): boolean {
  try {
    return fs.existsSync(helperSocketPath)
  } catch {
    return false
  }
}

async function isHelperRunning(): Promise<boolean> {
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execPromise = promisify(exec)
    const { stdout } = await execPromise('pgrep -f party.mihomo.helper')
    return stdout.trim().length > 0
  } catch {
    return false
  }
}

async function startHelperService(): Promise<void> {
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execPromise = promisify(exec)
  const shell = `launchctl kickstart -k system/party.mihomo.helper`
  const command = `do shell script "${shell}" with administrator privileges`
  await execPromise(`osascript -e '${command}'`)
  await new Promise((resolve) => setTimeout(resolve, 1500))
}

async function requestSocketRecreation(): Promise<void> {
  try {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execPromise = promisify(exec)
    const shell = `pkill -USR1 -f party.mihomo.helper`
    const command = `do shell script "${shell}" with administrator privileges`
    await execPromise(`osascript -e '${command}'`)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  } catch (error) {
    proxyLogger.error('Failed to send signal to helper', error)
    throw error
  }
}

async function helperRequest(requestFn: () => Promise<unknown>, maxRetries = 2): Promise<unknown> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn()
    } catch (error) {
      lastError = error as Error
      const errCode = (error as NodeJS.ErrnoException).code
      const errMsg = (error as Error).message || ''

      if (
        attempt < maxRetries &&
        (errCode === 'ECONNREFUSED' ||
          errCode === 'ENOENT' ||
          errMsg.includes('connect ECONNREFUSED') ||
          errMsg.includes('ENOENT'))
      ) {
        proxyLogger.info(
          `Helper request failed (attempt ${attempt + 1}/${maxRetries + 1}), checking helper status...`
        )

        const helperRunning = await isHelperRunning()
        const socketExists = isSocketFileExists()

        if (!helperRunning) {
          proxyLogger.info('Helper process not running, starting service...')
          try {
            await startHelperService()
            proxyLogger.info('Helper service started, retrying...')
            continue
          } catch (startError) {
            proxyLogger.warn('Failed to start helper service', startError)
          }
        } else if (!socketExists) {
          proxyLogger.info('Socket file missing but helper running, requesting recreation...')
          try {
            await requestSocketRecreation()
            proxyLogger.info('Socket recreation requested, retrying...')
            continue
          } catch (signalError) {
            proxyLogger.warn('Failed to request socket recreation', signalError)
          }
        }
      }

      if (attempt === maxRetries) {
        throw lastError
      }
    }
  }

  throw lastError
}
