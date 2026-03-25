import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import fg from 'fast-glob'
import matter from 'gray-matter'

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(new URL(import.meta.url))), '..')
export const DATA_DIR = path.join(ROOT_DIR, 'data')
export const SOURCES_DIR = path.join(DATA_DIR, 'sources')
export const GENERATED_DIR = path.join(DATA_DIR, 'generated')
export const DB_PATH = process.env.OFFERLOOM_DB_PATH
  ? path.resolve(ROOT_DIR, process.env.OFFERLOOM_DB_PATH)
  : path.join(DATA_DIR, 'offerloom.db')
export const DEFAULT_CONFIG_PATH = path.join(ROOT_DIR, 'config', 'sources.json')
export const DEFAULT_WORK_MANIFEST_PATH = path.join(ROOT_DIR, 'config', 'work-manifest.json')
export const RUNTIME_CONFIG_PATH = path.join(ROOT_DIR, 'config', 'sources.runtime.json')
export const RUNTIME_WORK_MANIFEST_PATH = path.join(ROOT_DIR, 'config', 'work-manifest.runtime.json')
export const SKILLS_DIR = path.join(ROOT_DIR, 'skills')
export const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'answer-package.schema.json')
export const LOCAL_SOURCES_ROOT = path.join(ROOT_DIR, 'sources')
export const LOCAL_GUIDE_SOURCES_ROOT = path.join(LOCAL_SOURCES_ROOT, 'documents')
export const LOCAL_QUESTION_BANK_SOURCES_ROOT = path.join(LOCAL_SOURCES_ROOT, 'question-banks')
export const AUTO_MYWORK_CANDIDATES = [
  path.join(ROOT_DIR, 'mywork'),
  path.resolve(ROOT_DIR, '..', '..', 'mywork')
]

