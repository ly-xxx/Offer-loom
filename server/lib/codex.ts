import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { WebSocket } from 'ws'

import { CONSOLE_SCHEMA_PATH, GENERATED_DIR, INTERVIEWER_SCHEMA_PATH, ROOT_DIR, SCHEMA_PATH, SKILLS_DIR } from './constants.js'
import type { OfferPotatoDb } from './db.js'
import { jobEvents } from './jobEvents.js'
import { readLiveContent, trimExcerpt } from './text.js'

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

type CodexUsage = {
  cachedInputTokens?: number
  inputTokens?: number
  outputTokens?: number
}

type JobStatus = {
  error?: string
  finishedAt?: string
  id: string
  kind: 'answer'
  liveLogs?: string[]
  liveText?: string
  model: string
  promptPreview?: string
  questionId: string
  questionText?: string
  reasoningEffort: ReasoningEffort
  result?: unknown
  stage: string
  startedAt: string
  status: 'cancelled' | 'queued' | 'running' | 'ready' | 'failed'
  summary: string
  updatedAt?: string
  usage?: CodexUsage
}

type GenerateOptions = {
  autoReferenceCurrentDoc: boolean
  currentDocumentId?: string | null
  model: string
  promptOverride?: string
  questionId: string
  reasoningEffort: ReasoningEffort
  selectedDocumentIds: string[]
}

type ConsoleConversationTurn = {
  content: string
  role: 'assistant' | 'user'
}

export type ConsoleReply = {
  changed_files: Array<{
    path: string
    summary: string
  }>
  citations: Array<{
    kind: 'current_document' | 'dynamic' | 'guide' | 'selected_file' | 'selected_project' | 'work'
    label: string
    path: string
  }>
  follow_ups: string[]
  headline: string
  mode: 'answer' | 'edit' | 'mixed' | 'plan' | 'review'
  reply_markdown: string
  summary: string
  warnings: string[]
}

export type ConsoleJobStatus = {
  error?: string
  finishedAt?: string
  id: string
  kind: 'console'
  liveLogs?: string[]
  liveText?: string
  model: string
  messagePreview?: string
  promptPreview?: string
  reasoningEffort: ReasoningEffort
  result?: ConsoleReply
  stage: string
  startedAt: string
  status: 'cancelled' | 'failed' | 'queued' | 'ready' | 'running'
  summary: string
  updatedAt?: string
  usage?: CodexUsage
}

export type InterviewerReply = {
  assessment: string
  citations: Array<{
    kind: 'dynamic' | 'guide' | 'question_bank' | 'work'
    label: string
    path: string
  }>
  follow_ups: string[]
  headline: string
  interviewer_markdown: string
  pressure_level: 'cornering' | 'opening' | 'pressure'
  pressure_points: string[]
  summary: string
}

export type InterviewerJobStatus = {
  error?: string
  finishedAt?: string
  id: string
  kind: 'interviewer'
  liveLogs?: string[]
  liveText?: string
  messagePreview?: string
  model: string
  promptPreview?: string
  questionId: string
  questionText?: string
  reasoningEffort: ReasoningEffort
  result?: InterviewerReply
  seedFollowUp: string
  stage: string
  startedAt: string
  status: 'cancelled' | 'failed' | 'queued' | 'ready' | 'running'
  summary: string
  updatedAt?: string
  usage?: CodexUsage
}

type ConsoleOptions = {
  autoReferenceCurrentDoc: boolean
  conversation: ConsoleConversationTurn[]
  currentDocumentId?: string | null
  message: string
  model: string
  promptOverride?: string
  reasoningEffort: ReasoningEffort
  selectedDocumentIds: string[]
  selectedProjectIds: string[]
}

type InterviewerOptions = {
  candidateAnswer?: string
  conversation: ConsoleConversationTurn[]
  promptOverride?: string
  questionId: string
  reasoningEffort: ReasoningEffort
  seedFollowUp: string
}

type PromptDocument = Awaited<ReturnType<typeof hydrateDocuments>>[number]

type ConsoleProjectContext = {
  hydratedDocs: PromptDocument[]
  id: string
  name: string
  prep: {
    highlightFacts: Array<{ label: string; sourceLabel: string; value: string }>
    interviewArc: string[]
    openingPitch: string
    whyThisProjectMatters: string
  }
  rootPath: string
  status: string
  summary: string
}

type StreamableCodexJob = JobStatus | ConsoleJobStatus | InterviewerJobStatus

type CodexJsonEvent = {
  item?: {
    text?: string
    type?: string
  }
  type?: string
  usage?: {
    cached_input_tokens?: number
    input_tokens?: number
    output_tokens?: number
  }
} & Record<string, unknown>

function publishCodexJob(job: StreamableCodexJob) {
  job.updatedAt = new Date().toISOString()
  jobEvents.publish(job)
}

function pushCodexLiveLog(job: StreamableCodexJob, line: string) {
  const cleaned = line.replace(/\s+/g, ' ').trim()
  if (!cleaned) {
    return
  }
  job.liveLogs = [...(job.liveLogs ?? []).slice(-23), trimExcerpt(cleaned, 200)]
  publishCodexJob(job)
}

function setCodexLiveText(job: StreamableCodexJob, text: string | null) {
  const cleaned = text?.trim()
  if (!cleaned || job.liveText === cleaned) {
    return
  }
  job.liveText = cleaned
  publishCodexJob(job)
}

function setCodexUsage(job: StreamableCodexJob, usage: CodexUsage) {
  job.usage = usage
  publishCodexJob(job)
}

