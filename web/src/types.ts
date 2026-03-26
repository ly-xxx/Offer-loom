export type MetaResponse = {
  counts: {
    documents: number
    generatedAnswers: number
    guides: number
    questions: number
    translatedQuestions: number
    workProjects: number
  }
  embeddingError: string
  embeddingModel: string
  models: string[]
  reasoningEfforts: string[]
  retrievalMode: string
  workIndexSummary: {
    indexed?: number
    total?: number
  }
}

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

export type SourcesConfig = {
  guides: OfferLoomSource[]
  myWork: OfferLoomWorkSource
  questionBanks: OfferLoomSource[]
}

export type SourcesSettingsSnapshot = {
  autoDetectedMyWorkPath: string | null
  config: SourcesConfig
  defaultConfig: SourcesConfig
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

export type UiTypographySettings = {
  answerFontSize: number
  docFontSize: number
  docHeadingScale: number
  sidebarFontSize: number
}

export type DocumentListItem = {
  ext: string
  id: string
  kind: string
  knowledgeHitCount?: number
  path: string
  relPath: string
  sourceId: string
  title: string
  updatedAt: string
}

export type QuestionListItem = {
  categoryId: string
  categoryLabel: string
  categoryOrder: number
  company: string | null
  displayText: string
  difficulty: string
  generatedCount: number
  guideFallbackCount: number
  generatedStatus: string | null
  guideLinkCount: number
  id: string
  interviewDate: string | null
  interviewFacet: string
  importOrigin: string | null
  lastGeneratedAt: string | null
  questionType: string
  role: string | null
  sourceId: string
  sourcePath: string
  sourceTitle: string
  text: string
  translatedText: string | null
  workLinkCount: number
}

export type InterviewImportPayload = {
  company?: string
  content: string
  importMethod: 'screenshot' | 'text'
  interviewDate?: string
  role?: string
  title?: string
}

export type InterviewImportResult = {
  documentPath: string
  ok: true
  questionCountEstimate: number
  sourceId: string
  title: string
}

export type GuideMatch = {
  anchor: string
  content: string
  documentId: string
  documentTitle: string
  endLine: number
  heading: string
  id: string
  level: number
  path: string
  relPath: string
  score: number
  startLine: number
}

export type WorkMatch = {
  id: string
  meta: Record<string, unknown>
  path: string
  relPath: string
  score: number
  title: string
}

export type GeneratedAnswer = {
  citations: Array<{ kind: string; label: string; path: string }>
  id: string
  model: string
  output: {
    citations?: Array<{ kind: string; label: string; path: string }>
    elevator_pitch?: string
    follow_ups?: string[]
    full_answer_markdown?: string
    knowledge_map?: Array<{ concept: string; confidence: string; why_it_matters: string }>
    missing_basics?: string[]
    question?: string
    work_evidence_note?: string
    work_evidence_status?: 'adjacent' | 'direct' | 'none'
    work_story?: string
  }
  outputMarkdown: string
  questionId: string
  reasoningEffort: string
  status: string
  updatedAt: string
}

export type GeneratedAnswerHistoryEntry = {
  id: string
  model: string
  reasoningEffort: string
  status: string
  updatedAt: string
}

export type QuestionDetail = {
  displayText: string
  difficulty: string
  generated: GeneratedAnswer | null
  generatedCount: number
  generationHistory: GeneratedAnswerHistoryEntry[]
  guideFallbackMatches: Array<{
    documentId: string
    documentTitle: string
    path: string
    relPath: string
    score: number
  }>
  guideMatches: GuideMatch[]
  id: string
  lastGeneratedAt: string | null
  metadata: Record<string, unknown>
  questionType: string
  sourceId: string
  sourcePath: string
  sourceTitle: string
  text: string
  translatedText: string | null
  workEvidenceStatus: 'adjacent' | 'direct' | 'none'
  workHintMatches: WorkMatch[]
  workMatches: WorkMatch[]
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

export type DocumentSection = {
  anchor: string
  content: string
  endLine: number
  heading: string
  knowledgeHitCount: number
  level: number
  relatedQuestions: Array<{
    difficulty: string
    displayText: string
    generated: {
      elevator_pitch?: string
      follow_ups?: string[]
      full_answer_markdown?: string
      knowledge_map?: Array<{ concept: string; confidence: string; why_it_matters: string }>
      missing_basics?: string[]
      work_evidence_note?: string
      work_evidence_status?: 'adjacent' | 'direct' | 'none'
      work_story?: string
    } | null
    generatedCount: number
    generatedStatus: string | null
    id: string
    isRevisited: boolean
    lastGeneratedAt: string | null
    questionType: string
    score: number
    text: string
    translatedText: string | null
  }>
  startLine: number
}

export type DocumentData = {
  content: string
  ext: string
  id: string
  kind: string
  looseRelatedQuestions: DocumentSection['relatedQuestions']
  meta: Record<string, unknown>
  path: string
  relPath: string
  sections: DocumentSection[]
  sourceId: string
  title: string
  updatedAt: string
  watchPath: string | null
}

export type SearchResponse = {
  questions: Array<{ displayText: string; id: string; text: string; translatedText: string | null }>
  sections: Array<{ content: string; documentId: string; documentTitle: string; heading: string; id: string; relPath: string }>
}

export type WorkProject = {
  id: string
  meta: Record<string, unknown>
  name: string
  rootPath: string
  status: string
  summary: string
}

export type ProjectPrepFact = {
  label: string
  sourceLabel: string
  value: string
}

export type ProjectPrepQuestion = {
  answerAngle: string
  category: string
  id: string
  intent: string
  question: string
  sourceLabel: string
}

export type ProjectPrepBridgeQuestion = {
  generatedStatus: string | null
  id: string
  maxScore: number
  questionType: string
  text: string
  whyRelevant: string
}

export type ProjectPrep = {
  deepDiveQuestions: ProjectPrepQuestion[]
  highlightFacts: ProjectPrepFact[]
  interviewArc: string[]
  openingPitch: string
  relatedQuestions: ProjectPrepBridgeQuestion[]
  sourceDocuments: Array<{ ext: string; id: string; originKind?: string; relPath: string; title: string }>
  whyThisProjectMatters: string
}

export type WorkProjectDetail = WorkProject & {
  documents: Array<{
    ext: string
    id: string
    meta: Record<string, unknown>
    path: string
    relPath: string
    title: string
  }>
  prep: ProjectPrep
  primaryDocumentId: string | null
}

export type JobStatus = {
  error?: string
  finishedAt?: string
  id: string
  kind: 'answer'
  model: string
  promptPreview?: string
  questionId: string
  questionText?: string
  reasoningEffort: string
  result?: GeneratedAnswer['output']
  stage?: string
  startedAt: string
  status: 'cancelled' | 'queued' | 'running' | 'ready' | 'failed'
  summary?: string
}

export type CodexConsoleReply = {
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

export type CodexConsoleJob = {
  error?: string
  finishedAt?: string
  id: string
  kind?: 'console'
  messagePreview?: string
  model: string
  promptPreview?: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh'
  result?: CodexConsoleReply
  stage?: string
  startedAt: string
  status: 'cancelled' | 'failed' | 'queued' | 'ready' | 'running'
  summary?: string
}

export type InterviewerJob = {
  error?: string
  finishedAt?: string
  id: string
  kind?: 'interviewer'
  messagePreview?: string
  model: string
  promptPreview?: string
  questionId: string
  questionText?: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh'
  result?: InterviewerReply
  seedFollowUp: string
  stage?: string
  startedAt: string
  status: 'cancelled' | 'failed' | 'queued' | 'ready' | 'running'
  summary?: string
}

export type IndexJobStatus = {
  configSummary?: {
    guideCount: number
    myWorkSource: string
    questionBankCount: number
  }
  error?: string
  finishedAt?: string
  id: string
  kind: 'index'
  logs: string[]
  progress: number
  stage: string
  startedAt: string
  status: 'cancelled' | 'failed' | 'queued' | 'ready' | 'running'
  summary: string
}

export type AgentJob =
  | (JobStatus & { kind: 'answer' })
  | (CodexConsoleJob & { kind: 'console' })
  | (InterviewerJob & { kind: 'interviewer' })
  | IndexJobStatus
