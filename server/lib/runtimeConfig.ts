import fs from 'node:fs/promises'
import path from 'node:path'

import {
  AUTO_MYWORK_CANDIDATES,
  DEFAULT_SOURCES_CONFIG_PATH,
  DEFAULT_WORK_MANIFEST_PATH,
  LOCAL_GUIDE_SOURCES_ROOT,
  LOCAL_QUESTION_BANK_SOURCES_ROOT,
  ROOT_DIR,
  RUNTIME_SOURCES_CONFIG_PATH,
  RUNTIME_WORK_MANIFEST_PATH
} from './constants.js'

export type SourceKind = 'guide' | 'question_bank' | 'work_root'
export type SourceType = 'git' | 'local'

export type OfferLoomSource = {
  branch?: string
  id: string
  kind: SourceKind
  path?: string
  type: SourceType
  url?: string
}

export type OfferLoomWorkSource = OfferLoomSource & {
  kind: 'work_root'
  manifestPath?: string
  supplementalRoots?: string[]
}

export type OfferLoomSourcesConfig = {
  guides: OfferLoomSource[]
  myWork: OfferLoomWorkSource
  questionBanks: OfferLoomSource[]
}

export type SourcesSettingsSnapshot = {
  autoDetectedMyWorkPath: string | null
  config: OfferLoomSourcesConfig
  defaultConfig: OfferLoomSourcesConfig
  discoveredSources: {
    guides: OfferLoomSource[]
    questionBanks: OfferLoomSource[]
  }
  initialized: boolean
  paths: {
    runtimeConfigPath: string
    runtimeManifestPath: string
  }
}

const EMPTY_MANIFEST = { projects: [] }

export async function readSourcesSettingsSnapshot(): Promise<SourcesSettingsSnapshot> {
  const discoveredSources = await discoverLocalSources()
  const defaultConfig = mergeWithDiscoveredSources(
    normalizeSourcesConfig(await readJson<OfferLoomSourcesConfig>(DEFAULT_SOURCES_CONFIG_PATH)),
    discoveredSources
  )
  const initialized = await fileExists(RUNTIME_SOURCES_CONFIG_PATH)
  const configured = initialized
    ? normalizeSourcesConfig(await readJson<OfferLoomSourcesConfig>(RUNTIME_SOURCES_CONFIG_PATH))
    : defaultConfig
  const baseConfig = mergeWithDiscoveredSources(configured, discoveredSources)
  const autoDetectedMyWorkPath = await detectAutoMyWorkPath(baseConfig)
  const effectiveConfig = autoDetectedMyWorkPath && !initialized
    ? {
        ...baseConfig,
        myWork: {
          ...baseConfig.myWork,
          path: path.relative(ROOT_DIR, autoDetectedMyWorkPath)
        }
      }
    : baseConfig

  return {
    autoDetectedMyWorkPath,
    config: effectiveConfig,
    defaultConfig,
    discoveredSources,
    initialized,
    paths: {
      runtimeConfigPath: RUNTIME_SOURCES_CONFIG_PATH,
      runtimeManifestPath: RUNTIME_WORK_MANIFEST_PATH
    }
  }
}