const GUIDE_EXTENSIONS = ['md', 'mdx', 'txt', 'markdown']
const WORK_EXTENSIONS = [
  'md', 'mdx', 'txt', 'rst', 'py', 'ipynb', 'ts', 'tsx', 'js', 'jsx',
  'json', 'yml', 'yaml', 'toml', 'pdf', 'c', 'cc', 'cpp', 'h', 'hpp',
  'java', 'go', 'rs', 'sh', 'bash'
]
const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'between', 'by', 'can', 'do', 'does', 'for', 'from',
  'how', 'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'use', 'used', 'vs', 'what', 'when',
  'where', 'which', 'why', 'with', 'would', 'you', 'your'
])
const CHINESE_STOPWORDS = new Set([
  '什么', '如何', '为什么', '怎么', '怎样', '区别', '原理', '是否', '优缺点', '场景', '流程', '步骤', '挑战'
])
const QUESTION_CANONICAL_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'between', 'does', 'difference', 'different', 'do', 'explain', 'how',
  'in', 'is', 'it', 'its', 'of', 'the', 'their', 'them', 'to', 'used', 'what', 'where', 'why'
])
const IGNORE_DIRS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.venv/**',
  '**/venv/**',
  '**/__pycache__/**',
  '**/.mypy_cache/**',
  '**/.pytest_cache/**',
  '**/.idea/**',
  '**/.vscode/**'
]
const execFileAsync = promisify(execFile)

export function resolveConfigPath(configEnvKey, fallbackPath) {
  const configuredPath = process.env[configEnvKey]
  return configuredPath ? path.resolve(ROOT_DIR, configuredPath) : fallbackPath
}

export async function readConfig() {
  const configPath = await resolveSourcesConfigPath()
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'))
  const withBundledSources = await mergeWithDiscoveredLocalSources(config)
  return autoPreferLocalMyWork(withBundledSources, configPath)
}

export async function discoverLocalSources() {
  return {
    guides: await discoverSourceDirs(LOCAL_GUIDE_SOURCES_ROOT, 'guide'),
    questionBanks: await discoverSourceDirs(LOCAL_QUESTION_BANK_SOURCES_ROOT, 'question_bank')
  }
}

export async function readWorkManifest(config = null) {
  const configuredManifest = await resolveWorkManifestPath(config)

  if (!(await pathExists(configuredManifest))) {
    return {
      projects: []
    }
  }
  return JSON.parse(await fs.readFile(configuredManifest, 'utf8'))
}

async function resolveSourcesConfigPath() {
  if (process.env.OFFERLOOM_SOURCES_CONFIG) {
    return resolveConfigPath('OFFERLOOM_SOURCES_CONFIG', DEFAULT_CONFIG_PATH)
  }
  if (await pathExists(RUNTIME_CONFIG_PATH)) {
    return RUNTIME_CONFIG_PATH
  }
  return DEFAULT_CONFIG_PATH
}

async function resolveWorkManifestPath(config = null) {
  if (config?.myWork?.manifestPath) {
    return path.resolve(ROOT_DIR, config.myWork.manifestPath)
  }
  if (process.env.OFFERLOOM_WORK_MANIFEST) {
    return resolveConfigPath('OFFERLOOM_WORK_MANIFEST', DEFAULT_WORK_MANIFEST_PATH)
  }
  if (await pathExists(RUNTIME_WORK_MANIFEST_PATH)) {
    return RUNTIME_WORK_MANIFEST_PATH
  }
  return DEFAULT_WORK_MANIFEST_PATH
}

async function discoverSourceDirs(rootPath, kind) {
  if (!(await pathExists(rootPath))) {
    return []
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const absolutePath = path.join(rootPath, entry.name)
      return {
        id: sanitizeSourceId(entry.name),
        kind,
        path: path.relative(ROOT_DIR, absolutePath),
        type: 'local'
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id, 'en'))
}

async function mergeWithDiscoveredLocalSources(config) {
  const baseConfig = {
    guides: Array.isArray(config?.guides) ? config.guides : [],
    myWork: config?.myWork,
    questionBanks: Array.isArray(config?.questionBanks) ? config.questionBanks : []
  }
  const discovered = await discoverLocalSources()

  return {
    ...baseConfig,
    guides: mergeSourceList(baseConfig.guides, discovered.guides),
    questionBanks: mergeSourceList(baseConfig.questionBanks, discovered.questionBanks)
  }
}

function mergeSourceList(explicitSources, discoveredSources) {
  const merged = [...explicitSources]
  const seenKeys = new Set(explicitSources.map((source) => sourceMergeKey(source)))
  const seenIds = new Set(explicitSources.map((source) => source?.id).filter(Boolean))

  for (const source of discoveredSources) {
    const key = sourceMergeKey(source)
    if (seenKeys.has(key) || seenIds.has(source.id)) {
      continue
    }
    seenKeys.add(key)
    seenIds.add(source.id)
    merged.push(source)
  }

  return merged
}

function sourceMergeKey(source) {
  return [
    source?.id ?? '',
    source?.type ?? '',
    source?.path ? path.resolve(ROOT_DIR, source.path) : '',
    source?.url ?? ''
  ].join('::')
}

function sanitizeSourceId(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'source'
}

export function resolveSourcePath(source) {
  if (source.type === 'git') {
    return path.join(SOURCES_DIR, source.id)
  }
  return path.resolve(ROOT_DIR, source.path)
}

export async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true })
}

export function hashContent(input) {
  return createHash('sha256').update(input).digest('hex')
}

export function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[`~!@#$%^&*()+=|{}':;',/\\[\].<>?！￥…（）【】‘；：”“。，、？]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'section'
}

export function nowIso() {
  return new Date().toISOString()
}

export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

export async function collectGuideFiles(rootPath) {
  if (!(await pathExists(rootPath))) {
    return []
  }
  const patterns = GUIDE_EXTENSIONS.map((ext) => `**/*.${ext}`)
  return fg(patterns, {
    cwd: rootPath,
    absolute: true,
    onlyFiles: true,
    dot: false,
    ignore: IGNORE_DIRS
  })
}

export async function collectWorkProjects(rootPath) {
  if (!(await pathExists(rootPath))) {
    return []
  }
  const entries = await fs.readdir(rootPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      absolutePath: path.join(rootPath, entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function collectWorkRootFiles(rootPath) {
  if (!(await pathExists(rootPath))) {
    return []
  }
  return fg(WORK_EXTENSIONS.map((ext) => `*.${ext}`), {
    cwd: rootPath,
    absolute: true,
    onlyFiles: true,
    dot: false
  })
}

export function normalizeProjectKey(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
}

export async function resolveWorkProjectSpecs(config, manifest) {
  const workRoot = resolveSourcePath(config.myWork)
  const discoveredProjects = await collectWorkProjects(workRoot)
  const byKey = new Map()

  for (const project of discoveredProjects) {
    const key = normalizeProjectKey(project.name)
    byKey.set(key, {
      name: project.name,
      primaryPath: project.absolutePath,
      supplementalPaths: [],
      manifestNotes: []
    })
  }

  const supplementalRoots = Array.isArray(config.myWork.supplementalRoots)
    ? config.myWork.supplementalRoots.map((entry) => path.resolve(ROOT_DIR, entry))
    : []

  for (const project of manifest.projects ?? []) {
    const key = normalizeProjectKey(project.name)
    const current = byKey.get(key) ?? {
      name: project.name,
      primaryPath: path.join(workRoot, project.name),
      supplementalPaths: [],
      manifestNotes: []
    }
    for (const manifestPath of project.paths ?? []) {
      current.supplementalPaths.push(path.resolve(ROOT_DIR, manifestPath))
    }
    if (project.notes) {
      current.manifestNotes.push(project.notes)
    }
    byKey.set(key, current)
  }

  for (const spec of byKey.values()) {
    for (const supplementalRoot of supplementalRoots) {
      const candidatePath = path.join(supplementalRoot, spec.name)
      spec.supplementalPaths.push(candidatePath)
    }
    spec.supplementalPaths = [...new Set(spec.supplementalPaths)]
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export async function inspectWorkProject(projectPath) {
  if (!(await pathExists(projectPath))) {
    return {
      status: 'missing',
      files: []
    }
  }

  const topEntries = await fs.readdir(projectPath, { withFileTypes: true })
  const topNames = new Set(topEntries.map((entry) => entry.name))
  const supportedIndicators = [
    'README.md',
    'README.MD',
    'readme.md',
    'package.json',
    'pyproject.toml',
    'requirements.txt',
    'setup.py',
    'src',
    'docs',
    'notes',
    'paper',
    'papers',
    'notebooks',
    'notebook',
    'code',
    'scripts',
    'src'
  ]
  const quickProbeMatches = await fg([
    '**/README.md',
    '**/README.MD',
    '**/readme.md',
    '**/package.json',
    '**/pyproject.toml',
    '**/requirements.txt',
    '**/setup.py',
    '**/*.md',
    '**/*.txt',
    '**/*.ipynb',
    '**/*.pdf'
  ], {
    cwd: projectPath,
    absolute: false,
    onlyFiles: true,
    dot: false,
    deep: 2,
    ignore: IGNORE_DIRS
  })
  const hasIndicator = supportedIndicators.some((name) => topNames.has(name)) ||
    topEntries.some((entry) => entry.isFile() && /\.(md|txt|ipynb|pdf)$/i.test(entry.name)) ||
    quickProbeMatches.length > 0

  if (!hasIndicator) {
    return {
      status: 'skipped_unrecognized',
      files: []
    }
  }

  const files = await fg(WORK_EXTENSIONS.map((ext) => `**/*.${ext}`), {
    cwd: projectPath,
    absolute: true,
    onlyFiles: true,
    dot: false,
    deep: 6,
    ignore: IGNORE_DIRS
  })

  const accepted = []
  for (const filePath of files) {
    try {
      const stat = await fs.stat(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const maxBytes = ext === '.pdf' ? 40_000_000 : 256_000
      if (stat.size > maxBytes) {
        continue
      }
      accepted.push(filePath)
      if (accepted.length >= 80) {
        break
      }
    } catch {
      continue
    }
  }

  return {
    status: accepted.length > 0 ? 'indexed' : 'skipped_empty',
    files: accepted
  }
}

async function autoPreferLocalMyWork(config, configPath) {
  if (!config?.myWork || process.env.OFFERLOOM_DISABLE_AUTO_MYWORK === '1' || process.env.OFFERLOOM_FORCE_SAMPLE_WORK === '1') {
    return config
  }

  const explicitConfig = process.env.OFFERLOOM_SOURCES_CONFIG
  if (explicitConfig && path.resolve(ROOT_DIR, explicitConfig) !== path.resolve(configPath)) {
    return config
  }

  const currentWorkRoot = resolveSourcePath(config.myWork)
  const autoDetectedMyWorkPath = await detectAutoMyWorkPath(currentWorkRoot)
  if (!autoDetectedMyWorkPath || currentWorkRoot === autoDetectedMyWorkPath) {
    return config
  }

  return {
    ...config,
    myWork: {
      ...config.myWork,
      path: path.relative(ROOT_DIR, autoDetectedMyWorkPath)
    }
  }
}

async function detectAutoMyWorkPath(currentWorkRoot) {
  let readmeOnlyFallback = null

  for (const candidatePath of AUTO_MYWORK_CANDIDATES) {
    if (!(await pathExists(candidatePath))) {
      continue
    }
    if (currentWorkRoot === candidatePath) {
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

export async function inspectWorkProjectSpec(projectSpec) {
  const sources = []
  const primaryInspection = await inspectWorkProject(projectSpec.primaryPath)
  sources.push({
    kind: 'primary',
    path: projectSpec.primaryPath,
    ...primaryInspection
  })

  for (const supplementalPath of projectSpec.supplementalPaths) {
    const inspection = await inspectWorkProject(supplementalPath)
    sources.push({
      kind: 'supplemental',
      path: supplementalPath,
      ...inspection
    })
  }

  const indexedSources = sources.filter((source) => source.status === 'indexed')
  if (indexedSources.length > 0) {
    const isPrimaryIndexed = indexedSources.some((source) => source.kind === 'primary')
    return {
      status: isPrimaryIndexed ? 'indexed' : 'indexed_via_fallback',
      files: indexedSources.flatMap((source) => source.files.map((filePath) => ({
        filePath,
        originPath: source.path,
        originKind: source.kind
      }))),
      sources,
      manifestNotes: projectSpec.manifestNotes
    }
  }

  const sawRealCandidates = sources.some((source) => source.status !== 'missing')
  return {
    status: sawRealCandidates ? 'awaiting_materials' : 'missing',
    files: [],
    sources,
    manifestNotes: projectSpec.manifestNotes
  }
}

export async function readTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.ipynb') {
    return readNotebookFile(filePath)
  }
  if (ext === '.pdf') {
    return readPdfFile(filePath)
  }
  return fs.readFile(filePath, 'utf8')
}

async function readNotebookFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  const notebook = JSON.parse(raw)
  const cells = Array.isArray(notebook.cells) ? notebook.cells : []
  const cellText = cells
    .filter((cell) => cell.cell_type === 'markdown' || cell.cell_type === 'code')
    .map((cell, index) => {
      const source = Array.isArray(cell.source) ? cell.source.join('') : ''
      return `## Cell ${index + 1} (${cell.cell_type})\n${source}`
    })
    .join('\n\n')
  return cellText || raw
}

async function readPdfFile(filePath) {
  try {
    const { stdout } = await execFileAsync(
      'pdftotext',
      ['-layout', '-nopgbrk', filePath, '-'],
      { maxBuffer: 24 * 1024 * 1024 }
    )
    return stdout
      .replace(/\f/g, '\n')
      .trim()
      .slice(0, 180_000)
  } catch {
    return ''
  }
}

export function normalizeDocument(filePath, rawContent) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.md' || ext === '.mdx' || ext === '.markdown') {
    const parsed = matter(rawContent)
    return {
      title: inferTitle(filePath, parsed.content, parsed.data),
      content: parsed.content.trim(),
      frontmatter: parsed.data ?? {}
    }
  }

  return {
    title: inferTitle(filePath, rawContent, {}),
    content: rawContent.trim(),
    frontmatter: {}
  }
}

function inferTitle(filePath, content, frontmatter) {
  if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
    return frontmatter.title.trim()
  }
  const firstHeading = content.split(/\r?\n/).find((line) => /^#\s+/.test(line.trim()))
  if (firstHeading) {
    return firstHeading.replace(/^#\s+/, '').trim()
  }
  const plainTextTitle = inferPlainTextTitle(content)
  if (plainTextTitle) {
    return plainTextTitle
  }
  return path.basename(filePath, path.extname(filePath))
}

function inferPlainTextTitle(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 24)

  const candidates = lines
    .filter((line) => isLikelyTitleLine(line))
    .map((line, index) => ({
      line,
      score: scoreTitleLine(line, index)
    }))
    .sort((left, right) => right.score - left.score)

  return candidates[0]?.line?.slice(0, 160) ?? null
}

function isLikelyTitleLine(line) {
  if (line.length < 8 || line.length > 180) {
    return false
  }
  if (/^(abstract|摘要|keywords?|目录|contents|table of contents|references)\b/i.test(line)) {
    return false
  }
  if (/^(figure|table|algorithm|section|chapter)\b/i.test(line)) {
    return false
  }
  if (/^\d+(\.\d+)*$/.test(line)) {
    return false
  }

  const latinCount = (line.match(/[a-z]/gi) ?? []).length
  const hanCount = (line.match(/[\u4e00-\u9fff]/g) ?? []).length
  return latinCount >= 6 || hanCount >= 4
}

function scoreTitleLine(line, index) {
  let score = 4.5 - index * 0.18

  if (line.length >= 18 && line.length <= 120) {
    score += 0.8
  }
  if (/^(llm|agent|model|transformer|retrieval|rag|vision|embodied|robot|policy|world|scene)\b/i.test(line)) {
    score += 0.8
  }
  if (/[A-Z][a-z]+/.test(line) || /[\u4e00-\u9fff]/.test(line)) {
    score += 0.3
  }
  if (/[.?!:;]$/.test(line)) {
    score -= 0.35
  }
  if (line.split(/\s+/).length <= 2) {
    score -= 0.5
  }

  return score
}

export function splitIntoSections(documentTitle, content) {
  const lines = content.split(/\r?\n/)
  const sections = []
  let current = null

  const pushCurrent = (endLine) => {
    if (!current) {
      return
    }
    const body = current.lines.join('\n').trim()
    sections.push({
      heading: current.heading,
      anchor: current.anchor,
      level: current.level,
      startLine: current.startLine,
      endLine,
      content: body
    })
  }

  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (headingMatch) {
      pushCurrent(index)
      const heading = headingMatch[2].trim()
      current = {
        heading,
        anchor: slugify(heading),
        level: headingMatch[1].length,
        startLine: index + 1,
        lines: []
      }
      return
    }

    if (!current) {
      current = {
        heading: documentTitle,
        anchor: slugify(documentTitle),
        level: 1,
        startLine: 1,
        lines: []
      }
    }

    current.lines.push(line)
  })

  pushCurrent(lines.length)

  if (sections.length === 0) {
    return [{
      heading: documentTitle,
      anchor: slugify(documentTitle),
      level: 1,
      startLine: 1,
      endLine: lines.length,
      content: content.trim()
    }]
  }

  return sections
    .map((section) => ({
      ...section,
      content: section.content || section.heading
    }))
    .filter((section) => section.content.trim().length > 0)
}

export function extractQuestions(title, content) {
  const results = []
  const seen = new Set()
  const lines = content.split(/\r?\n/)
  const maybeAdd = (value, sourceHint = 'line') => {
    const question = normalizeQuestionText(value)
    if (!question) {
      return
    }
    const canonical = question.toLowerCase()
    if (seen.has(canonical)) {
      return
    }
    seen.add(canonical)
    results.push({
      text: question,
      sourceHint
    })
  }

  if (looksLikeQuestion(title)) {
    maybeAdd(title, 'title')
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    if (/^\|(?:\s*[-:]+\s*\|)+\s*$/.test(trimmed)) {
      continue
    }

    let tableCandidate = null
    if (trimmed.startsWith('|')) {
      const cells = trimmed
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean)
      tableCandidate = cells.find((cell) => looksLikeQuestion(cell)) ?? null
      if (tableCandidate) {
        maybeAdd(tableCandidate, 'table')
        continue
      }
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.*)$/)
    const qaMatch = trimmed.match(/^(q[:：.]?|question[:：]?|问[:：]?|问题[:：]?)(.*)$/i)
    const candidate = qaMatch?.[2] ?? bulletMatch?.[1] ?? numberedMatch?.[1] ?? trimmed

    if (looksLikeQuestion(candidate)) {
      maybeAdd(candidate, qaMatch ? 'qa' : bulletMatch ? 'bullet' : numberedMatch ? 'numbered' : 'line')
    }
  }

  return results
}

function normalizeQuestionText(value) {
  const trimmed = value
    .replace(/^#+\s*/, '')
    .replace(/^\|\s*/, '')
    .replace(/\s*\|$/, '')
    .replace(/\|\s*\[answer\]\([^)]*\)\s*\|?/ig, '')
    .replace(/^[-*+]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^[📌✅⭐❓🔥👉\s]+/u, '')
    .replace(/^q\s*\d+\s*[:：.\-]\s*/i, '')
    .replace(/^\|\s*q\s*\d+\s*\|\s*/i, '')
    .replace(/^(q[:：.]?|question[:：]?|问[:：]?|问题[:：]?)/i, '')
    .replace(/^[*_`~]+/, '')
    .replace(/[*_`~]+$/, '')
    .trim()
    .replace(/\s+/g, ' ')

  if (trimmed.length < 6 || trimmed.length > 220) {
    return null
  }
  if (/^\[[^\]]+\]\([^)]*\)$/.test(trimmed)) {
    return null
  }
  return trimmed.replace(/\s*\|\s*/g, ' ').trim()
}

