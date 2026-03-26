import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import Database from 'better-sqlite3'

import {
  DB_PATH,
  ROOT_DIR,
  SCHEMA_PATH,
  SKILLS_DIR,
  GENERATED_DIR,
  hashContent,
  nowIso,
  readTextFile,
  readIfExists
} from './lib.mjs'

const args = parseArgs(process.argv.slice(2))

async function main() {
  const db = new Database(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS generated_answer_runs (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL,
      model TEXT NOT NULL,
      reasoning_effort TEXT NOT NULL,
      status TEXT NOT NULL,
      output_json TEXT NOT NULL,
      output_markdown TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS generated_answer_runs_question_idx
    ON generated_answer_runs (question_id, updated_at DESC);
  `)
  const limit = args.limit === 'all' ? Number.MAX_SAFE_INTEGER : Number(args.limit ?? 10)
  const concurrency = Math.max(1, Number(args.concurrency ?? 1))
  const model = args.model ?? 'gpt-5'
  const reasoningEffort = args.effort ?? 'high'
  const onlyQuestionId = args.question ?? null
  const force = args.force === true || args.force === '1' || args.force === 'true'

  const questions = onlyQuestionId
    ? db.prepare('SELECT id, text, metadata_json AS metadataJson FROM questions WHERE id = ?').all(onlyQuestionId)
    : db.prepare(`
        SELECT q.id, q.text, q.metadata_json AS metadataJson
        FROM questions q
        LEFT JOIN generated_answers ga ON ga.question_id = q.id
        WHERE ${force ? '1 = 1' : 'ga.id IS NULL'}
        ORDER BY q.text
        LIMIT ?
      `).all(limit)

  const skillText = await readPromptSkills(['answer-composer.md', 'mywork-triage.md', 'project-interviewer.md'])
  const upsert = db.prepare(`
    INSERT INTO generated_answers (
      id, question_id, model, reasoning_effort, status, output_json, output_markdown, citations_json, updated_at
    ) VALUES (
      @id, @questionId, @model, @reasoningEffort, @status, @outputJson, @outputMarkdown, @citationsJson, @updatedAt
    )
    ON CONFLICT(question_id) DO UPDATE SET
      model = excluded.model,
      reasoning_effort = excluded.reasoning_effort,
      status = excluded.status,
      output_json = excluded.output_json,
      output_markdown = excluded.output_markdown,
      citations_json = excluded.citations_json,
      updated_at = excluded.updated_at
  `)
  const insertRun = db.prepare(`
    INSERT INTO generated_answer_runs (
      id, question_id, model, reasoning_effort, status, output_json, output_markdown, citations_json, updated_at
    ) VALUES (
      @id, @questionId, @model, @reasoningEffort, @status, @outputJson, @outputMarkdown, @citationsJson, @updatedAt
    )
  `)

  const queue = [...questions]
  const state = {
    completed: 0,
    failed: 0,
    started: 0,
    succeeded: 0,
    total: queue.length
  }

  console.log(`[${nowIso()}] batch generation starting: total=${state.total}, concurrency=${Math.min(concurrency, Math.max(queue.length, 1))}, model=${model}, effort=${reasoningEffort}, force=${force}`)

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(queue.length, 1)) }, (_value, index) => worker(index + 1))
  )

  console.log(`[${nowIso()}] batch generation finished: succeeded=${state.succeeded}, failed=${state.failed}, total=${state.total}`)

  async function worker(workerId) {
    while (queue.length > 0) {
      const question = queue.shift()
      if (!question) {
        return
      }

      state.started += 1
      const localizedQuestion = readTranslatedText(question.metadataJson) ?? question.text
      console.log(`[${nowIso()}][worker ${workerId}][${state.started}/${state.total}] generating answer for ${localizedQuestion}`)
      const context = await gatherContext(db, question.id, question.text)
      const prompt = buildPrompt(skillText, {
        originalText: question.text,
        translatedText: readTranslatedText(question.metadataJson)
      }, context)
      const outputFile = path.join(os.tmpdir(), `offerloom-${question.id}.json`)

      try {
        const lastMessage = await runCodex(prompt, outputFile, model, reasoningEffort)
        const parsed = JSON.parse(lastMessage)
        const answerId = hashContent(`generated:${question.id}`)
        const updatedAt = nowIso()
        await fs.writeFile(
          path.join(GENERATED_DIR, `${question.id}.json`),
          JSON.stringify(parsed, null, 2),
          'utf8'
        )
        upsert.run({
          id: answerId,
          questionId: question.id,
          model,
          reasoningEffort,
          status: 'ready',
          outputJson: JSON.stringify(parsed),
          outputMarkdown: parsed.full_answer_markdown ?? '',
          citationsJson: JSON.stringify(parsed.citations ?? []),
          updatedAt
        })
        insertRun.run({
          id: hashContent(`generated-run:${question.id}:${updatedAt}:${model}:${reasoningEffort}`),
          questionId: question.id,
          model,
          reasoningEffort,
          status: 'ready',
          outputJson: JSON.stringify(parsed),
          outputMarkdown: parsed.full_answer_markdown ?? '',
          citationsJson: JSON.stringify(parsed.citations ?? []),
          updatedAt
        })
        state.succeeded += 1
      } catch (error) {
        const answerId = hashContent(`generated:${question.id}`)
        const updatedAt = nowIso()
        upsert.run({
          id: answerId,
          questionId: question.id,
          model,
          reasoningEffort,
          status: 'failed',
          outputJson: JSON.stringify({
            error: String(error)
          }),
          outputMarkdown: '',
          citationsJson: '[]',
          updatedAt
        })
        state.failed += 1
        console.error(`[worker ${workerId}] ${localizedQuestion}`)
        console.error(error)
      } finally {
        state.completed += 1
        console.log(`[${nowIso()}][worker ${workerId}] progress: completed=${state.completed}/${state.total}, succeeded=${state.succeeded}, failed=${state.failed}`)
      }
    }
  }

  db.close()
}

async function gatherContext(db, questionId, questionText) {
  const guideSections = db.prepare(`
    SELECT s.id, s.heading, s.content, d.source_id AS sourceId, d.rel_path AS relPath
    FROM links l
    JOIN sections s ON s.id = l.to_id
    JOIN documents d ON d.id = s.document_id
    WHERE l.from_id = ? AND l.relation = 'question_to_section'
    ORDER BY l.score DESC
    LIMIT 6
  `).all(questionId)

  const workDocs = db.prepare(`
    SELECT d.id, d.title, d.content, d.path, d.source_id AS sourceId, d.rel_path AS relPath, l.evidence_json AS evidenceJson
    FROM links l
    JOIN documents d ON d.id = l.to_id
    WHERE l.from_id = ? AND l.relation = 'question_to_work'
    ORDER BY l.score DESC
    LIMIT 4
  `).all(questionId)

  const fallbackWorkDocs = db.prepare(`
    SELECT d.id, d.title, d.content, d.path, d.source_id AS sourceId, d.rel_path AS relPath, l.evidence_json AS evidenceJson
    FROM links l
    JOIN documents d ON d.id = l.to_id
    WHERE l.from_id = ? AND l.relation = 'question_to_work_hint'
    ORDER BY l.score DESC
    LIMIT 3
  `).all(questionId)

  const overviewDoc = shouldAttachOverview(questionText, workDocs)
      ? db.prepare(`
        SELECT d.id, d.title, d.content, d.path, d.source_id AS sourceId, d.rel_path AS relPath, '{}' AS evidenceJson
        FROM documents d
        WHERE d.kind = 'work' AND d.rel_path LIKE '_overview/%'
        ORDER BY d.rel_path ASC
        LIMIT 1
      `).get()
    : null

  const mergedWorkDocs = []
  const seenIds = new Set()
  for (const document of [overviewDoc, ...workDocs]) {
    if (!document || seenIds.has(document.id)) {
      continue
    }
    seenIds.add(document.id)
    mergedWorkDocs.push({
      ...document,
      content: await readLiveWorkContent(document.path, document.content)
    })
  }

  const mergedFallbackDocs = []
  for (const document of fallbackWorkDocs) {
    if (!document || seenIds.has(document.id)) {
      continue
    }
    seenIds.add(document.id)
    mergedFallbackDocs.push({
      ...document,
      content: await readLiveWorkContent(document.path, document.content)
    })
  }

  return {
    guideSections,
    workDocs: mergedWorkDocs.slice(0, 5),
    fallbackWorkDocs: mergedFallbackDocs.slice(0, 3),
    workEvidenceStatus: mergedWorkDocs.length > 0 ? 'direct' : mergedFallbackDocs.length > 0 ? 'adjacent' : 'none'
  }
}

function buildPrompt(skillText, question, context) {
  const guideBlock = context.guideSections.length > 0
    ? context.guideSections.map((section, index) => {
        const excerpt = trimText(section.content, 1800)
        return `## Guide Section ${index + 1}\nLabel: ${section.heading}\nPath: ${buildSourceReference(section.sourceId, section.relPath)}\nExcerpt:\n${excerpt}`
      }).join('\n\n')
    : 'No guide sections were retrieved.'

  const workBlock = context.workDocs.length > 0
    ? context.workDocs.map((document, index) => {
        const excerpt = trimText(document.content, 1800)
        return `## Work File ${index + 1}\nLabel: ${document.title}\nPath: ${buildSourceReference(document.sourceId, document.relPath)}\nEvidence: ${formatEvidence(document.evidenceJson)}\nExcerpt:\n${excerpt}`
      }).join('\n\n')
    : 'No work files were retrieved. If helpful, suggest an adjacent experience framing.'

  const fallbackWorkBlock = context.fallbackWorkDocs.length > 0
    ? context.fallbackWorkDocs.map((document, index) => {
        const excerpt = trimText(document.content, 1600)
        return `## Source-backed Fallback ${index + 1}\nLabel: ${document.title}\nPath: ${buildSourceReference(document.sourceId, document.relPath)}\nEvidence: ${formatEvidence(document.evidenceJson)}\nExcerpt:\n${excerpt}`
      }).join('\n\n')
    : 'No fallback work files were inspected.'

  return `${skillText}

# Question
Original: ${question.originalText}
Preferred Chinese phrasing: ${question.translatedText ?? 'N/A'}

# Retrieved Guide Context
${guideBlock}

# Work Evidence Assessment
Status: ${context.workEvidenceStatus}
Instruction: ${buildWorkEvidenceInstruction(context.workEvidenceStatus)}

# Retrieved Work Context
${workBlock}

# Source-backed Fallback Work
${fallbackWorkBlock}

# Output contract
Return JSON that matches the provided schema exactly.`
}

