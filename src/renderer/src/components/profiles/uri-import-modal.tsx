/**
 * URIImportModal — Paste-and-import for vmess/vless/trojan/ss/hysteria2/tuic URIs
 *
 * Design inspiration: ClashEcho's ProfilesView URI import flow
 */

import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Textarea,
  Chip,
  Divider
} from '@heroui/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MdContentPaste, MdCheckCircle, MdError } from 'react-icons/md'
import { addProfileItem } from '@renderer/utils/ipc'
import { toast } from '@renderer/components/base/toast'

interface Props {
  open: boolean
  onClose: () => void
  onImported: () => void
}

type Protocol = 'vmess' | 'vless' | 'trojan' | 'ss' | 'hysteria2' | 'hy2' | 'tuic' | 'unknown'

interface DetectedURI {
  protocol: Protocol
  name: string
  raw: string
}

const PROTOCOL_COLORS: Record<Protocol, 'primary' | 'success' | 'warning' | 'danger' | 'default'> =
  {
    vmess: 'primary',
    vless: 'success',
    trojan: 'warning',
    ss: 'default',
    hysteria2: 'danger',
    hy2: 'danger',
    tuic: 'primary',
    unknown: 'default'
  }

function detectURIs(text: string): DetectedURI[] {
  const lines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.map((line) => {
    const lower = line.toLowerCase()
    let protocol: Protocol = 'unknown'
    if (lower.startsWith('vmess://')) protocol = 'vmess'
    else if (lower.startsWith('vless://')) protocol = 'vless'
    else if (lower.startsWith('trojan://')) protocol = 'trojan'
    else if (lower.startsWith('ss://')) protocol = 'ss'
    else if (lower.startsWith('hysteria2://')) protocol = 'hysteria2'
    else if (lower.startsWith('hy2://')) protocol = 'hy2'
    else if (lower.startsWith('tuic://')) protocol = 'tuic'

    // Extract name from fragment
    let name = ''
    try {
      const hashIdx = line.indexOf('#')
      name = hashIdx >= 0 ? decodeURIComponent(line.slice(hashIdx + 1)) : ''
    } catch {}
    if (!name) {
      try {
        const url = new URL(line)
        name = `${url.hostname}:${url.port}`
      } catch {}
    }

    return { protocol, name: name || line.slice(0, 40), raw: line }
  })
}

const URIImportModal: React.FC<Props> = ({ open, onClose, onImported }) => {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)

  const detected = detectURIs(text)
  const validCount = detected.filter((u) => u.protocol !== 'unknown').length

  const handlePaste = async (): Promise<void> => {
    try {
      const clip = await navigator.clipboard.readText()
      setText(clip)
    } catch {
      toast.error(t('common.error.default'))
    }
  }

  const handleImport = async (): Promise<void> => {
    if (!text.trim() || validCount === 0) return
    setImporting(true)
    try {
      await addProfileItem({
        name: `URI Import (${validCount} proxies)`,
        type: 'local',
        url: '',
        useProxy: false,
        rawContent: text
      })
      toast.success(t('profiles.uri.importSuccess', { count: validCount }))
      onImported()
      onClose()
      setText('')
    } catch (e) {
      toast.error(t('common.error.addProfileFailed'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal isOpen={open} onOpenChange={(v) => !v && onClose()} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          {t('profiles.uri.title', 'Import Proxy URIs')}
          <p className="text-sm font-normal text-default-500">
            {t(
              'profiles.uri.subtitle',
              'Paste vmess/vless/trojan/ss/hysteria2/tuic URIs, one per line'
            )}
          </p>
        </ModalHeader>

        <ModalBody>
          <div className="flex gap-2 mb-2">
            <Button size="sm" variant="flat" startContent={<MdContentPaste />} onPress={handlePaste}>
              {t('common.paste', 'Paste from Clipboard')}
            </Button>
          </div>

          <Textarea
            value={text}
            onValueChange={setText}
            minRows={6}
            maxRows={14}
            placeholder={`vmess://eyJ2IjoiMiIsInBzIjoiTXlTZXJ2ZXIiLCJhZGQiOiIxLjIuMy40IiwicG9ydCI6IjQ0MyIsInR5cGUiOiJub25lIiwiaWQiOiJ1dWlkIiwiYWlkIjoiMCIsIm5ldCI6IndzIiwicGF0aCI6Ii8iLCJob3N0IjoiIiwidGxzIjoidGxzIn0=
vless://uuid@1.2.3.4:443?encryption=none&security=reality&sni=example.com#MyNode
trojan://password@1.2.3.4:443#TrojanNode
ss://YWVzLTEyOC1nY206cGFzc3dvcmQ=@1.2.3.4:8388#SSNode
hysteria2://password@1.2.3.4:443?sni=example.com#HY2Node`}
            classNames={{ input: 'font-mono text-xs' }}
          />

          {detected.length > 0 && (
            <>
              <Divider className="my-2" />
              <div className="flex items-center gap-2 mb-2">
                {validCount > 0 ? (
                  <MdCheckCircle className="text-success text-lg" />
                ) : (
                  <MdError className="text-danger text-lg" />
                )}
                <span className="text-sm">
                  {t('profiles.uri.detected', {
                    valid: validCount,
                    total: detected.length,
                    defaultValue: `Detected ${validCount} valid / ${detected.length} lines`
                  })}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {detected.slice(0, 30).map((u, i) => (
                  <Chip
                    key={i}
                    size="sm"
                    color={PROTOCOL_COLORS[u.protocol]}
                    variant={u.protocol === 'unknown' ? 'flat' : 'solid'}
                    className="text-xs"
                  >
                    {u.protocol !== 'unknown' ? `[${u.protocol}] ` : ''}
                    {u.name.slice(0, 24)}
                  </Chip>
                ))}
                {detected.length > 30 && (
                  <Chip size="sm" variant="flat">
                    +{detected.length - 30} more
                  </Chip>
                )}
              </div>
            </>
          )}
        </ModalBody>

        <ModalFooter>
          <Button variant="light" onPress={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            color="primary"
            isDisabled={validCount === 0}
            isLoading={importing}
            onPress={handleImport}
          >
            {t('profiles.uri.import', { count: validCount, defaultValue: `Import (${validCount})` })}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}

export default URIImportModal