function readCodexUsage(event: CodexJsonEvent): CodexUsage | null {
  const usage = event.usage
  if (!usage || typeof usage !== 'object') {
    return null
  }

  const result: CodexUsage = {}
  if (typeof usage.input_tokens === 'number') {
    result.inputTokens = usage.input_tokens
  }
  if (typeof usage.cached_input_tokens === 'number') {
    result.cachedInputTokens = usage.cached_input_tokens
  }
  if (typeof usage.output_tokens === 'number') {
    result.outputTokens = usage.output_tokens
  }

  return Object.keys(result).length > 0 ? result : null
}

function readAgentMessageText(event: CodexJsonEvent) {
  const item = event.item
  if (!item || item.type !== 'agent_message' || typeof item.text !== 'string') {
    return null
  }
  return item.text
}

function extractAnswerLivePreview(raw: string) {
  return extractStructuredPreview(raw, ['full_answer_markdown', 'elevator_pitch', 'work_story', 'summary'])
}

function extractConsoleLivePreview(raw: string) {
  return extractStructuredPreview(raw, ['reply_markdown', 'summary', 'headline'])
}

function extractInterviewerLivePreview(raw: string) {
  return extractStructuredPreview(raw, ['interviewer_markdown', 'summary', 'headline'])
}

function extractStructuredPreview(raw: string, keys: string[]) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    for (const key of keys) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
    }
  } catch {
    return trimmed
  }

  return trimmed
}

export class AnswerJobManager {
  private readonly db: OfferPotatoDb
  private readonly jobs = new Map<string, JobStatus>()
  private readonly running = new Map<string, ChildProcessWithoutNullStreams>()

  constructor(db: OfferPotatoDb) {
    this.db = db
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null
  }

  listJobs() {
    return [...this.jobs.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  }

  async start(options: GenerateOptions) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const job: JobStatus = {
      id: jobId,
      kind: 'answer',
      liveLogs: [],
      model: options.model,
      questionId: options.questionId,
      reasoningEffort: options.reasoningEffort,
      stage: 'queued',
      startedAt: new Date().toISOString(),
      status: 'queued',
      summary: '等待生成'
    }
    this.jobs.set(jobId, job)
    publishCodexJob(job)

    void this.run(jobId, options)
    return job
  }

  cancel(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) {
      return null
    }
    if (job.status === 'ready' || job.status === 'failed' || job.status === 'cancelled') {
      return job
    }

    job.status = 'cancelled'
    job.stage = 'cancelled'
    job.summary = '任务已取消'
    job.finishedAt = new Date().toISOString()
    job.error = '任务已取消'
    pushCodexLiveLog(job, '任务已取消')
    publishCodexJob(job)

    const child = this.running.get(jobId)
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL')
        }
      }, 800)
    }

    return job
  }

  async restart(jobId: string, promptOverride?: string) {
    const current = this.jobs.get(jobId)
    if (!current) {
      return null
    }
    return this.start({
      autoReferenceCurrentDoc: true,
      currentDocumentId: null,
      model: current.model,
      promptOverride: promptOverride?.trim() || current.promptPreview,
      questionId: current.questionId,
      reasoningEffort: current.reasoningEffort,
      selectedDocumentIds: []
    })
  }

  private async run(jobId: string, options: GenerateOptions) {
    const job = this.jobs.get(jobId)
    if (!job) {
      return
    }

    job.status = 'running'
    job.stage = 'loading_question'
    job.summary = '读取题目与上下文'
    publishCodexJob(job)

    try {
      const question = this.db.getQuestion(options.questionId)
      if (!question) {
        throw new Error('Question not found')
      }
      job.questionText = question.text

      const selectedIds = new Set(options.selectedDocumentIds)
      if (options.autoReferenceCurrentDoc && options.currentDocumentId) {
        selectedIds.add(options.currentDocumentId)
      }

      job.stage = 'hydrating_context'
      job.summary = '整理引用文档与 mywork 证据'
      publishCodexJob(job)
      const selectedDocs = await hydrateDocuments(this.db.getDocumentsByIds([...selectedIds]))
      const workDocs = await hydrateDocuments(this.db.getDocumentsByIds(
        question.workMatches
          .map((match) => match.id)
          .slice(0, 4)
      ))
      const fallbackWorkDocs = await hydrateDocuments(this.db.getDocumentsByIds(
        question.workHintMatches
          .map((match) => match.id)
          .filter((id) => !question.workMatches.some((match) => match.id === id))
          .slice(0, 3)
      ))
      const skillTexts = await readPromptSkills(['answer-composer.md', 'mywork-triage.md', 'project-interviewer.md'])
      job.stage = 'building_prompt'
      job.summary = '拼装答案生成 prompt'
      publishCodexJob(job)
      const prompt = options.promptOverride?.trim()
        ? options.promptOverride.trim()
        : buildPrompt(skillTexts, question, workDocs, fallbackWorkDocs, selectedDocs)
      job.promptPreview = prompt
      publishCodexJob(job)
      const outputFile = path.join(os.tmpdir(), `offerpotato-live-${job.id}.json`)
      job.stage = 'running_codex'
      job.summary = 'Codex 正在生成个性化答案'
      pushCodexLiveLog(job, 'Codex 会话已启动')
      publishCodexJob(job)
      const raw = await runCodexExec({
        model: options.model,
        onEvent: (event) => {
          const usage = readCodexUsage(event)
          if (usage) {
            setCodexUsage(job, usage)
          }

          if (event.type === 'thread.started') {
            pushCodexLiveLog(job, '线程已建立')
            return
          }

          if (event.type === 'turn.started') {
            pushCodexLiveLog(job, '开始生成回答草稿')
            return
          }

          if (event.type === 'turn.completed') {
            pushCodexLiveLog(job, '结构化输出已完成')
          }
        },
        onLogLine: (line, stream) => {
          if (stream === 'stderr') {
            pushCodexLiveLog(job, line)
          }
        },
        onMessage: (text) => {
          setCodexLiveText(job, extractAnswerLivePreview(text))
        },
        onSpawn: (child) => {
          this.running.set(jobId, child)
        },
        outputFile,
        prompt,
        reasoningEffort: options.reasoningEffort,
        schemaPath: SCHEMA_PATH
      })
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }
      const parsed = JSON.parse(raw) as { citations?: unknown[]; full_answer_markdown?: string }
      const generatedId = `generated_${options.questionId}`
      const updatedAt = new Date().toISOString()

      job.stage = 'persisting'
      job.summary = '写入数据库与答案缓存'
      publishCodexJob(job)
      this.db.upsertGeneratedAnswer({
        id: generatedId,
        questionId: options.questionId,
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        status: 'ready',
        outputJson: JSON.stringify(parsed),
        outputMarkdown: parsed.full_answer_markdown ?? '',
        citationsJson: JSON.stringify(parsed.citations ?? []),
        updatedAt
      })
      this.db.appendGeneratedAnswerRun({
        id: `${generatedId}:${updatedAt}`,
        questionId: options.questionId,
        model: options.model,
        reasoningEffort: options.reasoningEffort,
        status: 'ready',
        outputJson: JSON.stringify(parsed),
        outputMarkdown: parsed.full_answer_markdown ?? '',
        citationsJson: JSON.stringify(parsed.citations ?? []),
        updatedAt
      })

      await fs.writeFile(
        path.join(GENERATED_DIR, `${options.questionId}.json`),
        JSON.stringify(parsed, null, 2),
        'utf8'
      )

      job.status = 'ready'
      job.stage = 'ready'
      job.summary = '答案已生成'
      job.result = parsed
      job.finishedAt = new Date().toISOString()
      publishCodexJob(job)
    } catch (error) {
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }
      job.status = 'failed'
      job.stage = 'failed'
      job.summary = '答案生成失败'
      job.error = error instanceof Error ? error.message : String(error)
      job.finishedAt = new Date().toISOString()
      pushCodexLiveLog(job, job.error)
      publishCodexJob(job)
    } finally {
      this.running.delete(jobId)
    }
  }
}

