type RuntimeConfigPayload = {
  apiBaseUrl?: unknown
  demoMode?: unknown
  wsBaseUrl?: unknown
}

export type RuntimeConfig = {
  apiBaseUrl: string
  demoMode: boolean
  wsBaseUrl: string
}

const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBaseUrl: '',
  demoMode: false,
  wsBaseUrl: ''
}

let runtimeConfig: RuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG }

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function normalizeBaseUrl(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  return trimTrailingSlash(trimmed)
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }
    if (normalized === 'false') {
      return false
    }
  }
  return fallback
}

function normalizePath(path: string) {
  if (path.startsWith('/')) {
    return path
  }
  return `/${path}`
}

function joinPath(base: string, path: string) {
  const normalizedPath = normalizePath(path)
  if (!base) {
    return normalizedPath
  }
  return `${trimTrailingSlash(base)}${normalizedPath}`
}

function toWsOrigin(value: string) {
  if (value.startsWith('ws://') || value.startsWith('wss://')) {
    return trimTrailingSlash(value)
  }
  if (value.startsWith('http://')) {
    return `ws://${value.slice('http://'.length).replace(/\/+$/, '')}`
  }
  if (value.startsWith('https://')) {
    return `wss://${value.slice('https://'.length).replace(/\/+$/, '')}`
  }
  return value
}

function resolveSameOriginWsUrl(basePath: string, path: string) {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.host
  return `${protocol}://${host}${joinPath(basePath, path)}`
}

export async function loadRuntimeConfig() {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}runtime-config.json`, { cache: 'no-store' })
    if (!response.ok) {
      return
    }

    const payload = await response.json() as RuntimeConfigPayload
    runtimeConfig = {
      apiBaseUrl: normalizeBaseUrl(payload.apiBaseUrl),
      demoMode: readBoolean(payload.demoMode, false),
      wsBaseUrl: normalizeBaseUrl(payload.wsBaseUrl)
    }
  } catch {
    // Keep default config when runtime config is missing or malformed.
  }
}

export function resolveApiUrl(path: string) {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return joinPath(runtimeConfig.apiBaseUrl, path)
}

export function resolveWsUrl(path: string) {
  if (path.startsWith('ws://') || path.startsWith('wss://')) {
    return path
  }

  if (runtimeConfig.wsBaseUrl) {
    const normalizedWsBase = toWsOrigin(runtimeConfig.wsBaseUrl)
    if (normalizedWsBase.startsWith('/')) {
      return resolveSameOriginWsUrl(normalizedWsBase, path)
    }
    return joinPath(normalizedWsBase, path)
  }

  if (runtimeConfig.apiBaseUrl) {
    const derivedWsBase = toWsOrigin(runtimeConfig.apiBaseUrl)
    if (derivedWsBase.startsWith('/')) {
      return resolveSameOriginWsUrl(derivedWsBase, path)
    }
    if (derivedWsBase.startsWith('ws://') || derivedWsBase.startsWith('wss://')) {
      return joinPath(derivedWsBase, path)
    }
  }

  return resolveSameOriginWsUrl('', path)
}

export function isDemoMode() {
  return runtimeConfig.demoMode
}