async function readPromptSkills(fileNames) {
  const chunks = await Promise.all(fileNames.map(async (fileName) => (
    fs.readFile(path.join(SKILLS_DIR, fileName), 'utf8')
  )))
  return chunks.join('\n\n')
}

function trimText(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}\n...[truncated]` : text
}

function buildSourceReference(sourceId, relPath) {
  return `${sourceId}://${String(relPath).replaceAll('\\', '/')}`
}

function readTranslatedText(metadataJson) {
  try {
    const metadata = JSON.parse(metadataJson)
    return typeof metadata?.translatedText === 'string' && metadata.translatedText.trim()
      ? metadata.translatedText.trim()
      : null
  } catch {
    return null
  }
}

function runCodex(prompt, outputFile, model, reasoningEffort) {
  return new Promise((resolve, reject) => {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--cd',
      ROOT_DIR,
      '--output-schema',
      SCHEMA_PATH,
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
        reject(new Error('codex finished without writing output'))
        return
      }
      resolve(lastMessage)
    })

    child.stdin.write(prompt)
    child.stdin.end()
  })
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

function shouldAttachOverview(questionText, workDocs) {
  if (/(project|experience|经历|挑战|贡献|介绍.*项目|你负责什么|个人贡献)/i.test(questionText)) {
    return true
  }

  return workDocs.length > 0 && /(结合.*项目|从你的工作出发|贴到项目上|relevant project|most relevant project)/i.test(questionText)
}