export class ManagedCodexConsoleManager {
  private readonly db: OfferPotatoDb
  private readonly jobs = new Map<string, ConsoleJobStatus>()
  private readonly running = new Map<string, ChildProcessWithoutNullStreams>()

  constructor(db: OfferPotatoDb) {
    this.db = db
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null
  }

  listJobs() {
    return [...this.jobs.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  }

  async start(options: ConsoleOptions) {
    const jobId = `console_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const job: ConsoleJobStatus = {
      id: jobId,
      kind: 'console',
      liveLogs: [],
      messagePreview: trimExcerpt(options.message, 600),
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      stage: 'queued',
      startedAt: new Date().toISOString(),
      status: 'queued',
      summary: '等待处理'
    }

    this.jobs.set(jobId, job)
    publishCodexJob(job)
    void this.run(jobId, options)
    return job
  }

  async restart(jobId: string, promptOverride?: string) {
    const current = this.jobs.get(jobId)
    if (!current) {
      return null
    }
    return this.start({
      autoReferenceCurrentDoc: false,
      conversation: [],
      currentDocumentId: null,
      message: current.messagePreview ?? '继续处理当前任务',
      model: current.model,
      promptOverride: promptOverride?.trim() || current.promptPreview,
      reasoningEffort: current.reasoningEffort,
      selectedDocumentIds: [],
      selectedProjectIds: []
    })
  }

  cancel(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) {
      return null
    }
    if (job.status === 'ready' || job.status === 'failed' || job.status === 'cancelled') {
      return job
    }

    job.status = 'cancelled'
    job.stage = 'cancelled'
    job.summary = '任务已取消'
    job.finishedAt = new Date().toISOString()
    job.error = '任务已取消'
    pushCodexLiveLog(job, '任务已取消')
    publishCodexJob(job)

    const child = this.running.get(jobId)
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL')
        }
      }, 800)
    }

    return job
  }

  private async run(jobId: string, options: ConsoleOptions) {
    const job = this.jobs.get(jobId)
    if (!job) {
      return
    }

    job.status = 'running'
    job.stage = 'collecting_context'
    job.summary = '整理当前文档与引用上下文'
    publishCodexJob(job)

    try {
      const selectedIds = new Set(options.selectedDocumentIds)
      if (options.autoReferenceCurrentDoc && options.currentDocumentId) {
        selectedIds.add(options.currentDocumentId)
      }

      const hydratedDocs = await hydrateDocuments(this.db.getDocumentsByIds([...selectedIds]))
      const currentDoc = options.autoReferenceCurrentDoc && options.currentDocumentId
        ? hydratedDocs.find((document) => document.id === options.currentDocumentId) ?? null
        : null
      const selectedDocs = hydratedDocs.filter((document) => document.id !== currentDoc?.id)

      const selectedProjects = await Promise.all(options.selectedProjectIds.map(async (projectId) => {
        const project = this.db.getWorkProject(projectId)
        if (!project) {
          return null
        }
        const projectDocIds = project.documents
          .slice(0, 4)
          .map((item) => item.id)
        const hydratedProjectDocs = await hydrateDocuments(this.db.getDocumentsByIds(projectDocIds))
        return {
          ...project,
          hydratedDocs: hydratedProjectDocs
        }
      }))

      const skillText = await readPromptSkills(['codex-console.md'])
      job.stage = 'building_prompt'
      job.summary = '拼装受管控制台 prompt'
      publishCodexJob(job)
      const prompt = options.promptOverride?.trim()
        ? options.promptOverride.trim()
        : buildConsolePrompt(skillText, {
          conversation: options.conversation,
          currentDoc,
          message: options.message,
          selectedDocs,
          selectedProjects: selectedProjects.filter((item): item is NonNullable<typeof item> => Boolean(item))
        })
      job.promptPreview = prompt
      publishCodexJob(job)

      const outputFile = path.join(os.tmpdir(), `offerpotato-console-${job.id}.json`)
      job.stage = 'running_codex'
      job.summary = 'Codex 正在处理中'
      pushCodexLiveLog(job, 'Codex 会话已启动')
      publishCodexJob(job)
      const raw = await runCodexExec({
        model: options.model,
        onEvent: (event) => {
          const usage = readCodexUsage(event)
          if (usage) {
            setCodexUsage(job, usage)
          }

          if (event.type === 'thread.started') {
            pushCodexLiveLog(job, '线程已建立')
            return
          }

          if (event.type === 'turn.started') {
            pushCodexLiveLog(job, '开始处理当前请求')
            return
          }

          if (event.type === 'turn.completed') {
            pushCodexLiveLog(job, '回复结构已生成')
          }
        },
        onLogLine: (line, stream) => {
          if (stream === 'stderr') {
            pushCodexLiveLog(job, line)
          }
        },
        onMessage: (text) => {
          setCodexLiveText(job, extractConsoleLivePreview(text))
        },
        onSpawn: (child) => {
          this.running.set(jobId, child)
        },
        outputFile,
        prompt,
        reasoningEffort: options.reasoningEffort,
        schemaPath: CONSOLE_SCHEMA_PATH,
        withFullAccess: true
      })
      const parsed = JSON.parse(raw) as ConsoleReply

      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }

      job.status = 'ready'
      job.stage = 'ready'
      job.summary = '回复已生成'
      job.result = parsed
      job.finishedAt = new Date().toISOString()
      publishCodexJob(job)
    } catch (error) {
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }
      job.status = 'failed'
      job.stage = 'failed'
      job.summary = '控制台任务失败'
      job.error = error instanceof Error ? error.message : String(error)
      job.finishedAt = new Date().toISOString()
      pushCodexLiveLog(job, job.error)
      publishCodexJob(job)
    } finally {
      this.running.delete(jobId)
    }
  }
}

export class InterviewerModeManager {
  private readonly db: OfferPotatoDb
  private readonly jobs = new Map<string, InterviewerJobStatus>()
  private readonly running = new Map<string, ChildProcessWithoutNullStreams>()

  constructor(db: OfferPotatoDb) {
    this.db = db
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null
  }

  listJobs() {
    return [...this.jobs.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  }

  async start(options: InterviewerOptions) {
    const jobId = `interviewer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const previewSource = options.candidateAnswer?.trim() || options.seedFollowUp
    const job: InterviewerJobStatus = {
      id: jobId,
      kind: 'interviewer',
      liveLogs: [],
      messagePreview: trimExcerpt(previewSource, 420),
      model: 'gpt-5.4',
      promptPreview: undefined,
      questionId: options.questionId,
      reasoningEffort: options.reasoningEffort,
      seedFollowUp: options.seedFollowUp,
      stage: 'queued',
      startedAt: new Date().toISOString(),
      status: 'queued',
      summary: '等待面试官发问'
    }

    this.jobs.set(jobId, job)
    publishCodexJob(job)
    void this.run(jobId, options)
    return job
  }

  async restart(jobId: string, promptOverride?: string) {
    const current = this.jobs.get(jobId)
    if (!current) {
      return null
    }

    return this.start({
      candidateAnswer: current.messagePreview,
      conversation: [],
      promptOverride: promptOverride?.trim() || current.promptPreview,
      questionId: current.questionId,
      reasoningEffort: current.reasoningEffort,
      seedFollowUp: current.seedFollowUp
    })
  }

  cancel(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job) {
      return null
    }
    if (job.status === 'ready' || job.status === 'failed' || job.status === 'cancelled') {
      return job
    }

    job.status = 'cancelled'
    job.stage = 'cancelled'
    job.summary = '面试官回合已取消'
    job.finishedAt = new Date().toISOString()
    job.error = '任务已取消'
    pushCodexLiveLog(job, '任务已取消')
    publishCodexJob(job)

    const child = this.running.get(jobId)
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL')
        }
      }, 800)
    }

    return job
  }

  private async run(jobId: string, options: InterviewerOptions) {
    const job = this.jobs.get(jobId)
    if (!job) {
      return
    }

    job.status = 'running'
    job.stage = 'loading_question'
    job.summary = '读取题目、答案和证据上下文'
    publishCodexJob(job)

    try {
      const question = this.db.getQuestion(options.questionId)
      if (!question) {
        throw new Error('Question not found')
      }
      job.questionText = question.text

      job.stage = 'hydrating_context'
      job.summary = '整理主线锚点与项目证据'
      publishCodexJob(job)
      const workDocs = await hydrateDocuments(this.db.getDocumentsByIds(
        question.workMatches
          .map((match) => match.id)
          .slice(0, 4)
      ))
      const fallbackWorkDocs = await hydrateDocuments(this.db.getDocumentsByIds(
        question.workHintMatches
          .map((match) => match.id)
          .filter((id) => !question.workMatches.some((match) => match.id === id))
          .slice(0, 3)
      ))
      const skillText = await readPromptSkills(['interviewer-pressure.md'])

      job.stage = 'building_prompt'
      job.summary = '拼装面试官压力面 prompt'
      publishCodexJob(job)
      const prompt = options.promptOverride?.trim()
        ? options.promptOverride.trim()
        : buildInterviewerPrompt(skillText, {
          candidateAnswer: options.candidateAnswer?.trim() ?? '',
          conversation: options.conversation,
          fallbackWorkDocs,
          question,
          seedFollowUp: options.seedFollowUp,
          workDocs
        })
      job.promptPreview = prompt
      publishCodexJob(job)

      const outputFile = path.join(os.tmpdir(), `offerpotato-interviewer-${job.id}.json`)
      job.stage = 'running_codex'
      job.summary = options.candidateAnswer?.trim()
        ? '面试官正在继续深挖'
        : '面试官正在进入首轮施压'
      pushCodexLiveLog(job, 'Codex 会话已启动')
      publishCodexJob(job)
      const raw = await runCodexExec({
        model: 'gpt-5.4',
        onEvent: (event) => {
          const usage = readCodexUsage(event)
          if (usage) {
            setCodexUsage(job, usage)
          }

          if (event.type === 'thread.started') {
            pushCodexLiveLog(job, '线程已建立')
            return
          }

          if (event.type === 'turn.started') {
            pushCodexLiveLog(job, '面试官正在组织追问')
            return
          }

          if (event.type === 'turn.completed') {
            pushCodexLiveLog(job, '追问结构已生成')
          }
        },
        onLogLine: (line, stream) => {
          if (stream === 'stderr') {
            pushCodexLiveLog(job, line)
          }
        },
        onMessage: (text) => {
          setCodexLiveText(job, extractInterviewerLivePreview(text))
        },
        onSpawn: (child) => {
          this.running.set(jobId, child)
        },
        outputFile,
        prompt,
        reasoningEffort: options.reasoningEffort,
        schemaPath: INTERVIEWER_SCHEMA_PATH
      })
      const parsed = JSON.parse(raw) as InterviewerReply

      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }

      job.status = 'ready'
      job.stage = 'ready'
      job.summary = '面试官回合已返回'
      job.result = parsed
      job.finishedAt = new Date().toISOString()
      publishCodexJob(job)
    } catch (error) {
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }
      job.status = 'failed'
      job.stage = 'failed'
      job.summary = '面试官模式失败'
      job.error = error instanceof Error ? error.message : String(error)
      job.finishedAt = new Date().toISOString()
      pushCodexLiveLog(job, job.error)
      publishCodexJob(job)
    } finally {
      this.running.delete(jobId)
    }
  }
}

