import { Button } from '@heroui/react'
import BasePage from '@renderer/components/base/base-page'
import { IoLogoGithub } from 'react-icons/io5'
import GeneralConfig from '@renderer/components/settings/general-config'
import MihomoConfig from '@renderer/components/settings/mihomo-config'
import Actions from '@renderer/components/settings/actions'
import ShortcutConfig from '@renderer/components/settings/shortcut-config'
import SiderConfig from '@renderer/components/settings/sider-config'
import LocalBackupConfig from '@renderer/components/settings/local-backup-config'
import { useTranslation } from 'react-i18next'

const Settings: React.FC = () => {
  const { t } = useTranslation()

  return (
    <BasePage
      title={t('settings.title')}
      header={
        <>
          <Button
            isIconOnly
            size="sm"
            variant="light"
            className="app-nodrag"
            title="GitHub"
            onPress={() => {
              window.open('https://github.com/clash-helen')
            }}
          >
            <IoLogoGithub className="text-lg" />
          </Button>
        </>
      }
    >
      <GeneralConfig />
      <SiderConfig />
      <MihomoConfig />
      <ShortcutConfig />
      <LocalBackupConfig />
      <Actions />
    </BasePage>
  )
}

export default Settings
