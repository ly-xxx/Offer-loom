import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

import {
  DB_PATH,
  ROOT_DIR,
  ensureDir,
  nowIso,
  readIfExists
} from './lib.mjs'
import {
  QUESTION_TRANSLATIONS_PATH,
  findQuestionTranslation,
  loadQuestionTranslationCache,
  saveQuestionTranslationCache,
  upsertQuestionTranslation
} from './translation-cache.mjs'

const TRANSLATION_SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'question-translation-batch.schema.json')
const args = parseArgs(process.argv.slice(2))

async function main() {
  await ensureDir(path.dirname(QUESTION_TRANSLATIONS_PATH))

  const db = new Database(DB_PATH)
  const limit = args.limit === 'all' ? Number.MAX_SAFE_INTEGER : Number(args.limit ?? 120)
  const batchSize = Math.max(1, Number(args.batchSize ?? 10))
  const concurrency = Math.max(1, Number(args.concurrency ?? 2))
  const model = args.model ?? 'gpt-5.2'
  const reasoningEffort = args.effort ?? 'medium'
  const force = args.force === true || args.force === '1' || args.force === 'true'
  const cache = await loadQuestionTranslationCache()

  const updateQuestion = db.prepare(`
    UPDATE questions
    SET metadata_json = @metadataJson
    WHERE id = @id
  `)
  const deleteQuestionFts = db.prepare(`
    DELETE FROM questions_fts
    WHERE question_id = ?
  `)
  const insertQuestionFts = db.prepare(`
    INSERT INTO questions_fts (question_id, text)
    VALUES (?, ?)
  `)
  const upsertMeta = db.prepare(`
    INSERT INTO app_meta (key, value)
    VALUES (@key, @value)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value
  `)

  const rawQuestions = db.prepare(`
    SELECT id, text, metadata_json AS metadataJson
    FROM questions
    ORDER BY text
  `).all()

  let hydratedFromCache = 0
  const pending = []

  for (const question of rawQuestions) {
    const metadata = safeObject(question.metadataJson)
    const existingTranslation = normalizeText(metadata.translatedText)
    const cached = findQuestionTranslation(cache, question.id, question.text)

    if (!force && !existingTranslation && cached?.translatedText) {
      applyTranslation(db, question, cached.translatedText, {
        model: cached.model,
        status: cached.status,
        updatedAt: cached.updatedAt
      }, updateQuestion, deleteQuestionFts, insertQuestionFts)
      hydratedFromCache += 1
      continue
    }

    if (!force && existingTranslation) {
      continue
    }

    pending.push(question)
  }

  const queue = pending.slice(0, limit)
  const state = {
    completed: 0,
    failed: 0,
    succeeded: 0,
    total: queue.length
  }

  console.log(`[${nowIso()}] question translation starting: total=${state.total}, hydrated=${hydratedFromCache}, batchSize=${batchSize}, concurrency=${Math.min(concurrency, Math.max(queue.length, 1))}, model=${model}, effort=${reasoningEffort}, force=${force}`)

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, (_value, index) => (
      worker(index + 1)
    ))
  )

  const translatedCount = db.prepare(`
    SELECT COUNT(*) AS value
    FROM questions
    WHERE metadata_json LIKE '%"translatedText"%'
  `).get()

  upsertMeta.run({
    key: 'translated_question_count',
    value: String(translatedCount.value)
  })

  await saveQuestionTranslationCache(cache)
  db.close()
  console.log(`[${nowIso()}] question translation finished: succeeded=${state.succeeded}, failed=${state.failed}, hydrated=${hydratedFromCache}, translated=${translatedCount.value}`)

  async function worker(workerId) {
    while (queue.length > 0) {
      const batch = queue.splice(0, batchSize)
      if (batch.length === 0) {
        return
      }

      console.log(`[${nowIso()}][translator ${workerId}] translating batch of ${batch.length}`)

      try {
        const parsed = await translateBatch(batch, model, reasoningEffort)
        const translatedById = new Map(
          (Array.isArray(parsed.items) ? parsed.items : [])
            .filter((item) => item && typeof item.id === 'string' && typeof item.translatedText === 'string')
            .map((item) => [item.id, normalizeText(item.translatedText)])
        )

        for (const question of batch) {
          const translatedText = translatedById.get(question.id)
          if (!translatedText) {
            throw new Error(`missing translation for question ${question.id}`)
          }

          const record = upsertQuestionTranslation(cache, {
            model,
            questionId: question.id,
            questionText: question.text,
            translatedText,
            updatedAt: nowIso()
          })

          applyTranslation(db, question, record.translatedText, {
            model: record.model,
            status: record.status,
            updatedAt: record.updatedAt
          }, updateQuestion, deleteQuestionFts, insertQuestionFts)

          state.succeeded += 1
        }
      } catch (error) {
        state.failed += batch.length
        console.error(`[translator ${workerId}] batch failed`)
        console.error(error)
      } finally {
        state.completed += batch.length
        console.log(`[${nowIso()}][translator ${workerId}] progress: completed=${state.completed}/${state.total}, succeeded=${state.succeeded}, failed=${state.failed}`)
      }
    }
  }
}

