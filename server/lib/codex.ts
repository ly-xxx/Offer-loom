import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { WebSocket } from 'ws'

import { CONSOLE_SCHEMA_PATH, GENERATED_DIR, INTERVIEWER_SCHEMA_PATH, ROOT_DIR, SCHEMA_PATH, SKILLS_DIR } from './constants.js'
import type { OfferLoomDb } from './db.js'
import { readLiveContent, trimExcerpt } from './text.js'

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

type JobStatus = {
  error?: string
  finishedAt?: string
  id: string
  kind: 'answer'
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
  model: string
  messagePreview?: string
  promptPreview?: string
  reasoningEffort: ReasoningEffort
  result?: ConsoleReply
  stage: string
  startedAt: string
  status: 'cancelled' | 'failed' | 'queued' | 'ready' | 'running'
  summary: string
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

export class AnswerJobManager {
  private readonly db: OfferLoomDb
  private readonly jobs = new Map<string, JobStatus>()
  private readonly running = new Map<string, ChildProcessWithoutNullStreams>()

  constructor(db: OfferLoomDb) {
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
      model: options.model,
      questionId: options.questionId,
      reasoningEffort: options.reasoningEffort,
      stage: 'queued',
      startedAt: new Date().toISOString(),
      status: 'queued',
      summary: '等待生成'
    }
    this.jobs.set(jobId, job)

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
      const prompt = options.promptOverride?.trim()
        ? options.promptOverride.trim()
        : buildPrompt(skillTexts, question, workDocs, fallbackWorkDocs, selectedDocs)
      job.promptPreview = prompt
      const outputFile = path.join(os.tmpdir(), `offerloom-live-${job.id}.json`)
      job.stage = 'running_codex'
      job.summary = 'Codex 正在生成个性化答案'
      const raw = await runCodexExec({
        model: options.model,
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
    } catch (error) {
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }
      job.status = 'failed'
      job.stage = 'failed'
      job.summary = '答案生成失败'
      job.error = error instanceof Error ? error.message : String(error)
      job.finishedAt = new Date().toISOString()
    } finally {
      this.running.delete(jobId)
    }
  }
}

export class ManagedCodexConsoleManager {
  private readonly db: OfferLoomDb
  private readonly jobs = new Map<string, ConsoleJobStatus>()
  private readonly running = new Map<string, ChildProcessWithoutNullStreams>()

  constructor(db: OfferLoomDb) {
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
      messagePreview: trimExcerpt(options.message, 600),
      model: options.model,
      reasoningEffort: options.reasoningEffort,
      stage: 'queued',
      startedAt: new Date().toISOString(),
      status: 'queued',
      summary: '等待处理'
    }

    this.jobs.set(jobId, job)
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

      const outputFile = path.join(os.tmpdir(), `offerloom-console-${job.id}.json`)
      job.stage = 'running_codex'
      job.summary = 'Codex 正在处理中'
      const raw = await runCodexExec({
        model: options.model,
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
    } catch (error) {
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }
      job.status = 'failed'
      job.stage = 'failed'
      job.summary = '控制台任务失败'
      job.error = error instanceof Error ? error.message : String(error)
      job.finishedAt = new Date().toISOString()
    } finally {
      this.running.delete(jobId)
    }
  }
}

export class InterviewerModeManager {
  private readonly db: OfferLoomDb
  private readonly jobs = new Map<string, InterviewerJobStatus>()
  private readonly running = new Map<string, ChildProcessWithoutNullStreams>()

  constructor(db: OfferLoomDb) {
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

    try {
      const question = this.db.getQuestion(options.questionId)
      if (!question) {
        throw new Error('Question not found')
      }
      job.questionText = question.text

      job.stage = 'hydrating_context'
      job.summary = '整理主线锚点与项目证据'
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

      const outputFile = path.join(os.tmpdir(), `offerloom-interviewer-${job.id}.json`)
      job.stage = 'running_codex'
      job.summary = options.candidateAnswer?.trim()
        ? '面试官正在继续深挖'
        : '面试官正在进入首轮施压'
      const raw = await runCodexExec({
        model: 'gpt-5.4',
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
    } catch (error) {
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }
      job.status = 'failed'
      job.stage = 'failed'
      job.summary = '面试官模式失败'
      job.error = error instanceof Error ? error.message : String(error)
      job.finishedAt = new Date().toISOString()
    } finally {
      this.running.delete(jobId)
    }
  }
}

function buildPrompt(
  skillText: string,
  question: NonNullable<ReturnType<OfferLoomDb['getQuestion']>>,
  workDocs: ReturnType<OfferLoomDb['getDocumentsByIds']>,
  fallbackWorkDocs: ReturnType<OfferLoomDb['getDocumentsByIds']>,
  selectedDocs: ReturnType<OfferLoomDb['getDocumentsByIds']>
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
    question: NonNullable<ReturnType<OfferLoomDb['getQuestion']>>
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

# Conversation So Far
${historyBlock}

# Latest Candidate Answer
${latestCandidateBlock}

# Output contract
Return JSON only. It must match the provided schema exactly.`
}

async function hydrateDocuments(documents: ReturnType<OfferLoomDb['getDocumentsByIds']>) {
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
    child.stdout.on('data', () => {})
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', async (code) => {
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
