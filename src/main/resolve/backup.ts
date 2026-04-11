import { existsSync } from 'fs'
import dayjs from 'dayjs'
import AdmZip from 'adm-zip'
import { dialog } from 'electron'
import i18next from 'i18next'
import { systemLogger } from '../utils/logger'
import {
  appConfigPath,
  controledMihomoConfigPath,
  dataDir,
  overrideConfigPath,
  overrideDir,
  profileConfigPath,
  profilesDir,
  rulesDir,
  themesDir
} from '../utils/dirs'

function createBackupZip(): AdmZip {
  const zip = new AdmZip()

  const files = [
    appConfigPath(),
    controledMihomoConfigPath(),
    profileConfigPath(),
    overrideConfigPath()
  ]

  const folders = [
    { path: themesDir(), name: 'themes' },
    { path: profilesDir(), name: 'profiles' },
    { path: overrideDir(), name: 'override' },
    { path: rulesDir(), name: 'rules' }
  ]

  for (const file of files) {
    if (existsSync(file)) {
      zip.addLocalFile(file)
    }
  }

  for (const { path, name } of folders) {
    if (existsSync(path)) {
      zip.addLocalFolder(path, name)
    }
  }

  return zip
}

/**
 * 导出本地备份
 */
export async function exportLocalBackup(): Promise<boolean> {
  const zip = createBackupZip()

  const date = new Date()
  const zipFileName = `clash-helen-backup-${dayjs(date).format('YYYY-MM-DD_HH-mm-ss')}.zip`
  const result = await dialog.showSaveDialog({
    title: i18next.t('localBackup.export.title'),
    defaultPath: zipFileName,
    filters: [
      { name: 'ZIP Files', extensions: ['zip'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })

  if (!result.canceled && result.filePath) {
    zip.writeZip(result.filePath)
    await systemLogger.info(`Local backup exported to: ${result.filePath}`)
    return true
  }
  return false
}

/**
 * 导入本地备份
 */
export async function importLocalBackup(): Promise<boolean> {
  const result = await dialog.showOpenDialog({
    title: i18next.t('localBackup.import.title'),
    filters: [
      { name: 'ZIP Files', extensions: ['zip'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0]
    const zip = new AdmZip(filePath)
    zip.extractAllTo(dataDir(), true)
    await systemLogger.info(`Local backup imported from: ${filePath}`)
    return true
  }
  return false
}
