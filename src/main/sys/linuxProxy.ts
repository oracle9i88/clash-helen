/**
 * linuxProxy.ts — Ubuntu/GNOME system proxy via gsettings
 *
 * Replaces sysproxy-rs on Linux with a pure-shell approach:
 *   gsettings set org.gnome.system.proxy ...
 *
 * Also writes /etc/environment entries for terminal/CLI tools,
 * and supports KDE (kwriteconfig5) as a best-effort fallback.
 *
 * Inspired by ClashEcho's SystemProxyManager.swift (macOS networksetup).
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { access, readFile, writeFile } from 'fs/promises'
import { constants, existsSync } from 'fs'
import { join } from 'path'
import { createLogger } from '../utils/logger'

const execAsync = promisify(exec)
const log = createLogger('LinuxProxy')
const capabilityLogCache = new Set<string>()

export interface LinuxProxyConfig {
  host: string
  httpPort: number
  socksPort: number
  bypass: string[]
}

const DEFAULT_BYPASS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '192.168.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12'
]

// ──────────────────────────────────────────────
// GNOME via gsettings
// ──────────────────────────────────────────────

export async function enableGnomeProxy(cfg: LinuxProxyConfig): Promise<void> {
  if (!(await canUseGnomeProxy())) return

  const { host, httpPort, socksPort, bypass } = cfg
  const bypassList = bypass.length ? bypass : DEFAULT_BYPASS
  const bypassGsettings = `[${bypassList.map((b) => `'${b}'`).join(', ')}]`

  const cmds = [
    `gsettings set org.gnome.system.proxy mode 'manual'`,
    `gsettings set org.gnome.system.proxy.http host '${host}'`,
    `gsettings set org.gnome.system.proxy.http port ${httpPort}`,
    `gsettings set org.gnome.system.proxy.https host '${host}'`,
    `gsettings set org.gnome.system.proxy.https port ${httpPort}`,
    `gsettings set org.gnome.system.proxy.socks host '${host}'`,
    `gsettings set org.gnome.system.proxy.socks port ${socksPort}`,
    `gsettings set org.gnome.system.proxy ignore-hosts "${bypassGsettings}"`
  ]

  for (const cmd of cmds) {
    try {
      await execAsync(cmd)
    } catch (e) {
      log.warn(`gsettings cmd failed: ${cmd}`, e)
    }
  }
  log.info(`GNOME proxy enabled → ${host}:${httpPort}`)
}

export async function disableGnomeProxy(): Promise<void> {
  if (!(await canUseGnomeProxy())) return

  try {
    await execAsync(`gsettings set org.gnome.system.proxy mode 'none'`)
    log.info('GNOME proxy disabled')
  } catch (e) {
    log.warn('Failed to disable GNOME proxy', e)
  }
}

// ──────────────────────────────────────────────
// KDE via kwriteconfig5 (best-effort)
// ──────────────────────────────────────────────

export async function enableKdeProxy(cfg: LinuxProxyConfig): Promise<void> {
  if (!(await canUseKdeProxy())) return

  const { host, httpPort } = cfg
  const proxyUrl = `http://${host}:${httpPort}`

  const cmds = [
    `kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key ProxyType 1`,
    `kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key httpProxy '${proxyUrl}'`,
    `kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key httpsProxy '${proxyUrl}'`,
    `kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key socksProxy 'socks5://${host}:${cfg.socksPort}'`,
    `qdbus org.kde.kded5 /modules/proxyscout KDEProxyChanged 2>/dev/null || true`
  ]

  for (const cmd of cmds) {
    try {
      await execAsync(cmd)
    } catch {
      // KDE may not be available — silently skip
    }
  }
}

export async function disableKdeProxy(): Promise<void> {
  if (!(await canUseKdeProxy())) return

  try {
    await execAsync(`kwriteconfig5 --file kioslaverc --group 'Proxy Settings' --key ProxyType 0`)
  } catch {
    // ignore
  }
}

// ──────────────────────────────────────────────
// /etc/environment — for terminal / non-GUI tools
// ──────────────────────────────────────────────

const ENV_FILE = '/etc/environment'
const MARKER_START = '# ClashHelen proxy — managed automatically'
const MARKER_END = '# ClashHelen proxy — end'

function logSkipOnce(key: string, message: string): void {
  if (capabilityLogCache.has(key)) return
  capabilityLogCache.add(key)
  log.info(message)
}

async function hasAccess(targetPath: string, mode: number): Promise<boolean> {
  try {
    await access(targetPath, mode)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'ENOENT' || code === 'EPERM' || code === 'EROFS') {
      return false
    }
    throw error
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await execAsync(`command -v ${command}`)
    return true
  } catch {
    return false
  }
}

function getRuntimeDir(): string | null {
  if (process.env.XDG_RUNTIME_DIR) return process.env.XDG_RUNTIME_DIR
  if (typeof process.getuid === 'function') {
    return `/run/user/${process.getuid()}`
  }
  return null
}

async function canUseGnomeProxy(): Promise<boolean> {
  if (!(await commandExists('gsettings'))) {
    logSkipOnce('gsettings-missing', 'Skipping GNOME proxy integration: gsettings is unavailable')
    return false
  }

  if (
    !process.env.DBUS_SESSION_BUS_ADDRESS &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY
  ) {
    logSkipOnce(
      'gsettings-session',
      'Skipping GNOME proxy integration: no desktop session detected'
    )
    return false
  }

  const runtimeDir = getRuntimeDir()
  if (!runtimeDir) return true

  if (!(await hasAccess(runtimeDir, constants.W_OK | constants.X_OK))) {
    logSkipOnce(
      'gsettings-runtime',
      `Skipping GNOME proxy integration: runtime dir "${runtimeDir}" is not writable`
    )
    return false
  }

  const dconfDir = join(runtimeDir, 'dconf')
  if (existsSync(dconfDir) && !(await hasAccess(dconfDir, constants.W_OK | constants.X_OK))) {
    logSkipOnce(
      'gsettings-dconf',
      `Skipping GNOME proxy integration: dconf dir "${dconfDir}" is not writable`
    )
    return false
  }

  return true
}

async function canUseKdeProxy(): Promise<boolean> {
  if (!(await commandExists('kwriteconfig5'))) {
    logSkipOnce(
      'kwriteconfig5-missing',
      'Skipping KDE proxy integration: kwriteconfig5 is unavailable'
    )
    return false
  }

  const homeDir = process.env.HOME
  if (!homeDir || !(await hasAccess(homeDir, constants.W_OK | constants.X_OK))) {
    logSkipOnce('kwriteconfig5-home', 'Skipping KDE proxy integration: HOME is not writable')
    return false
  }

  return true
}

async function canModifyEnvFile(): Promise<boolean> {
  if (!existsSync(ENV_FILE)) return false

  if (await hasAccess(ENV_FILE, constants.R_OK | constants.W_OK)) {
    return true
  }

  logSkipOnce(
    'env-file-readonly',
    `Skipping ${ENV_FILE} proxy update: file is not writable in this environment`
  )
  return false
}

export async function writeEnvProxy(cfg: LinuxProxyConfig): Promise<void> {
  if (!(await canModifyEnvFile())) return

  try {
    const proxyUrl = `http://${cfg.host}:${cfg.httpPort}`
    const socksUrl = `socks5://${cfg.host}:${cfg.socksPort}`
    const noProxy = cfg.bypass.join(',') || DEFAULT_BYPASS.join(',')

    const block = [
      MARKER_START,
      `HTTP_PROXY="${proxyUrl}"`,
      `HTTPS_PROXY="${proxyUrl}"`,
      `ALL_PROXY="${socksUrl}"`,
      `http_proxy="${proxyUrl}"`,
      `https_proxy="${proxyUrl}"`,
      `all_proxy="${socksUrl}"`,
      `NO_PROXY="${noProxy}"`,
      `no_proxy="${noProxy}"`,
      MARKER_END
    ].join('\n')

    const original = await readFile(ENV_FILE, 'utf-8')
    const cleaned = removeBlock(original)
    await writeFile(ENV_FILE, cleaned + '\n' + block + '\n', 'utf-8')
    log.info(`/etc/environment proxy entries written`)
  } catch (e) {
    log.warn('Could not write /etc/environment (need root?)', e)
  }
}

export async function removeEnvProxy(): Promise<void> {
  if (!(await canModifyEnvFile())) return

  try {
    const original = await readFile(ENV_FILE, 'utf-8')
    await writeFile(ENV_FILE, removeBlock(original), 'utf-8')
    log.info('/etc/environment proxy entries removed')
  } catch (e) {
    log.warn('Could not clean /etc/environment', e)
  }
}

function removeBlock(content: string): string {
  const startIdx = content.indexOf(MARKER_START)
  const endIdx = content.indexOf(MARKER_END)
  if (startIdx === -1 || endIdx === -1) return content
  return content.slice(0, startIdx) + content.slice(endIdx + MARKER_END.length)
}

// ──────────────────────────────────────────────
// High-level toggle (detect desktop environment)
// ──────────────────────────────────────────────

export async function setLinuxProxy(enable: boolean, cfg?: LinuxProxyConfig): Promise<void> {
  if (process.platform !== 'linux') return

  if (!enable) {
    await disableGnomeProxy()
    await disableKdeProxy()
    await removeEnvProxy()
    return
  }

  if (!cfg) {
    log.warn('setLinuxProxy called with enable=true but no config')
    return
  }

  const desktop = process.env.XDG_CURRENT_DESKTOP?.toLowerCase() || ''

  if (desktop.includes('gnome') || desktop.includes('ubuntu') || desktop.includes('unity')) {
    await enableGnomeProxy(cfg)
  } else if (desktop.includes('kde') || desktop.includes('plasma')) {
    await enableKdeProxy(cfg)
  } else {
    // Fallback: try GNOME first, KDE second
    await enableGnomeProxy(cfg)
    await enableKdeProxy(cfg)
  }

  await writeEnvProxy(cfg)
}

// ──────────────────────────────────────────────
// Query current proxy state
// ──────────────────────────────────────────────

export async function getLinuxProxyState(): Promise<{
  enabled: boolean
  host?: string
  port?: number
}> {
  if (!(await canUseGnomeProxy())) {
    return { enabled: false }
  }

  try {
    const { stdout } = await execAsync(`gsettings get org.gnome.system.proxy mode`)
    const mode = stdout.trim().replace(/'/g, '')
    if (mode === 'manual') {
      const { stdout: host } = await execAsync(`gsettings get org.gnome.system.proxy.http host`)
      const { stdout: port } = await execAsync(`gsettings get org.gnome.system.proxy.http port`)
      return {
        enabled: true,
        host: host.trim().replace(/'/g, ''),
        port: parseInt(port.trim(), 10)
      }
    }
  } catch {
    // gsettings not available (non-GNOME)
  }
  return { enabled: false }
}