function buildPrompt(
  skillText: string,
  question: NonNullable<ReturnType<OfferPotatoDb['getQuestion']>>,
  workDocs: ReturnType<OfferPotatoDb['getDocumentsByIds']>,
  fallbackWorkDocs: ReturnType<OfferPotatoDb['getDocumentsByIds']>,
  selectedDocs: ReturnType<OfferPotatoDb['getDocumentsByIds']>
) {
  const guideMatches = question.guideMatches as Array<{
    content: string
    documentTitle: string
    heading: string
    path: string
  }>
  const workMatches = question.workMatches as Array<{
    id: string
    meta: { project?: string; retrievalEvidence?: Record<string, unknown> }
    path: string
    score: number
    title: string
  }>
  const workHintMatches = question.workHintMatches as Array<{
    id: string
    meta: { project?: string; retrievalEvidence?: Record<string, unknown> }
    path: string
    score: number
    title: string
  }>
  const localizedQuestion = typeof (question.metadata as { translatedText?: unknown })?.translatedText === 'string'
    && String((question.metadata as { translatedText?: string }).translatedText).trim()
      ? String((question.metadata as { translatedText?: string }).translatedText).trim()
      : null
  const workDocMap = new Map(workDocs.map((document) => [document.id, document]))
  const fallbackWorkDocMap = new Map(fallbackWorkDocs.map((document) => [document.id, document]))
  const explicitDocs = selectedDocs as Array<{
    content: string
    path: string
    title: string
  }>

  const guideBlock = guideMatches.length > 0
    ? guideMatches.map((match, index) => `## Guide Anchor ${index + 1}
Label: ${match.documentTitle} / ${match.heading}
Path: ${match.path}
Excerpt:
${trimExcerpt(match.content)}`).join('\n\n')
    : 'No linked guide anchors were found.'

  const workBlock = workMatches.length > 0
    ? workMatches.map((match, index) => {
        const workDoc = workDocMap.get(match.id)
        const evidence = formatRetrievalEvidence(match.meta.retrievalEvidence)
        return `## Work Match ${index + 1}
Label: ${match.title}
Path: ${match.path}
Score: ${match.score}
Note: ${match.meta.project ?? 'work'}
Evidence: ${evidence}
Excerpt:
${trimExcerpt(workDoc?.content ?? '', 1800)}`
      }).join('\n\n')
    : 'No linked work documents were found.'

  const fallbackWorkBlock = workHintMatches.length > 0
    ? workHintMatches.map((match, index) => {
        const workDoc = fallbackWorkDocMap.get(match.id)
        const evidence = formatRetrievalEvidence(match.meta.retrievalEvidence)
        return `## Source-backed Fallback ${index + 1}
Label: ${match.title}
Path: ${match.path}
Score: ${match.score}
Note: ${match.meta.project ?? 'work'}
Evidence: ${evidence}
Excerpt:
${trimExcerpt(workDoc?.content ?? '', 1600)}`
      }).join('\n\n')
    : 'No fallback work files were inspected.'

  const selectedBlock = explicitDocs.length > 0
    ? explicitDocs.map((document, index) => `## Explicit Reference ${index + 1}
Label: ${document.title}
Path: ${document.path}
Excerpt:
${trimExcerpt(document.content, 2200)}`).join('\n\n')
    : 'No explicit file references were selected.'

  return `${skillText}

# Interview Question
Original: ${question.text}
Preferred Chinese phrasing: ${localizedQuestion ?? 'N/A'}

# Linked Guide Anchors
${guideBlock}

# Work Evidence Assessment
Status: ${question.workEvidenceStatus}
Instruction: ${buildWorkEvidenceInstruction(question.workEvidenceStatus)}

# Candidate Work Matches
${workBlock}

# Source-backed Fallback Work
${fallbackWorkBlock}

# Explicit References
${selectedBlock}

# Output contract
Return JSON only. It must match the provided schema exactly.`
}