function applyTranslation(
  db,
  question,
  translatedText,
  info,
  updateQuestion,
  deleteQuestionFts,
  insertQuestionFts
) {
  const existing = db.prepare(`
    SELECT metadata_json AS metadataJson
    FROM questions
    WHERE id = ?
  `).get(question.id)
  const metadata = safeObject(existing?.metadataJson ?? question.metadataJson)
  const nextMetadata = {
    ...metadata,
    translatedText,
    translationModel: info.model ?? metadata.translationModel ?? '',
    translationStatus: info.status ?? metadata.translationStatus ?? 'translated',
    translationUpdatedAt: info.updatedAt ?? metadata.translationUpdatedAt ?? nowIso()
  }

  updateQuestion.run({
    id: question.id,
    metadataJson: JSON.stringify(nextMetadata)
  })
  deleteQuestionFts.run(question.id)
  insertQuestionFts.run(question.id, `${question.text}\n${translatedText}`)
}

async function translateBatch(batch, model, reasoningEffort) {
  const prompt = buildPrompt(batch)
  const outputFile = path.join(os.tmpdir(), `offerloom-translate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`)

  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--cd',
      ROOT_DIR,
      '--output-schema',
      TRANSLATION_SCHEMA_PATH,
      '--output-last-message',
      outputFile,
      '-m',
      model,
      '-c',
      `model_reasoning_effort="${reasoningEffort}"`,
      '-'
    ]

    const child = spawn('codex', args, {
      cwd: ROOT_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stderr = ''
    child.stdout.on('data', () => {})
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `codex exited with code ${code}`))
        return
      }

      const lastMessage = await readIfExists(outputFile)
      if (!lastMessage) {
        reject(new Error('codex finished without writing translation output'))
        return
      }

      try {
        resolve(JSON.parse(lastMessage))
      } catch (error) {
        reject(error)
      }
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
}

function buildPrompt(batch) {
  const items = batch.map((question, index) => (
    `- id: ${question.id}\n  text: ${question.text}`
  )).join('\n')

  return `You are localizing interview questions for an LLM / agent preparation assistant.

Task:
- Translate each interview question into concise, natural Simplified Chinese.
- Do not answer the question.
- Do not add explanations, bullets, or extra commentary.
- Preserve only true technical terms, product names, and abbreviations in English when that is the most natural form, such as LangChain, OpenAI Functions, RLHF, LoRA, MCP, vLLM.
- Translate generic scaffolding words into Chinese, including difference, tradeoff, challenge, pipeline, evaluate, design, failure mode, production-grade, and how would you.
- If a phrase can be translated naturally into Chinese without losing precision, translate it.
- If the source question is already Chinese, lightly normalize it instead of rewriting aggressively.
- Keep each translation to a single interview-style sentence.

Return JSON only and include every id exactly once.

Batch:
${items}`
}

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) {
      continue
    }
    const key = value.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
      continue
    }
    parsed[key] = next
    index += 1
  }
  return parsed
}

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeObject(value) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
