import { exec } from 'child_process'
import { promisify } from 'util'
import { net } from 'electron'
import axios from 'axios'
import { getAppConfig, patchAppConfig } from '../config'

const execPromise = promisify(exec)
const helperSocketPath = '/tmp/mihomo-party-helper.sock'

let setPublicDNSTimer: NodeJS.Timeout | null = null
let recoverDNSTimer: NodeJS.Timeout | null = null

// Linux: absolute path of the saved resolv.conf backup. Kept outside the app
// data dir on purpose — it must survive even if the app is killed before it
// can restore, so a recovery script can find it in a known place.
const LINUX_RESOLV_BACKUP = '/var/tmp/clash-helen-resolv.conf.bak'

async function getLinuxOriginDNS(): Promise<void> {
  // Remember the current DNS settings so recoverDNS() can put them back.
  // resolv.conf content is the source of truth; systemd-resolved symlinks are
  // resolved to their real target first so we back up real config, not a link.
  const { stdout } = await execPromise('readlink -f /etc/resolv.conf && cat /etc/resolv.conf')
  const lines = stdout.split('\n').filter(Boolean)
  const resolvPath = lines[0] || '/etc/resolv.conf'
  await execPromise(
    `mkdir -p /var/tmp && touch ${LINUX_RESOLV_BACKUP} && chmod 644 ${LINUX_RESOLV_BACKUP} && cp ${resolvPath} ${LINUX_RESOLV_BACKUP} 2>/dev/null || sudo -n cp ${resolvPath} ${LINUX_RESOLV_BACKUP}`
  ).catch(() => undefined)
  const content = lines.slice(1).join('\n') + '\n'
  await patchAppConfig({ originDNS: `${resolvPath}|${content}` })
}

async function setLinuxDNS(): Promise<void> {
  // TUN hijacks all DNS (dns-hijack any:53), so the system resolver just needs
  // a reachable plaintext fallback that mihomo intercepts anyway. 223.5.5.5
  // keeps direct-connect working for CN domains when the tunnel is healthy.
  await execPromise(
    `sh -c 'if [ -L /etc/resolv.conf ] || [ ! -w /etc/resolv.conf ]; then sudo -n sh -c "echo \\"nameserver 223.5.5.5\\" > /etc/resolv.conf" 2>/dev/null || true; else echo \\"nameserver 223.5.5.5\\" > /etc/resolv.conf; fi'`
  )
}

async function recoverLinuxDNS(): Promise<void> {
  const { originDNS } = await getAppConfig()
  if (!originDNS || !originDNS.includes('|')) return
  const [resolvPath] = originDNS.split('|', 2)
  // Prefer the on-disk backup (survives app crashes); fall back to the copy in
  // app config. Write back to the REAL path (the symlink target), not the link.
  const restoreCmd = `sh -c 'if [ -s ${LINUX_RESOLV_BACKUP} ]; then SRC=${LINUX_RESOLV_BACKUP}; else exit 1; fi; if [ -w ${resolvPath} ]; then cp "$SRC" ${resolvPath}; else sudo -n cp "$SRC" ${resolvPath} 2>/dev/null || exit 1; fi'`
  try {
    await execPromise(restoreCmd)
  } catch {
    // sudo -n may fail without passwordless sudo. Last resort: rewrite the
    // file in place if writable. If that also fails, tell the user via log —
    // DNS stays hijacked, which is exactly the state we are trying to fix,
    // so surface it loudly.
    const { createLogger } = await import('../utils/logger')
    createLogger('Dns').error(
      'recoverLinuxDNS failed: no permission to restore /etc/resolv.conf. ' +
        'Restore manually with: sudo cp /var/tmp/clash-helen-resolv.conf.bak ' +
        resolvPath
    )
    return
  }
  await patchAppConfig({ originDNS: undefined })
  try {
    await execPromise(`rm -f ${LINUX_RESOLV_BACKUP}`)
  } catch {
    // best effort
  }
}

export async function getDefaultDevice(): Promise<string> {
  const { stdout: deviceOut } = await execPromise(`route -n get default`)
  let device = deviceOut.split('\n').find((s) => s.includes('interface:'))
  device = device?.trim().split(' ').slice(1).join(' ')
  if (!device) throw new Error('Get device failed')
  return device
}

async function getDefaultService(): Promise<string> {
  const device = await getDefaultDevice()
  const { stdout: order } = await execPromise(`networksetup -listnetworkserviceorder`)
  const block = order.split('\n\n').find((s) => s.includes(`Device: ${device}`))
  if (!block) throw new Error('Get networkservice failed')
  for (const line of block.split('\n')) {
    if (line.match(/^\(\d+\).*/)) {
      return line.trim().split(' ').slice(1).join(' ')
    }
  }
  throw new Error('Get service failed')
}

async function getOriginDNS(): Promise<void> {
  const service = await getDefaultService()
  const { stdout: dns } = await execPromise(`networksetup -getdnsservers "${service}"`)
  if (dns.startsWith("There aren't any DNS Servers set on")) {
    await patchAppConfig({ originDNS: 'Empty' })
  } else {
    await patchAppConfig({ originDNS: dns.trim().replace(/\n/g, ' ') })
  }
}

async function setDNS(dns: string): Promise<void> {
  const service = await getDefaultService()
  try {
    await axios.post('http://localhost/dns', { service, dns }, { socketPath: helperSocketPath })
  } catch {
    // fallback to osascript if helper not available
    const shell = `networksetup -setdnsservers "${service}" ${dns}`
    const command = `do shell script "${shell}" with administrator privileges`
    await execPromise(`osascript -e '${command}'`)
  }
}

export async function setPublicDNS(): Promise<void> {
  if (process.platform === 'linux') {
    // Linux (Ubuntu/Debian): back up resolv.conf before TUN's dns-hijack takes
    // over, so a dead core can always be recovered from.
    if (net.isOnline()) {
      const { originDNS } = await getAppConfig()
      if (!originDNS) {
        try {
          await getLinuxOriginDNS()
          await setLinuxDNS()
        } catch (error) {
          const { createLogger } = await import('../utils/logger')
          createLogger('Dns').error('Linux DNS backup failed', error)
        }
      }
    } else {
      if (setPublicDNSTimer) clearTimeout(setPublicDNSTimer)
      setPublicDNSTimer = setTimeout(() => setPublicDNS(), 5000)
    }
    return
  }
  if (process.platform !== 'darwin') return
  if (net.isOnline()) {
    const { originDNS } = await getAppConfig()
    if (!originDNS) {
      await getOriginDNS()
      await setDNS('223.5.5.5')
    }
  } else {
    if (setPublicDNSTimer) clearTimeout(setPublicDNSTimer)
    setPublicDNSTimer = setTimeout(() => setPublicDNS(), 5000)
  }
}

export async function recoverDNS(): Promise<void> {
  if (process.platform === 'linux') {
    // Do NOT gate on net.isOnline(): it can be false precisely because DNS is
    // broken — that is the moment recovery matters most.
    try {
      await recoverLinuxDNS()
    } catch (error) {
      const { createLogger } = await import('../utils/logger')
      createLogger('Dns').error('Linux DNS recover failed', error)
    }
    return
  }
  if (process.platform !== 'darwin') return
  if (net.isOnline()) {
    const { originDNS } = await getAppConfig()
    if (originDNS) {
      await setDNS(originDNS)
      await patchAppConfig({ originDNS: undefined })
    }
  } else {
    if (recoverDNSTimer) clearTimeout(recoverDNSTimer)
    recoverDNSTimer = setTimeout(() => recoverDNS(), 5000)
  }
}
