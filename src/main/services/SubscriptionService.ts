/**
 * SubscriptionService — inspired by ClashEcho's SubscriptionFetcher + ProfileManager
 *
 * Handles fetching, parsing and storing subscription profiles.
 * Supports:
 *   - Remote URL (Clash YAML, base64 URI list)
 *   - Pasted URI list (vmess/vless/trojan/ss/hysteria2/tuic)
 *   - Local file import
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import axios from 'axios'
import { parse, stringify } from '../utils/yaml'
import { profilesDir, profilePath } from '../utils/dirs'
import { parseProxyURIs, ParsedProxy } from './ProxyURIParser'
import { createLogger } from '../utils/logger'

const log = createLogger('SubscriptionService')

const DEFAULT_UA = 'ClashHelen/1.0 (Ubuntu; Mihomo)'

export interface FetchOptions {
  useProxy?: boolean
  userAgent?: string
  authToken?: string
  timeout?: number
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Fetch a remote subscription URL and return raw text.
 * Respects the app's proxy settings when useProxy=true.
 */
export async function fetchSubscription(url: string, opts: FetchOptions = {}): Promise<string> {
  const { userAgent = DEFAULT_UA, authToken, timeout = 30000 } = opts

  // Read the live mixed-port instead of hardcoding 7890: users who changed the
  // port in settings got a dead proxy fallback for "update via proxy".
  let proxyPort = 7890
  try {
    const { getControledMihomoConfig } = await import('../config/controledMihomo')
    const { 'mixed-port': mixedPort } = await getControledMihomoConfig()
    if (typeof mixedPort === 'number' && mixedPort > 0) proxyPort = mixedPort
  } catch {
    // config not ready — keep default
  }

  const proxyConfig = opts.useProxy ? { host: '127.0.0.1', port: proxyPort } : undefined

  const headers: Record<string, string> = { 'User-Agent': userAgent }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`

  const resp = await axios.get<string>(url, {
    headers,
    timeout,
    responseType: 'text',
    proxy: proxyConfig
      ? { host: proxyConfig.host, port: proxyConfig.port, protocol: 'http' }
      : false,
    maxRedirects: 5
  })

  return resp.data
}

/**
 * Parse subscription content into a mihomo-compatible YAML config string.
 * Handles three content types:
 *   1. Valid Clash YAML (has `proxies:` key)
 *   2. Base64-encoded URI list
 *   3. Raw URI lines (vmess://, vless://, …)
 */
export function parseSubscriptionContent(raw: string): string {
  const trimmed = raw.trim()

  // 1. Already a Clash YAML
  if (isClashYaml(trimmed)) {
    return normalizeClashYaml(trimmed)
  }

  // 2. Base64 blob
  if (isBase64(trimmed)) {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8')
      if (isClashYaml(decoded)) return normalizeClashYaml(decoded)
      return uriListToYaml(decoded)
    } catch {
      // fall through
    }
  }

  // 3. Raw URI lines
  return uriListToYaml(trimmed)
}

/**
 * Write parsed content to a profile file on disk.
 */
export async function saveProfileContent(id: string, content: string): Promise<void> {
  const dir = profilesDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(profilePath(id), content, 'utf-8')
  log.info(`Profile ${id} saved (${content.length} bytes)`)
}

/**
 * Read a profile file from disk and return raw YAML string.
 */
export async function loadProfileContent(id: string): Promise<string> {
  return readFile(profilePath(id), 'utf-8')
}

/**
 * Validate that a YAML string is a parseable mihomo config.
 */
export function validateProfileYaml(yaml: string): { valid: boolean; error?: string } {
  try {
    const obj = parse(yaml)
    if (typeof obj !== 'object' || obj === null) {
      return { valid: false, error: 'Config root must be a YAML object' }
    }
    return { valid: true }
  } catch (e) {
    return { valid: false, error: String(e) }
  }
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

function isClashYaml(text: string): boolean {
  return (
    text.includes('proxies:') || text.includes('proxy-groups:') || text.includes('proxy-providers:')
  )
}

function isBase64(text: string): boolean {
  // A single-line base64 blob — no spaces, only base64 chars
  const singleLine = text.replace(/\s/g, '')
  return /^[A-Za-z0-9+/=]{20,}$/.test(singleLine) && !singleLine.includes('://')
}

function normalizeClashYaml(yaml: string): string {
  try {
    const obj = parse(yaml) as Record<string, unknown>
    // Ensure proxies is an array
    if (!Array.isArray(obj.proxies)) {
      obj.proxies = []
    }
    return stringify(obj)
  } catch {
    return yaml
  }
}

function uriListToYaml(text: string): string {
  const proxies = parseProxyURIs(text)
  if (proxies.length === 0) {
    // Do NOT silently produce an empty config: the UI shows "import success"
    // while nothing landed. Surface the failure so callers can toast it.
    throw new Error(
      'No valid proxy URIs found — check that each line is a complete vmess/vless/trojan/ss/hysteria2/tuic URI'
    )
  }

  const config = buildMinimalClashConfig(proxies)
  return stringify(config)
}

function buildMinimalClashConfig(proxies: ParsedProxy[]): Record<string, unknown> {
  const names = proxies.map((p) => p.name)

  return {
    'mixed-port': 7890,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    proxies,
    'proxy-groups': [
      {
        name: 'PROXY',
        type: 'select',
        proxies: ['AUTO', ...names]
      },
      {
        name: 'AUTO',
        type: 'url-test',
        proxies: names,
        url: 'https://www.gstatic.com/generate_204',
        interval: 300,
        tolerance: 50
      }
    ],
    rules: ['GEOIP,CN,DIRECT', 'GEOIP,private,DIRECT', 'MATCH,PROXY']
  }
}