async function readLiveWorkContent(filePath, fallback) {
  try {
    return await readTextFile(filePath)
  } catch {
    return fallback
  }
}

function buildWorkEvidenceInstruction(status) {
  if (status === 'direct') {
    return 'Use direct mywork evidence only where it genuinely sharpens the answer, and keep every project claim traceable. If the question is very basic and the project adds no extra signal, answer cleanly from the guide instead of forcing a project tie-in.'
  }
  if (status === 'adjacent') {
    return 'Direct mywork evidence is weak or absent. You may use fallback files only as adjacent framing and must say they do not directly cover the exact concept. If the question is simple, it is better to skip project linkage entirely than to force a weak connection.'
  }
  return 'No usable mywork evidence was found. Explicitly say so and answer from guide knowledge plus dynamic supplement only. Do not fabricate a project bridge just to satisfy the template.'
}

function formatEvidence(evidenceJson) {
  try {
    const evidence = JSON.parse(evidenceJson)
    if (Array.isArray(evidence?.chunkEvidence) && evidence.chunkEvidence.length > 0) {
      return evidence.chunkEvidence
        .slice(0, 2)
        .map((item) => `${item.heading ?? 'chunk'} (${Number(item.score ?? 0).toFixed(2)})`)
        .join('; ')
    }
    if (typeof evidence?.heading === 'string' && evidence.heading.trim()) {
      return evidence.heading.trim()
    }
  } catch {
    return 'No retrieval trace'
  }
  return 'Heuristic retrieval only'
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
