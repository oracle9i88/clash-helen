/**
 * ProxyURIParser — ported from ClashEcho's ProxyURIParser.swift
 *
 * Parses single proxy URIs into mihomo-compatible proxy config objects.
 * Supported formats:
 *   vmess://    — base64-encoded JSON
 *   vless://    — RFC 3986 URI
 *   trojan://   — RFC 3986 URI
 *   ss://       — ShadowSocks SIP002 or legacy base64
 *   hysteria2:// / hy2://
 *   tuic://
 */

import { createLogger } from '../utils/logger'

const log = createLogger('ProxyURIParser')

export type ProxyType = 'vmess' | 'vless' | 'trojan' | 'ss' | 'hysteria2' | 'tuic'

export interface ParsedProxy {
  name: string
  type: ProxyType
  server: string
  port: number
  [key: string]: unknown
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export function parseProxyURIs(text: string): ParsedProxy[] {
  const results: ParsedProxy[] = []
  const lines = text
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter(Boolean)

  for (const line of lines) {
    try {
      const proxy = parseOne(line)
      if (proxy) results.push(proxy)
    } catch (e) {
      log.warn(`Failed to parse URI: ${line.slice(0, 60)}`, e)
    }
  }

  return results
}

export function parseOne(uri: string): ParsedProxy | null {
  const lower = uri.toLowerCase()
  if (lower.startsWith('vmess://')) return parseVmess(uri)
  if (lower.startsWith('vless://')) return parseVless(uri)
  if (lower.startsWith('trojan://')) return parseTrojan(uri)
  if (lower.startsWith('ss://')) return parseSS(uri)
  if (lower.startsWith('hysteria2://') || lower.startsWith('hy2://')) return parseHysteria2(uri)
  if (lower.startsWith('tuic://')) return parseTuic(uri)
  return null
}

// ──────────────────────────────────────────────
// VMess
// ──────────────────────────────────────────────

function parseVmess(uri: string): ParsedProxy {
  const b64 = uri.slice('vmess://'.length)
  const json = Buffer.from(padBase64(b64), 'base64').toString('utf-8')
  const obj = JSON.parse(json) as Record<string, unknown>

  // `v` is the vmess URI JSON *version* (usually "2"), NOT the port. Only fall
  // back to 443 when no explicit port is present.
  const port = parseInt(String(obj.port || 443), 10)
  const proxy: ParsedProxy = {
    name: String(obj.ps || obj.name || `${obj.add}:${port}`),
    type: 'vmess',
    server: String(obj.add),
    port,
    uuid: String(obj.id),
    alterId: parseInt(String(obj.aid ?? 0), 10),
    cipher: String(obj.scy || obj.security || 'auto')
  }

  const net = String(obj.net || 'tcp')
  if (net === 'ws') {
    proxy.network = 'ws'
    proxy['ws-opts'] = {
      path: obj.path || '/',
      headers: obj.host ? { Host: obj.host } : undefined
    }
  } else if (net === 'grpc') {
    proxy.network = 'grpc'
    proxy['grpc-opts'] = { 'grpc-service-name': obj.path || '' }
  }

  if (obj.tls === 'tls') {
    proxy.tls = true
    if (obj.sni) proxy['servername'] = String(obj.sni)
  }

  return proxy
}

// ──────────────────────────────────────────────
// VLESS
// ──────────────────────────────────────────────

function parseVless(uri: string): ParsedProxy {
  const url = new URL(uri)
  const params = url.searchParams

  const proxy: ParsedProxy = {
    name: safeDecodeFragment(url.hash.slice(1) || `${url.hostname}:${url.port}`),
    type: 'vless',
    server: url.hostname,
    port: parseInt(url.port || '443', 10),
    uuid: url.username,
    cipher: 'none'
  }

  const security = params.get('security') || 'none'
  if (security === 'tls' || security === 'reality') {
    proxy.tls = true
    if (params.get('sni')) proxy['servername'] = params.get('sni')!
    if (params.get('fp')) proxy['client-fingerprint'] = params.get('fp')!
    if (security === 'reality') {
      proxy['reality-opts'] = {
        'public-key': params.get('pbk') || '',
        'short-id': params.get('sid') || ''
      }
    }
  }

  const flow = params.get('flow')
  if (flow) proxy.flow = flow

  const type = params.get('type') || 'tcp'
  if (type === 'ws') {
    proxy.network = 'ws'
    proxy['ws-opts'] = {
      path: params.get('path') || '/',
      headers: params.get('host') ? { Host: params.get('host') } : undefined
    }
  } else if (type === 'grpc') {
    proxy.network = 'grpc'
    proxy['grpc-opts'] = { 'grpc-service-name': params.get('serviceName') || '' }
  }

  return proxy
}

// ──────────────────────────────────────────────
// Trojan
// ──────────────────────────────────────────────

function parseTrojan(uri: string): ParsedProxy {
  const url = new URL(uri)
  const params = url.searchParams

  const proxy: ParsedProxy = {
    name: decodeURIComponent(url.hash.slice(1) || `${url.hostname}:${url.port}`),
    type: 'trojan',
    server: url.hostname,
    port: parseInt(url.port || '443', 10),
    password: decodeURIComponent(url.username),
    tls: true
  }

  if (params.get('sni')) proxy['sni'] = params.get('sni')!
  if (params.get('alpn')) proxy['alpn'] = params.get('alpn')!.split(',')

  const type = params.get('type') || 'tcp'
  if (type === 'ws') {
    proxy.network = 'ws'
    proxy['ws-opts'] = {
      path: params.get('path') || '/',
      headers: params.get('host') ? { Host: params.get('host') } : undefined
    }
  }

  return proxy
}

// ──────────────────────────────────────────────
// ShadowSocks — SIP002 and legacy
// ──────────────────────────────────────────────

function parseSS(uri: string): ParsedProxy {
  // SIP002: ss://BASE64(method:password)@host:port[#name]
  // or:     ss://BASE64(method:password@host:port)[#name]
  const withoutScheme = uri.slice('ss://'.length)
  const hashIdx = withoutScheme.indexOf('#')
  const name = hashIdx >= 0 ? decodeURIComponent(withoutScheme.slice(hashIdx + 1)) : ''
  const main = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme

  // Try SIP002 format first
  const atIdx = main.lastIndexOf('@')
  if (atIdx >= 0) {
    const userInfo = main.slice(0, atIdx)
    const hostPort = main.slice(atIdx + 1)
    const [host, portStr] = splitHostPort(hostPort)
    const decoded = safeDecode(userInfo)
    const colonIdx = decoded.indexOf(':')
    const method = decoded.slice(0, colonIdx)
    const password = decoded.slice(colonIdx + 1)

    return {
      name: name || `${host}:${portStr}`,
      type: 'ss',
      server: host,
      port: parseInt(portStr, 10),
      cipher: method,
      password
    }
  }

  // Legacy: ss://BASE64(method:password@host:port)
  const decoded = Buffer.from(padBase64(main), 'base64').toString('utf-8')
  const url = new URL('ss://' + decoded)
  return {
    name: name || `${url.hostname}:${url.port}`,
    type: 'ss',
    server: url.hostname,
    port: parseInt(url.port, 10),
    cipher: url.username,
    password: decodeURIComponent(url.password)
  }
}

// ──────────────────────────────────────────────
// Hysteria 2
// ──────────────────────────────────────────────

function parseHysteria2(uri: string): ParsedProxy {
  // Manual parsing: passwords commonly contain raw '%', '@' or ':' which break
  // `new URL()` (throws on invalid percent-encoding) or silently split into
  // username/password parts. Split on the LAST '@' and treat everything before
  // it as the raw credential, exactly like the URI producer intended.
  const withoutScheme = uri.replace(/^hysteria2:\/\//i, '').replace(/^hy2:\/\//i, '')

  // Split off the fragment (#name) first — it can contain '@'
  const hashIdx = withoutScheme.indexOf('#')
  const fragment = hashIdx >= 0 ? withoutScheme.slice(hashIdx + 1) : ''
  const main = hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme

  // Split off query params (?sni=...) — credentials can contain '?' too in
  // theory, but real-world hy2 URIs put the query after the host:port
  const queryIdx = main.indexOf('?')
  const query = queryIdx >= 0 ? main.slice(queryIdx + 1) : ''
  const beforeQuery = queryIdx >= 0 ? main.slice(0, queryIdx) : main

  // Split credential@host:port on the LAST '@' so passwords may contain '@'
  const atIdx = beforeQuery.lastIndexOf('@')
  const password = atIdx >= 0 ? beforeQuery.slice(0, atIdx) : ''
  const hostPort = atIdx >= 0 ? beforeQuery.slice(atIdx + 1) : beforeQuery

  // IPv6: [::1]:443
  let server: string
  let portStr: string
  if (hostPort.startsWith('[')) {
    const closeIdx = hostPort.indexOf(']')
    server = hostPort.slice(1, closeIdx)
    portStr = hostPort.slice(closeIdx + 2) // skip ']:'
  } else {
    const lastColon = hostPort.lastIndexOf(':')
    if (lastColon === -1) {
      // No port at all — whole thing is the host, default port applies
      server = hostPort
      portStr = ''
    } else {
      server = hostPort.slice(0, lastColon)
      portStr = hostPort.slice(lastColon + 1)
    }
  }

  const params = new URLSearchParams(query)

  const proxy: ParsedProxy = {
    name: safeDecodeFragment(fragment) || `${server}:${portStr}`,
    type: 'hysteria2',
    server,
    port: parseInt(portStr || '443', 10),
    password
  }

  if (params.get('sni')) proxy.sni = params.get('sni')!
  if (params.get('insecure') === '1') proxy['skip-cert-verify'] = true
  if (params.get('obfs')) proxy.obfs = params.get('obfs')!
  if (params.get('obfs-password')) proxy['obfs-password'] = params.get('obfs-password')!
  if (params.get('up')) proxy.up = params.get('up')!
  if (params.get('down')) proxy.down = params.get('down')!

  return proxy
}

function safeDecodeFragment(s: string): string {
  if (!s) return ''
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// ──────────────────────────────────────────────
// TUIC
// ──────────────────────────────────────────────

function parseTuic(uri: string): ParsedProxy {
  const url = new URL(uri)
  const params = url.searchParams

  const proxy: ParsedProxy = {
    name: decodeURIComponent(url.hash.slice(1) || `${url.hostname}:${url.port}`),
    type: 'tuic',
    server: url.hostname,
    port: parseInt(url.port || '443', 10),
    uuid: url.username,
    password: decodeURIComponent(url.password || ''),
    'congestion-controller': params.get('congestion_control') || 'bbr',
    'udp-relay-mode': params.get('udp_relay_mode') || 'native'
  }

  if (params.get('sni')) proxy.sni = params.get('sni')!
  if (params.get('alpn')) proxy.alpn = params.get('alpn')!.split(',')
  if (params.get('disable_sni') === '1') proxy['disable-sni'] = true
  if (params.get('allow_insecure') === '1') proxy['skip-cert-verify'] = true

  return proxy
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function padBase64(s: string): string {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  return s
}

function safeDecode(s: string): string {
  try {
    return Buffer.from(padBase64(s), 'base64').toString('utf-8')
  } catch {
    return s
  }
}

function splitHostPort(hostPort: string): [string, string] {
  const lastColon = hostPort.lastIndexOf(':')
  return [hostPort.slice(0, lastColon), hostPort.slice(lastColon + 1)]
}