function buildConsolePrompt(
  skillText: string,
  input: {
    conversation: ConsoleConversationTurn[]
    currentDoc: PromptDocument | null
    message: string
    selectedDocs: PromptDocument[]
    selectedProjects: ConsoleProjectContext[]
  }
) {
  const historyBlock = input.conversation.length > 0
    ? input.conversation
      .slice(-8)
      .map((item, index) => `## ${item.role === 'user' ? 'User' : 'Assistant'} ${index + 1}\n${trimExcerpt(item.content, 2200)}`)
      .join('\n\n')
    : 'No previous conversation.'

  const currentDocumentBlock = input.currentDoc
    ? `## Current Document
Label: ${input.currentDoc.title}
Reference Path: ${input.currentDoc.path}
Filesystem Path: ${input.currentDoc.watchPath ?? 'N/A'}
Excerpt:
${trimExcerpt(input.currentDoc.content, 3200)}`
    : 'No current document is attached.'

  const selectedFilesBlock = input.selectedDocs.length > 0
    ? input.selectedDocs.map((document, index) => `## Selected File ${index + 1}
Label: ${document.title}
Reference Path: ${document.path}
Filesystem Path: ${document.watchPath ?? 'N/A'}
Kind: ${document.kind}
Excerpt:
${trimExcerpt(document.content, 2400)}`).join('\n\n')
    : 'No extra file references were selected.'

  const selectedProjectsBlock = input.selectedProjects.length > 0
    ? input.selectedProjects.map((project, index) => `## Selected Project ${index + 1}
Name: ${project.name}
Reference Root: ${project.rootPath}
Status: ${project.status}
Summary: ${project.summary}
Opening Pitch: ${project.prep.openingPitch}
Why It Matters: ${project.prep.whyThisProjectMatters}
Interview Arc:
${project.prep.interviewArc.map((item) => `- ${item}`).join('\n') || '- None'}
Highlight Facts:
${project.prep.highlightFacts.slice(0, 6).map((item) => `- ${item.label}: ${item.value} (${item.sourceLabel})`).join('\n') || '- None'}
Representative Files:
${project.hydratedDocs.map((document) => `### ${document.title}
Reference Path: ${document.path}
Filesystem Path: ${document.watchPath ?? 'N/A'}
Excerpt:
${trimExcerpt(document.content, 1800)}`).join('\n\n') || 'No representative files were available.'}`).join('\n\n')
    : 'No project directories were selected.'

  return `${skillText}

# User Intent
The user is interacting with a managed Codex console inside a documentation website.
If the request implies code or document edits and the file paths are available, perform the edits directly.
If you change files, report them in changed_files with concise Chinese summaries.
If you only answer or review, leave changed_files empty.

# Recent Conversation
${historyBlock}

# Current Document
${currentDocumentBlock}

# Selected Files
${selectedFilesBlock}

# Selected Project Directories
${selectedProjectsBlock}

# New User Message
${input.message}

# Output contract
Return JSON only. It must match the provided schema exactly.`
}