export async function saveRuntimeSourcesConfig(input: OfferLoomSourcesConfig) {
  const normalized = normalizeSourcesConfig(input)
  validateSourcesConfig(normalized)

  await fs.mkdir(path.dirname(RUNTIME_SOURCES_CONFIG_PATH), { recursive: true })
  await fs.writeFile(RUNTIME_SOURCES_CONFIG_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')

  const runtimeManifestPath = path.resolve(ROOT_DIR, normalized.myWork.manifestPath ?? './config/work-manifest.runtime.json')
  const manifestExists = await fileExists(runtimeManifestPath)
  if (!manifestExists) {
    await fs.writeFile(runtimeManifestPath, `${JSON.stringify(EMPTY_MANIFEST, null, 2)}\n`, 'utf8')
  }

  return normalized
}

export async function ensureRuntimeManifest() {
  const runtimeManifestExists = await fileExists(RUNTIME_WORK_MANIFEST_PATH)
  if (runtimeManifestExists) {
    return
  }
  await fs.mkdir(path.dirname(RUNTIME_WORK_MANIFEST_PATH), { recursive: true })
  await fs.writeFile(RUNTIME_WORK_MANIFEST_PATH, `${JSON.stringify(EMPTY_MANIFEST, null, 2)}\n`, 'utf8')
}

async function discoverLocalSources() {
  return {
    guides: await discoverSourceDirs(LOCAL_GUIDE_SOURCES_ROOT, 'guide'),
    questionBanks: await discoverSourceDirs(LOCAL_QUESTION_BANK_SOURCES_ROOT, 'question_bank')
  }
}

function normalizeSourcesConfig(input: OfferLoomSourcesConfig | null | undefined): OfferLoomSourcesConfig {
  const guides = Array.isArray(input?.guides)
    ? input.guides.map((item, index) => normalizeSource(item, 'guide', `guide-${index + 1}`))
    : []
  const questionBanks = Array.isArray(input?.questionBanks)
    ? input.questionBanks.map((item, index) => normalizeSource(item, 'question_bank', `question-bank-${index + 1}`))
    : []
  const fallbackWork = normalizeWorkSource(input?.myWork)

  return {
    guides,
    myWork: fallbackWork,
    questionBanks
  }
}

function mergeWithDiscoveredSources(
  config: OfferLoomSourcesConfig,
  discovered: { guides: OfferLoomSource[]; questionBanks: OfferLoomSource[] }
) {
  return {
    ...config,
    guides: mergeSourceList(config.guides, discovered.guides),
    questionBanks: mergeSourceList(config.questionBanks, discovered.questionBanks)
  }
}

function normalizeSource(input: Partial<OfferLoomSource> | null | undefined, kind: SourceKind, fallbackId: string): OfferLoomSource {
  const type = input?.type === 'git' ? 'git' : 'local'
  const id = sanitizeId(input?.id || inferSourceId(input) || fallbackId)
  return {
    branch: cleanOptionalString(input?.branch) ?? 'main',
    id,
    kind,
    path: type === 'local' ? cleanOptionalString(input?.path) ?? '' : undefined,
    type,
    url: type === 'git' ? cleanOptionalString(input?.url) ?? '' : undefined
  }
}

function normalizeWorkSource(input: Partial<OfferLoomWorkSource> | null | undefined): OfferLoomWorkSource {
  const normalized = normalizeSource(input as Partial<OfferLoomSource>, 'work_root', 'candidate-workspace')
  return {
    ...normalized,
    kind: 'work_root',
    manifestPath: cleanOptionalString(input?.manifestPath) ?? './config/work-manifest.runtime.json',
    supplementalRoots: Array.isArray(input?.supplementalRoots)
      ? input.supplementalRoots.map((item) => cleanOptionalString(item)).filter((item): item is string => Boolean(item))
      : []
  }
}

function validateSourcesConfig(config: OfferLoomSourcesConfig) {
  const totalSources = config.guides.length + config.questionBanks.length + 1
  if (totalSources <= 0) {
    throw new Error('至少需要保留一类数据源')
  }

  const invalid = [
    ...config.guides,
    ...config.questionBanks,
    config.myWork
  ].find((source) => {
    if (source.type === 'git') {
      return !source.url?.trim()
    }
    return !source.path?.trim()
  })

  if (invalid) {
    throw new Error(`来源 ${invalid.id} 缺少 ${invalid.type === 'git' ? 'git 地址' : '本地路径'}`)
  }

  const ids = [
    ...config.guides.map((item) => item.id),
    ...config.questionBanks.map((item) => item.id),
    config.myWork.id
  ]
  if (new Set(ids).size !== ids.length) {
    throw new Error('来源 id 需要唯一，请修改重复项')
  }
}

async function detectAutoMyWorkPath(config: OfferLoomSourcesConfig) {
  if (config.myWork.type !== 'local') {
    return null
  }
  const currentPath = path.resolve(ROOT_DIR, config.myWork.path ?? '')
  let readmeOnlyFallback: string | null = null

  for (const candidatePath of AUTO_MYWORK_CANDIDATES) {
    if (!(await fileExists(candidatePath))) {
      continue
    }
    if (currentPath === candidatePath) {
      return candidatePath
    }

    const entries = await fs.readdir(candidatePath, { withFileTypes: true }).catch(() => [])
    const hasProjectDirs = entries.some((entry) => entry.isDirectory())
    const hasAdditionalFiles = entries.some((entry) => (
      entry.isFile() && entry.name.toLowerCase() !== 'readme.md' && /\.(md|txt|ipynb|pdf)$/i.test(entry.name)
    ))
    if (hasProjectDirs || hasAdditionalFiles) {
      return candidatePath
    }

    if (!readmeOnlyFallback && entries.some((entry) => entry.isFile() && entry.name.toLowerCase() === 'readme.md')) {
      readmeOnlyFallback = candidatePath
    }
  }

  return readmeOnlyFallback
}

async function discoverSourceDirs(rootPath: string, kind: SourceKind) {
  if (!(await fileExists(rootPath))) {
    return []
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const absolutePath = path.join(rootPath, entry.name)
      return normalizeSource({
        id: entry.name,
        kind,
        path: path.relative(ROOT_DIR, absolutePath),
        type: 'local'
      }, kind, entry.name)
    })
    .sort((left, right) => left.id.localeCompare(right.id, 'en'))
}

function mergeSourceList(explicit: OfferLoomSource[], discovered: OfferLoomSource[]) {
  const merged = [...explicit]
  const seen = new Set(explicit.map((source) => sourceMergeKey(source)))
  const seenIds = new Set(explicit.map((source) => source.id))

  for (const source of discovered) {
    const key = sourceMergeKey(source)
    if (seen.has(key) || seenIds.has(source.id)) {
      continue
    }
    seen.add(key)
    seenIds.add(source.id)
    merged.push(source)
  }

  return merged
}

function sourceMergeKey(source: OfferLoomSource) {
  return [
    source.id,
    source.type,
    source.path ? path.resolve(ROOT_DIR, source.path) : '',
    source.url ?? ''
  ].join('::')
}

async function readJson<T>(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function cleanOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function inferSourceId(input: Partial<OfferLoomSource> | null | undefined) {
  return cleanOptionalString(input?.id)
    ?? cleanOptionalString(input?.url?.split('/').pop()?.replace(/\.git$/i, ''))
    ?? cleanOptionalString(input?.path?.split('/').pop())
    ?? null
}

function sanitizeId(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'source'
}

export const WORK_MANIFEST_FALLBACK_PATH = DEFAULT_WORK_MANIFEST_PATH
