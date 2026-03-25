import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { URL } from 'node:url'

import chokidar, { type FSWatcher } from 'chokidar'
import express from 'express'
import { WebSocketServer } from 'ws'

import { AnswerJobManager, InterviewerModeManager, ManagedCodexConsoleManager, attachCodexPty } from './lib/codex.js'
import { IndexJobManager } from './lib/indexer.js'
import { saveManualInterviewImport } from './lib/interviewImports.js'
import { PORT, WEB_DIST_DIR } from './lib/constants.js'
import { OfferLoomDb } from './lib/db.js'
import { readSourcesSettingsSnapshot, saveRuntimeSourcesConfig, type OfferLoomSourcesConfig } from './lib/runtimeConfig.js'

const app = express()
const db = new OfferLoomDb()
const jobManager = new AnswerJobManager(db)
const consoleManager = new ManagedCodexConsoleManager(db)
const interviewerManager = new InterviewerModeManager(db)
const indexManager = new IndexJobManager(db)

app.use(express.json({ limit: '12mb' }))

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true
  })
})

app.get('/api/meta', (_request, response) => {
  response.json(db.getMeta())
})

app.get('/api/settings/sources', async (_request, response) => {
  response.json(await readSourcesSettingsSnapshot())
})

app.post('/api/settings/sources', async (request, response) => {
  const body = request.body as { config?: OfferLoomSourcesConfig }
  if (!body.config) {
    response.status(400).json({ error: 'config is required' })
    return
  }
  const saved = await saveRuntimeSourcesConfig(body.config)
  response.json({
    config: saved,
    ok: true
  })
})

app.get('/api/questions', (request, response) => {
  response.json(db.listQuestions(
    String(request.query.search ?? ''),
    Number(request.query.limit ?? 120),
    String(request.query.category ?? '')
  ))
})

app.get('/api/questions/:id', (request, response) => {
  const question = db.getQuestion(request.params.id)
  if (!question) {
    response.status(404).json({ error: 'Question not found' })
    return
  }
  response.json(question)
})

app.post('/api/questions/import', async (request, response) => {
  const body = request.body as {
    company?: string
    content?: string
    importMethod?: 'screenshot' | 'text'
    interviewDate?: string
    role?: string
    title?: string
  }

  if (!body.content?.trim()) {
    response.status(400).json({ error: 'content is required' })
    return
  }

  try {
    const saved = await saveManualInterviewImport({
      company: body.company,
      content: body.content,
      importMethod: body.importMethod === 'screenshot' ? 'screenshot' : 'text',
      interviewDate: body.interviewDate,
      role: body.role,
      title: body.title
    })
    response.status(201).json({
      ok: true,
      ...saved
    })
  } catch (error) {
    response.status(400).json({ error: error instanceof Error ? error.message : String(error) })
  }
})

app.get('/api/documents', (request, response) => {
  response.json(db.listDocuments(
    String(request.query.kind ?? ''),
    String(request.query.sourceId ?? ''),
    Number(request.query.limit ?? 400)
  ))
})

app.get('/api/documents/:id', async (request, response) => {
  const document = await db.getDocument(request.params.id)
  if (!document) {
    response.status(404).json({ error: 'Document not found' })
    return
  }
  response.json(document)
})

app.get('/api/search', (request, response) => {
  const query = String(request.query.q ?? '').trim()
  if (!query) {
    response.json({ questions: [], sections: [] })
    return
  }
  response.json(db.search(query))
})

app.get('/api/generated/:questionId', (request, response) => {
  const answer = db.getGeneratedAnswer(request.params.questionId)
  if (!answer) {
    response.status(404).json({ error: 'Generated answer not found' })
    return
  }
  response.json(answer)
})