function buildInterviewerPrompt(
  skillText: string,
  input: {
    candidateAnswer: string
    conversation: ConsoleConversationTurn[]
    fallbackWorkDocs: PromptDocument[]
    question: NonNullable<ReturnType<OfferPotatoDb['getQuestion']>>
    seedFollowUp: string
    workDocs: PromptDocument[]
  }
) {
  const question = input.question
  const localizedQuestion = typeof (question.metadata as { translatedText?: unknown })?.translatedText === 'string'
    && String((question.metadata as { translatedText?: string }).translatedText).trim()
      ? String((question.metadata as { translatedText?: string }).translatedText).trim()
      : null

  const guideBlock = question.guideMatches.length > 0
    ? question.guideMatches.slice(0, 4).map((match, index) => `## Guide Anchor ${index + 1}
Label: ${match.documentTitle} / ${match.heading}
Path: ${match.path}
Excerpt:
${trimExcerpt(match.content, 1800)}`).join('\n\n')
    : 'No linked guide anchors were found.'

  const workBlock = question.workMatches.length > 0
    ? question.workMatches.slice(0, 3).map((match, index) => {
        const workDoc = input.workDocs.find((item) => item.id === match.id)
        return `## Direct Work Evidence ${index + 1}
Label: ${match.title}
Path: ${match.path}
Score: ${match.score}
Evidence: ${formatRetrievalEvidence(match.meta.retrievalEvidence as Record<string, unknown> | undefined)}
Excerpt:
${trimExcerpt(workDoc?.content ?? '', 1600)}`
      }).join('\n\n')
    : 'No direct work evidence was found.'

  const fallbackWorkBlock = question.workHintMatches.length > 0
    ? question.workHintMatches.slice(0, 3).map((match, index) => {
        const workDoc = input.fallbackWorkDocs.find((item) => item.id === match.id)
        return `## Adjacent Work Evidence ${index + 1}
Label: ${match.title}
Path: ${match.path}
Score: ${match.score}
Evidence: ${formatRetrievalEvidence(match.meta.retrievalEvidence as Record<string, unknown> | undefined)}
Excerpt:
${trimExcerpt(workDoc?.content ?? '', 1500)}`
      }).join('\n\n')
    : 'No adjacent work evidence was inspected.'

  const generated = question.generated?.output as {
    citations?: Array<{ kind?: string; label?: string; path?: string }>
    elevator_pitch?: string
    follow_ups?: string[]
    full_answer_markdown?: string
    knowledge_map?: Array<{ concept?: string; why_it_matters?: string }>
    work_evidence_note?: string
    work_evidence_status?: string
    work_story?: string
  } | null

  const answerPackageBlock = generated
    ? `## Candidate Prepared Answer Package
20-second Opening:
${generated.elevator_pitch ?? 'N/A'}

Work Evidence Status:
${generated.work_evidence_status ?? 'N/A'}

Work Evidence Note:
${generated.work_evidence_note ?? 'N/A'}

Work Story:
${generated.work_story ?? 'N/A'}

Knowledge Map:
${generated.knowledge_map?.map((item) => `- ${item.concept ?? 'concept'}: ${item.why_it_matters ?? ''}`).join('\n') || '- None'}

Likely Follow-ups:
${generated.follow_ups?.map((item) => `- ${item}`).join('\n') || '- None'}

Full Answer:
${trimExcerpt(generated.full_answer_markdown ?? '', 3200)}`
    : 'No generated answer package is available yet.'

  const historyBlock = input.conversation.length > 0
    ? input.conversation
      .slice(-10)
      .map((item, index) => `## ${item.role === 'user' ? 'Candidate' : 'Interviewer'} ${index + 1}
${trimExcerpt(item.content, 1800)}`)
      .join('\n\n')
    : 'No prior conversation.'

  const latestCandidateBlock = input.candidateAnswer.trim()
    ? input.candidateAnswer.trim()
    : 'No candidate answer yet. Start the interview round by asking the first sharp question.'

  const candidateTurnCount = input.conversation.filter((item) => item.role === 'user').length + (input.candidateAnswer.trim() ? 1 : 0)

  return `${skillText}

# Interview Context
Original Question: ${question.text}
Preferred Chinese phrasing: ${localizedQuestion ?? 'N/A'}
Question Type: ${question.questionType}
Difficulty: ${question.difficulty}
Source: ${question.sourceTitle}
Source Path: ${question.sourcePath}

# Seed Follow-up To Start From
${input.seedFollowUp}

# Guide Anchors
${guideBlock}

# Work Evidence Status
${question.workEvidenceStatus}

# Direct Work Evidence
${workBlock}

# Adjacent Work Evidence
${fallbackWorkBlock}

# Prepared Answer Package
${answerPackageBlock}

# Interview Strategy Rules
- First diagnose the latest candidate answer. Decide what is correct, what is vague, what is unsupported, and what sounds like overclaim.
- Then choose exactly one primary drill axis for this round. Do not branch into multiple unrelated topics unless the candidate answer is clearly contradictory.
- Good drill axes: mechanism, formula, tensor shape, latency bottleneck, memory bottleneck, metric choice, failure mode, boundary condition, project ownership, online indicator, ablation evidence.
- If the candidate answer is decent, pivot to assumptions, edge cases, or implementation tradeoffs instead of repeating the same question.
- If the candidate answer is weak, narrow the scope and ask for one concrete thing: a formula, a metric, a code path, a tensor shape, a latency number, or a failure case.
- If the provided mywork evidence is weak, do not keep forcing project linkage. Stay on fundamentals.
- Never answer for the candidate. Stay adversarial, concise, and professional.

# Conversation So Far
${historyBlock}

# Conversation Depth
Candidate answered ${candidateTurnCount} time(s) in this session.

# Latest Candidate Answer
${latestCandidateBlock}

# Output contract
Return JSON only. It must match the provided schema exactly.`
}

