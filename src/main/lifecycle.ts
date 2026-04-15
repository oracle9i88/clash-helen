import { spawn, exec } from 'child_process'
import { promisify } from 'util'
import { stat } from 'fs/promises'
import { accessSync, constants, existsSync } from 'fs'
import { app, powerMonitor } from 'electron'
import { stopCore, cleanupCoreWatcher } from './core/manager'
import { triggerSysProxy } from './sys/sysproxy'
import { exePath } from './utils/dirs'
import { createLogger } from './utils/logger'

const lifecycleLogger = createLogger('Lifecycle')

export function customRelaunch(): void {
  const script = `while kill -0 ${process.pid} 2>/dev/null; do
  sleep 0.1
done
${process.argv.join(' ')} & disown
exit
`
  spawn('sh', ['-c', script], {
    detached: true,
    stdio: 'ignore'
  })
}

export async function fixUserDataPermissions(): Promise<void> {
  if (process.platform !== 'darwin') return

  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) return

  try {
    const stats = await stat(userDataPath)
    const currentUid = process.getuid?.() || 0

    if (stats.uid === 0 && currentUid !== 0) {
      const execPromise = promisify(exec)
      const username = process.env.USER || process.env.LOGNAME
      if (username) {
        await execPromise(`chown -R "${username}:staff" "${userDataPath}"`)
        await execPromise(`chmod -R u+rwX "${userDataPath}"`)
      }
    }
  } catch {
    // ignore
  }
}

function shouldForceSoftwareRenderingOnLinux(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env.CLASH_HELEN_FORCE_HARDWARE_ACCELERATION === '1') return false

  const hasDisplaySession = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  const hasGpuDevice = existsSync('/dev/dri')
  const isCi = Boolean(process.env.CI)
  const isRemoteSession = Boolean(process.env.SSH_CONNECTION || process.env.SSH_TTY)

  return isCi || isRemoteSession || (hasDisplaySession && !hasGpuDevice)
}

function shouldUseInMemoryGSettings(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env.GSETTINGS_BACKEND) return false

  const runtimeDir =
    process.env.XDG_RUNTIME_DIR ||
    (typeof process.getuid === 'function' ? `/run/user/${process.getuid()}` : '')

  if (!runtimeDir) return false

  try {
    accessSync(runtimeDir, constants.W_OK | constants.X_OK)
    return false
  } catch {
    return true
  }
}

export function setupPlatformSpecifics(): void {
  if (process.platform === 'linux') {
    app.relaunch = customRelaunch

    if (shouldUseInMemoryGSettings()) {
      process.env.GSETTINGS_BACKEND = 'memory'
      lifecycleLogger.info('Using in-memory GSettings backend on Linux for the current session')
    }

    if (shouldForceSoftwareRenderingOnLinux()) {
      app.disableHardwareAcceleration()
      app.commandLine.appendSwitch('disable-gpu')
      app.commandLine.appendSwitch('disable-gpu-compositing')
      lifecycleLogger.info('Forcing software rendering on Linux for the current session')
    }
  }

  if (process.platform === 'win32' && !exePath().startsWith('C')) {
    app.commandLine.appendSwitch('in-process-gpu')
  }
}

export function setupAppLifecycle(): void {
  app.on('before-quit', async (e) => {
    e.preventDefault()
    cleanupCoreWatcher()
    await triggerSysProxy(false)
    await stopCore()
    app.exit()
  })

  powerMonitor.on('shutdown', async () => {
    cleanupCoreWatcher()
    triggerSysProxy(false)
    await stopCore()
    app.exit()
  })
}

export function getSystemLanguage(): 'zh-CN' | 'en-US' {
  const locale = app.getLocale()
  return locale.startsWith('zh') ? 'zh-CN' : 'en-US'
}