app.get('/api/jobs/:jobId', (request, response) => {
  const job = jobManager.getJob(request.params.jobId)
  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.get('/api/codex-console/jobs/:jobId', (request, response) => {
  const job = consoleManager.getJob(request.params.jobId)
  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.get('/api/index/jobs/:jobId', (request, response) => {
  const job = indexManager.getJob(request.params.jobId)
  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.get('/api/interviewer/jobs/:jobId', (request, response) => {
  const job = interviewerManager.getJob(request.params.jobId)
  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.post('/api/index/jobs', async (request, response) => {
  const body = request.body as { config?: OfferLoomSourcesConfig }
  const job = await indexManager.start({
    config: body.config
  })
  response.status(202).json(job)
})

app.post('/api/index/jobs/:jobId/cancel', (request, response) => {
  const job = indexManager.cancel(request.params.jobId)
  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.post('/api/interviewer/jobs', async (request, response) => {
  const body = request.body as {
    candidateAnswer?: string
    conversation?: Array<{ content?: string; role?: 'assistant' | 'user' }>
    questionId?: string
    reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'
    seedFollowUp?: string
  }

  if (!body.questionId) {
    response.status(400).json({ error: 'questionId is required' })
    return
  }
  if (!body.seedFollowUp?.trim()) {
    response.status(400).json({ error: 'seedFollowUp is required' })
    return
  }

  const job = await interviewerManager.start({
    candidateAnswer: body.candidateAnswer?.trim() ?? '',
    conversation: Array.isArray(body.conversation)
      ? body.conversation
        .filter((item) => item.role === 'assistant' || item.role === 'user')
        .map((item) => ({
          content: String(item.content ?? ''),
          role: item.role as 'assistant' | 'user'
        }))
      : [],
    promptOverride: undefined,
    questionId: body.questionId,
    reasoningEffort: body.reasoningEffort ?? 'high',
    seedFollowUp: body.seedFollowUp.trim()
  })

  response.status(202).json(job)
})

app.post('/api/interviewer/jobs/:jobId/cancel', (request, response) => {
  const job = interviewerManager.cancel(request.params.jobId)
  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.post('/api/codex-console/jobs', async (request, response) => {
  const body = request.body as {
    autoReferenceCurrentDoc?: boolean
    conversation?: Array<{ content?: string; role?: 'assistant' | 'user' }>
    currentDocumentId?: string | null
    message?: string
    model?: string
    reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'
    selectedDocumentIds?: string[]
    selectedProjectIds?: string[]
  }

  if (!body.message?.trim()) {
    response.status(400).json({ error: 'message is required' })
    return
  }

  const job = await consoleManager.start({
    autoReferenceCurrentDoc: Boolean(body.autoReferenceCurrentDoc),
    conversation: Array.isArray(body.conversation)
      ? body.conversation
        .filter((item) => item.role === 'assistant' || item.role === 'user')
        .map((item) => ({
          content: String(item.content ?? ''),
          role: item.role as 'assistant' | 'user'
        }))
      : [],
    currentDocumentId: body.currentDocumentId ?? null,
    message: body.message.trim(),
    model: body.model ?? 'gpt-5.4',
    promptOverride: undefined,
    reasoningEffort: body.reasoningEffort ?? 'high',
    selectedDocumentIds: Array.isArray(body.selectedDocumentIds) ? body.selectedDocumentIds : [],
    selectedProjectIds: Array.isArray(body.selectedProjectIds) ? body.selectedProjectIds : []
  })

  response.status(202).json(job)
})

app.post('/api/codex-console/jobs/:jobId/cancel', (request, response) => {
  const job = consoleManager.cancel(request.params.jobId)
  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.post('/api/generated', async (request, response) => {
  const body = request.body as {
    autoReferenceCurrentDoc?: boolean
    currentDocumentId?: string | null
    model?: string
    questionId?: string
    reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh'
    selectedDocumentIds?: string[]
  }

  if (!body.questionId) {
    response.status(400).json({ error: 'questionId is required' })
    return
  }

  const job = await jobManager.start({
    autoReferenceCurrentDoc: Boolean(body.autoReferenceCurrentDoc),
    currentDocumentId: body.currentDocumentId ?? null,
    model: body.model ?? 'gpt-5.4',
    promptOverride: undefined,
    questionId: body.questionId,
    reasoningEffort: body.reasoningEffort ?? 'high',
    selectedDocumentIds: Array.isArray(body.selectedDocumentIds) ? body.selectedDocumentIds : []
  })

  response.status(202).json(job)
})

app.get('/api/work-projects', (_request, response) => {
  response.json(db.listWorkProjects())
})

app.get('/api/work-projects/:id', (request, response) => {
  const project = db.getWorkProject(request.params.id)
  if (!project) {
    response.status(404).json({ error: 'Work project not found' })
    return
  }
  response.json(project)
})

app.get('/api/agents/jobs', (_request, response) => {
  response.json(sortJobs([
    ...jobManager.listJobs(),
    ...consoleManager.listJobs(),
    ...interviewerManager.listJobs(),
    ...indexManager.listJobs()
  ]))
})

app.get('/api/agents/jobs/:jobId', (request, response) => {
  const job = jobManager.getJob(request.params.jobId)
    ?? consoleManager.getJob(request.params.jobId)
    ?? interviewerManager.getJob(request.params.jobId)
    ?? indexManager.getJob(request.params.jobId)
  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.post('/api/agents/jobs/:jobId/cancel', (request, response) => {
  const job = jobManager.cancel(request.params.jobId)
    ?? consoleManager.cancel(request.params.jobId)
    ?? interviewerManager.cancel(request.params.jobId)
    ?? indexManager.cancel(request.params.jobId)

  if (!job) {
    response.status(404).json({ error: 'Job not found' })
    return
  }
  response.json(job)
})

app.post('/api/agents/jobs/:jobId/rerun', async (request, response) => {
  const body = request.body as { promptOverride?: string }
  const job = await jobManager.restart(request.params.jobId, body.promptOverride)
    ?? await consoleManager.restart(request.params.jobId, body.promptOverride)
    ?? await interviewerManager.restart(request.params.jobId, body.promptOverride)

  if (!job) {
    response.status(404).json({ error: 'Job not found or cannot be rerun' })
    return
  }
  response.status(202).json(job)
})

if (fs.existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR))
  app.use((request, response, next) => {
    if (request.path.startsWith('/api/')) {
      next()
      return
    }
    response.sendFile(path.join(WEB_DIST_DIR, 'index.html'))
  })
} else {
  app.get('/', (_request, response) => {
    response.type('html').send(`
      <html>
        <body style="font-family: sans-serif; padding: 32px;">
          <h1>OfferLoom backend is running</h1>
          <p>The frontend build was not found yet. Run <code>npm run build</code> in the project root.</p>
        </body>
      </html>
    `)
  })
}

const server = createServer(app)
const terminalWss = new WebSocketServer({ noServer: true })
const watchWss = new WebSocketServer({ noServer: true })

terminalWss.on('connection', (socket) => {
  attachCodexPty(socket)
})

watchWss.on('connection', (socket) => {
  let watcher: FSWatcher | null = null

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as { path?: string; type: 'watch' }
      if (message.type !== 'watch' || !message.path) {
        return
      }
      void watcher?.close()
      watcher = chokidar.watch(message.path, {
        ignoreInitial: true
      })
      watcher.on('all', (eventName: string, changedPath: string) => {
        socket.send(JSON.stringify({
          type: 'changed',
          eventName,
          path: changedPath
        }))
      })
    } catch {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Invalid watch message'
      }))
    }
  })

  socket.on('close', () => {
    void watcher?.close()
  })
})

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '', `http://${request.headers.host}`)
  if (url.pathname === '/ws/codex') {
    terminalWss.handleUpgrade(request, socket, head, (upgradedSocket) => {
      terminalWss.emit('connection', upgradedSocket, request)
    })
    return
  }
  if (url.pathname === '/ws/watch') {
    watchWss.handleUpgrade(request, socket, head, (upgradedSocket) => {
      watchWss.emit('connection', upgradedSocket, request)
    })
    return
  }
  socket.destroy()
})

server.listen(PORT, '0.0.0.0', () => {
  const urls = collectAccessUrls(PORT)
  console.log('OfferLoom is ready:')
  urls.forEach((url) => {
    console.log(`  - ${url}`)
  })

  const proxyWarning = buildProxyWarning(urls)
  if (proxyWarning) {
    console.warn(proxyWarning)
  }
})

function collectAccessUrls(port: number) {
  const urls = new Set<string>([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`
  ])

  const networkInterfaces = os.networkInterfaces()
  for (const entries of Object.values(networkInterfaces)) {
    for (const entry of entries ?? []) {
      if (!entry || entry.internal || entry.family !== 'IPv4') {
        continue
      }
      urls.add(`http://${entry.address}:${port}`)
    }
  }

  return [...urls]
}

function buildProxyWarning(urls: string[]) {
  const proxyEnv = [
    process.env.http_proxy,
    process.env.HTTP_PROXY,
    process.env.https_proxy,
    process.env.HTTPS_PROXY,
    process.env.ALL_PROXY,
    process.env.all_proxy
  ].filter(Boolean)

  if (proxyEnv.length === 0) {
    return ''
  }

  const hostHints = urls
    .map((url) => {
      try {
        return new URL(url).hostname
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .join(',')

  return [
    '[OfferLoom] Detected proxy environment variables.',
    '[OfferLoom] If localhost or LAN access shows 502 / Bad Gateway, add these hosts to NO_PROXY or your browser bypass list:',
    `[OfferLoom] ${hostHints}`
  ].join('\n')
}

function sortJobs<T extends { startedAt: string }>(jobs: T[]) {
  return [...jobs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}