async function hydrateDocuments(documents: ReturnType<OfferPotatoDb['getDocumentsByIds']>) {
  return Promise.all(documents.map(async (document) => ({
    ...document,
    content: await readLiveContent(document.watchPath ?? '', document.content)
  })))
}

function buildWorkEvidenceInstruction(status: string) {
  if (status === 'direct') {
    return 'Use the direct mywork evidence only where it truly sharpens the answer, and keep the claims source-backed. If the question is very basic and project linkage adds little value, answer cleanly from the guide instead of forcing a project tie-in.'
  }
  if (status === 'adjacent') {
    return 'Direct mywork evidence is weak or absent. You may use the fallback files only as adjacent framing, and you must explicitly say the project does not directly cover the exact concept. If the question is simple, it is better to skip project linkage entirely than to force a weak connection.'
  }
  return 'No usable mywork evidence was found. Explicitly say that, do not fabricate ownership or implementation details, and answer from guide knowledge plus dynamic supplement only. Do not invent a project bridge just to satisfy the template.'
}

function formatRetrievalEvidence(evidence: Record<string, unknown> | undefined) {
  if (!evidence) {
    return 'No retrieval trace'
  }

  const chunkEvidence = Array.isArray(evidence.chunkEvidence)
    ? evidence.chunkEvidence as Array<{ heading?: string; score?: number }>
    : []

  if (chunkEvidence.length > 0) {
    return chunkEvidence
      .slice(0, 2)
      .map((item) => `${item.heading ?? 'chunk'} (${Number(item.score ?? 0).toFixed(2)})`)
      .join('; ')
  }

  const heading = typeof evidence.heading === 'string' ? evidence.heading : ''
  if (heading) {
    return heading
  }

  return 'Heuristic retrieval only'
}