function looksLikeQuestion(value) {
  const cleaned = value.trim()
  if (/^\|/.test(cleaned) && /\[answer\]\(/i.test(cleaned)) {
    return false
  }
  if (/[?？]$/.test(cleaned)) {
    return true
  }
  return /(什么|如何|为什么|区别|原理|怎么|怎样|是否|优缺点|场景|流程|步骤|挑战|tradeoff|difference|when would|how do you|why would|what is)/i.test(cleaned)
}

export function buildQuestionCanonicalText(value) {
  const normalized = normalizeQuestionText(value)
  if (!normalized) {
    return ''
  }

  return normalized
    .toLowerCase()
    .replace(/\btransformer model\b/g, 'transformer')
    .replace(/\btransformers\b/g, 'transformer')
    .replace(/\bmodels\b/g, 'model')
    .replace(/\bllms\b/g, 'llm')
    .replace(/[“”"'`]+/g, '')
    .replace(/\([^)]*answer[^)]*\)/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !QUESTION_CANONICAL_STOPWORDS.has(token))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function tokenizeText(text) {
  const normalized = text.toLowerCase()
  const english = (normalized.match(/[a-z0-9][a-z0-9+_.-]{1,}/g) ?? [])
    .filter((token) => token.length > 2 && !ENGLISH_STOPWORDS.has(token))
  const chineseBlocks = normalized.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  const chineseTokens = []
  for (const block of chineseBlocks) {
    if (!CHINESE_STOPWORDS.has(block)) {
      chineseTokens.push(block)
    }
    for (let size = 2; size <= Math.min(4, block.length); size += 1) {
      for (let index = 0; index <= block.length - size; index += 1) {
        const token = block.slice(index, index + size)
        if (!CHINESE_STOPWORDS.has(token)) {
          chineseTokens.push(token)
        }
      }
    }
  }
  return [...new Set([...english, ...chineseTokens])]
}

export function scoreSimilarity(queryText, targetText, targetHeading = '') {
  const queryTokens = tokenizeText(queryText)
  const targetTokens = new Set(tokenizeText(`${targetHeading}\n${targetText}`))
  if (queryTokens.length === 0 || targetTokens.size === 0) {
    return 0
  }

  let hits = 0
  for (const token of queryTokens) {
    if (targetTokens.has(token)) {
      hits += token.length > 3 ? 2 : 1
    }
  }

  let score = hits / (queryTokens.length + 2)
  if (targetHeading && queryText.toLowerCase().includes(targetHeading.toLowerCase())) {
    score += 0.3
  }
  return Number(score.toFixed(4))
}

export async function readIfExists(targetPath) {
  if (!existsSync(targetPath)) {
    return null
  }
  return fs.readFile(targetPath, 'utf8')
}
