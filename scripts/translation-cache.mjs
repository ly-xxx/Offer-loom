import fs from 'node:fs/promises'
import path from 'node:path'

import { GENERATED_DIR, buildQuestionCanonicalText, hashContent, nowIso } from './lib.mjs'

export const QUESTION_TRANSLATIONS_PATH = path.join(GENERATED_DIR, 'question-translations.json')

export async function loadQuestionTranslationCache() {
  try {
    const raw = await fs.readFile(QUESTION_TRANSLATIONS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const items = Array.isArray(parsed?.items) ? parsed.items : []
    const byQuestionId = new Map()
    const byCanonicalHash = new Map()

    for (const item of items) {
      if (!isTranslationRecord(item)) {
        continue
      }
      byQuestionId.set(item.questionId, item)
      byCanonicalHash.set(item.canonicalHash, item)
    }

    return {
      byCanonicalHash,
      byQuestionId,
      items
    }
  } catch {
    return {
      byCanonicalHash: new Map(),
      byQuestionId: new Map(),
      items: []
    }
  }
}

export async function saveQuestionTranslationCache(cache) {
  const deduped = []
  const seen = new Set()

  for (const item of cache.items) {
    if (!isTranslationRecord(item) || seen.has(item.questionId)) {
      continue
    }
    seen.add(item.questionId)
    deduped.push(item)
  }

  await fs.writeFile(QUESTION_TRANSLATIONS_PATH, JSON.stringify({
    updatedAt: nowIso(),
    version: 1,
    items: deduped
  }, null, 2), 'utf8')
}

export function findQuestionTranslation(cache, questionId, questionText) {
  const direct = cache.byQuestionId.get(questionId)
  if (direct) {
    return direct
  }

  return cache.byCanonicalHash.get(buildQuestionCanonicalHash(questionText)) ?? null
}

export function upsertQuestionTranslation(cache, input) {
  const record = buildQuestionTranslationRecord(input)
  const existingIndex = cache.items.findIndex((item) => item.questionId === record.questionId)

  if (existingIndex >= 0) {
    cache.items[existingIndex] = record
  } else {
    cache.items.push(record)
  }

  cache.byQuestionId.set(record.questionId, record)
  cache.byCanonicalHash.set(record.canonicalHash, record)
  return record
}

export function buildQuestionTranslationRecord(input) {
  return {
    canonicalHash: buildQuestionCanonicalHash(input.questionText),
    model: input.model ?? '',
    originalText: input.questionText.trim(),
    questionId: input.questionId,
    status: input.status ?? 'translated',
    translatedText: normalizeTranslationText(input.translatedText),
    updatedAt: input.updatedAt ?? nowIso()
  }
}

export function buildQuestionCanonicalHash(questionText) {
  return hashContent(buildQuestionCanonicalText(questionText) || questionText.trim().toLowerCase())
}

function normalizeTranslationText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isTranslationRecord(value) {
  return Boolean(
    value
    && typeof value.questionId === 'string'
    && typeof value.canonicalHash === 'string'
    && typeof value.originalText === 'string'
    && typeof value.translatedText === 'string'
  )
}