async function readPromptSkills(fileNames: string[]) {
  const chunks = await Promise.all(fileNames.map(async (fileName) => (
    fs.readFile(path.join(SKILLS_DIR, fileName), 'utf8')
  )))
  return chunks.join('\n\n')
}

type RunCodexExecOptions = {
  model: string
  onEvent?: (event: CodexJsonEvent) => void
  onLogLine?: (line: string, stream: 'stderr' | 'stdout') => void
  onMessage?: (text: string) => void
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void
  outputFile: string
  prompt: string
  reasoningEffort: ReasoningEffort
  schemaPath: string
  withFullAccess?: boolean
}

async function runCodexExec(options: RunCodexExecOptions) {
  return new Promise<string>((resolve, reject) => {
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--cd',
      ROOT_DIR,
      '--json',
      '--output-schema',
      options.schemaPath,
      '--output-last-message',
      options.outputFile
    ]

    if (options.withFullAccess) {
      args.push('--dangerously-bypass-approvals-and-sandbox')
    }

    args.push(
      '-m',
      options.model,
      '-c',
      `model_reasoning_effort="${options.reasoningEffort}"`,
      '-'
    )

    const child = spawn('codex', args, {
      cwd: ROOT_DIR,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    options.onSpawn?.(child)

    let stderr = ''
    let stdoutBuffer = ''
    let stderrBuffer = ''

    const flushBuffer = (buffer: string, stream: 'stderr' | 'stdout') => {
      const lines = buffer.split(/\r?\n/)
      const rest = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          continue
        }
        if (stream === 'stdout') {
          try {
            const event = JSON.parse(trimmed) as CodexJsonEvent
            if (typeof event.type === 'string') {
              options.onEvent?.(event)
              const message = readAgentMessageText(event)
              if (message) {
                options.onMessage?.(message)
              }
              continue
            }
          } catch {
            // Fall through to raw-line handling.
          }
        }
        options.onLogLine?.(trimmed, stream)
      }
      return rest
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString()
      stdoutBuffer = flushBuffer(stdoutBuffer, 'stdout')
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      stderrBuffer += text
      stderrBuffer = flushBuffer(stderrBuffer, 'stderr')
    })

    child.on('close', async (code) => {
      if (stdoutBuffer.trim()) {
        flushBuffer(`${stdoutBuffer}\n`, 'stdout')
      }
      if (stderrBuffer.trim()) {
        flushBuffer(`${stderrBuffer}\n`, 'stderr')
      }
      if (code === null) {
        reject(new Error('codex terminated before producing output'))
        return
      }
      if (code !== 0) {
        reject(new Error(stderr || `codex exited with code ${code}`))
        return
      }
      try {
        const result = await fs.readFile(options.outputFile, 'utf8')
        resolve(result)
      } catch (error) {
        reject(error)
      }
    })

    child.stdin.write(options.prompt)
    child.stdin.end()
  })
}

export function attachCodexPty(socket: WebSocket) {
  const bridge = spawn(
    'python3',
    [path.join(ROOT_DIR, 'scripts', 'codex_pty_bridge.py'), ROOT_DIR],
    {
      cwd: ROOT_DIR,
      stdio: ['pipe', 'pipe', 'inherit']
    }
  )

  let stdoutBuffer = ''

  bridge.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) {
        continue
      }
      try {
        const message = JSON.parse(line) as
          | { type: 'output'; data: string }
          | { type: 'exit'; exitCode: number }
          | { message: string; type: 'error' }
        if (message.type === 'output') {
          socket.send(JSON.stringify({
            type: 'output',
            data: Buffer.from(message.data, 'base64').toString('utf8')
          }))
          continue
        }
        socket.send(JSON.stringify(message))
      } catch {
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Invalid PTY bridge output'
        }))
      }
    }
  })

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as
        | { type: 'input'; data: string }
        | { cols: number; rows: number; type: 'resize' }
        | { model?: string; reasoningEffort?: ReasoningEffort; type: 'start' }
      if (bridge.stdin.writable) {
        bridge.stdin.write(`${JSON.stringify(message)}\n`)
      }
    } catch {
      socket.send(JSON.stringify({
        type: 'error',
        message: 'Invalid terminal message'
      }))
    }
  })

  socket.on('close', () => {
    bridge.kill()
  })
}
