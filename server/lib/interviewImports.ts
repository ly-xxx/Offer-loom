import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { LOCAL_QUESTION_BANK_SOURCES_ROOT } from './constants.js'

const MANUAL_SOURCE_ID = 'manual-mianjing'
const MANUAL_SOURCE_ROOT = path.join(LOCAL_QUESTION_BANK_SOURCES_ROOT, MANUAL_SOURCE_ID)

export type ManualInterviewImportInput = {
  company?: string
  content: string
  importMethod: 'screenshot' | 'text'
  interviewDate?: string
  role?: string
  title?: string
}

export type ManualInterviewImportResult = {
  documentPath: string
  questionCountEstimate: number
  sourceId: string
  title: string
}

export async function saveManualInterviewImport(input: ManualInterviewImportInput): Promise<ManualInterviewImportResult> {
  const content = normalizeImportContent(input.content)
  if (!content) {
    throw new Error('面经内容不能为空')
  }

  const title = deriveImportTitle(input.title, content)
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 10)
  const dateKey = new Date().toISOString().slice(0, 7)
  const entryDir = path.join(MANUAL_SOURCE_ROOT, 'imports', dateKey)
  const fileName = `${slugifyFileName(title)}-${hash}.md`
  const targetPath = path.join(entryDir, fileName)

  await fs.mkdir(entryDir, { recursive: true })

  const markdown = buildInterviewMarkdown({
    company: normalizeOptional(input.company),
    content,
    importMethod: input.importMethod,
    interviewDate: normalizeOptional(input.interviewDate),
    role: normalizeOptional(input.role),
    title
  })

  await fs.writeFile(targetPath, markdown, 'utf8')

  return {
    documentPath: targetPath,
    questionCountEstimate: estimateQuestionCount(content),
    sourceId: MANUAL_SOURCE_ID,
    title
  }
}

function buildInterviewMarkdown(input: {
  company: string | null
  content: string
  importMethod: 'screenshot' | 'text'
  interviewDate: string | null
  role: string | null
  title: string
}) {
  const metaLines = [
    `title: "${escapeYamlString(input.title)}"`,
    `importOrigin: "manual"`,
    `importMethod: "${input.importMethod}"`,
    `importedAt: "${new Date().toISOString()}"`,
    input.company ? `company: "${escapeYamlString(input.company)}"` : null,
    input.role ? `role: "${escapeYamlString(input.role)}"` : null,
    input.interviewDate ? `interviewDate: "${escapeYamlString(input.interviewDate)}"` : null
  ].filter((item): item is string => Boolean(item))

  const metaSummary = [
    input.company ? `公司：${input.company}` : null,
    input.role ? `岗位：${input.role}` : null,
    input.interviewDate ? `日期：${input.interviewDate}` : null,
    `导入方式：${input.importMethod === 'screenshot' ? '截图识别' : '粘贴文本'}`
  ].filter((item): item is string => Boolean(item))

  return [
    '---',
    ...metaLines,
    '---',
    '',
    `# ${input.title}`,
    '',
    ...(metaSummary.length > 0
      ? [
          '## 速记信息',
          ...metaSummary.map((item) => `- ${item}`),
          ''
        ]
      : []),
    '## 原始面经',
    '',
    input.content,
    ''
  ].join('\n')
}

function deriveImportTitle(inputTitle: string | undefined, content: string) {
  const explicit = normalizeOptional(inputTitle)
  if (explicit) {
    return explicit
  }

  const firstInterestingLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length >= 8)

  if (!firstInterestingLine) {
    return '手动导入面经'
  }

  return firstInterestingLine
    .replace(/^#+\s*/, '')
    .replace(/^(q[:：.]?|问[:：]?|问题[:：]?)/i, '')
    .trim()
    .slice(0, 80) || '手动导入面经'
}

function estimateQuestionCount(content: string) {
  const lines = content.split(/\r?\n/)
  let count = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    if (/[?？]$/.test(trimmed) || /^(q[:：.]?|问[:：]?|问题[:：]?)/i.test(trimmed)) {
      count += 1
      continue
    }
    if (/^\d+[.)]\s+/.test(trimmed) && /(什么|如何|为什么|区别|原理|场景|挑战|how|why|what|difference|when)/i.test(trimmed)) {
      count += 1
    }
  }

  return Math.max(1, count)
}

function normalizeImportContent(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function normalizeOptional(value: string | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function escapeYamlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function slugifyFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'manual-interview'
}
