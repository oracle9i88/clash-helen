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

  const port = parseInt(String(obj.port || obj.v || 443), 10)
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
    name: decodeURIComponent(url.hash.slice(1) || `${url.hostname}:${url.port}`),
    type: 'vless',
    server: url.hostname,
    port: parseInt(url.port, 10),
    uuid: url.username,
    cipher: 'none'
  }

  const security = params.get('security') || 'none'
  if (security === 'tls' || security === 'reality') {
    proxy.tls = true
    const sni = params.get('sni')
    const fingerprint = params.get('fp')
    if (sni) proxy['servername'] = sni
    if (fingerprint) proxy['client-fingerprint'] = fingerprint
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

  const sni = params.get('sni')
  const alpn = params.get('alpn')
  if (sni) proxy['sni'] = sni
  if (alpn) proxy['alpn'] = alpn.split(',')

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
  const normalized = uri.replace(/^hy2:\/\//, 'hysteria2://')
  const url = new URL(normalized)
  const params = url.searchParams

  const proxy: ParsedProxy = {
    name: decodeURIComponent(url.hash.slice(1) || `${url.hostname}:${url.port}`),
    type: 'hysteria2',
    server: url.hostname,
    port: parseInt(url.port || '443', 10),
    password: decodeURIComponent(url.username || url.password || '')
  }

  const sni = params.get('sni')
  const obfs = params.get('obfs')
  const obfsPassword = params.get('obfs-password')
  const up = params.get('up')
  const down = params.get('down')
  if (sni) proxy.sni = sni
  if (params.get('insecure') === '1') proxy['skip-cert-verify'] = true
  if (obfs) proxy.obfs = obfs
  if (obfsPassword) proxy['obfs-password'] = obfsPassword
  if (up) proxy.up = up
  if (down) proxy.down = down

  return proxy
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

  const sni = params.get('sni')
  const alpn = params.get('alpn')
  if (sni) proxy.sni = sni
  if (alpn) proxy.alpn = alpn.split(',')
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
