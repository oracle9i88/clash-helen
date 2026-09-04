/**
 * tun-recovery — Linux TUN 断网黑洞的兜底清理
 *
 * 背景：mihomo TUN 模式(auto-route)会把默认路由抢到 Mihomo 接口上，
 * 并通过 dns-hijack any:53 劫持全部 DNS。核心进程被杀/崩溃时来不及
 * 删除这些路由，机器就变成黑洞——国内国外一起断。
 *
 * 本模块提供三件事：
 *   1. cleanupTunRoutes()：删除 Mihomo TUN 接口及其路由（尽力而为，
 *      权限不足时静默跳过，恢复命令写进日志）
 *   2. degradeTunSafety()：自动重启彻底失败时的降级——关闭 TUN、
 *      恢复 DNS、通知 UI。最坏情况从"整机断网"降为"回到不开 TUN 的状态"
 *   3. manualRecoverHint()：无权限时的手工恢复命令（也用于 README）
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { patchControledMihomoConfig } from '../config'
import { mainWindow } from '../window'
import { createLogger } from '../utils/logger'
import { recoverDNS } from './dns'

const execPromise = promisify(exec)
const tunLogger = createLogger('TunRecovery')

// 与 template.ts 中非 darwin 平台的 tun.device 一致
const TUN_DEVICE = process.platform === 'darwin' ? 'utun' : 'Mihomo'

export function manualRecoverHint(): string {
  if (process.platform === 'darwin') {
    return 'sudo route delete default && sudo networksetup -setdnsservers Wi-Fi Empty'
  }
  return [
    `sudo ip link delete ${TUN_DEVICE}   # 删除残留的 TUN 接口和路由`,
    'sudo cp /var/tmp/clash-helen-resolv.conf.bak $(readlink -f /etc/resolv.conf)   # 恢复 DNS',
    'sudo systemctl restart NetworkManager   # 重置路由'
  ].join('\n')
}

/**
 * 删除 TUN 接口（连带其上的全部路由）。接口删除后内核自动清掉指向
 * 它的路由，默认路由回到物理网卡。尽力而为：无权限时记日志。
 */
export async function cleanupTunRoutes(): Promise<void> {
  if (process.platform === 'win32') return

  try {
    if (process.platform === 'darwin') {
      // utun 接口随进程退出自动销毁，无需处理
      return
    }
    // Linux: 删除接口即回收路由。没权限就跳过（首次运行可能未授权）。
    const { stdout } = await execPromise(`ip link show ${TUN_DEVICE} 2>/dev/null || true`)
    if (stdout.trim()) {
      try {
        await execPromise(`ip link delete ${TUN_DEVICE}`)
        tunLogger.info(`Deleted TUN interface ${TUN_DEVICE} and its routes`)
      } catch {
        // 无 CAP_NET_ADMIN：记录手工恢复命令
        tunLogger.error(
          `No permission to delete TUN interface. Recover manually:\n${manualRecoverHint()}`
        )
      }
    }
  } catch (error) {
    tunLogger.error('cleanupTunRoutes failed', error)
  }
}

/**
 * 最后手段：核心反复崩溃后调用。关 TUN → 清路由 → 恢复 DNS → 通知用户。
 * 保证执行完后系统回到"不开 TUN 也能上网"的状态。
 */
export async function degradeTunSafety(): Promise<void> {
  tunLogger.error('Core keeps failing — degrading: TUN off, DNS recovered, network preserved')

  // 1. 配置层面关闭 TUN（下次重启核心不再抢路由）
  try {
    await patchControledMihomoConfig({ tun: { enable: false } })
  } catch (error) {
    tunLogger.error('Failed to disable TUN in config', error)
  }

  // 2. 清掉当前残留的 TUN 接口和路由
  await cleanupTunRoutes()

  // 3. 恢复系统 DNS
  try {
    await recoverDNS()
  } catch (error) {
    tunLogger.error('Failed to recover DNS during degrade', error)
  }

  // 4. 通知 UI（用户需要知道发生了什么）
  try {
    mainWindow?.webContents.send('controledMihomoConfigUpdated')
  } catch {
    // 窗口可能不存在
  }
}
