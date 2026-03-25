import type {
  AgentJob,
  CodexConsoleJob,
  DocumentData,
  DocumentListItem,
  InterviewImportPayload,
  InterviewImportResult,
  IndexJobStatus,
  JobStatus,
  MetaResponse,
  SourcesConfig,
  SourcesSettingsSnapshot,
  QuestionDetail,
  QuestionListItem,
  SearchResponse,
  WorkProject,
  WorkProjectDetail
} from './types'

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json() as Promise<T>
}

export function fetchMeta() {
  return request<MetaResponse>('/api/meta')
}

export function fetchSourcesSettings() {
  return request<SourcesSettingsSnapshot>('/api/settings/sources')
}

export function saveSourcesSettings(config: SourcesConfig) {
  return request<{ config: SourcesConfig; ok: true }>('/api/settings/sources', {
    method: 'POST',
    body: JSON.stringify({ config })
  })
}

export function fetchQuestions(options: { category?: string; limit?: number; search?: string } = {}) {
  const params = new URLSearchParams()
  if (options.search) {
    params.set('search', options.search)
  }
  if (typeof options.limit === 'number') {
    params.set('limit', String(options.limit))
  }
  if (options.category) {
    params.set('category', options.category)
  }
  return request<QuestionListItem[]>(`/api/questions?${params.toString()}`)
}

export function fetchQuestionDetail(questionId: string) {
  return request<QuestionDetail>(`/api/questions/${questionId}`)
}

export function importInterviewEntry(payload: InterviewImportPayload) {
  return request<InterviewImportResult>('/api/questions/import', {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function fetchDocuments() {
  return request<DocumentListItem[]>('/api/documents?limit=600')
}

export function fetchDocument(documentId: string) {
  return request<DocumentData>(`/api/documents/${documentId}`)
}

export function fetchSearch(query: string) {
  return request<SearchResponse>(`/api/search?q=${encodeURIComponent(query)}`)
}

export function fetchWorkProjects() {
  return request<WorkProject[]>('/api/work-projects')
}

export function fetchWorkProjectDetail(projectId: string) {
  return request<WorkProjectDetail>(`/api/work-projects/${projectId}`)
}

export function startAnswerGeneration(body: {
  autoReferenceCurrentDoc: boolean
  currentDocumentId?: string | null
  model: string
  questionId: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh'
  selectedDocumentIds: string[]
}) {
  return request<JobStatus>('/api/generated', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function fetchJob(jobId: string) {
  return request<JobStatus>(`/api/jobs/${jobId}`)
}

export function startCodexConsoleJob(body: {
  autoReferenceCurrentDoc: boolean
  conversation: Array<{ content: string; role: 'assistant' | 'user' }>
  currentDocumentId?: string | null
  message: string
  model: string
  reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh'
  selectedDocumentIds: string[]
  selectedProjectIds: string[]
}) {
  return request<CodexConsoleJob>('/api/codex-console/jobs', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export function fetchCodexConsoleJob(jobId: string) {
  return request<CodexConsoleJob>(`/api/codex-console/jobs/${jobId}`)
}

export function cancelCodexConsoleJob(jobId: string) {
  return request<CodexConsoleJob>(`/api/codex-console/jobs/${jobId}/cancel`, {
    method: 'POST'
  })
}

export function startIndexJob(config: SourcesConfig) {
  return request<IndexJobStatus>('/api/index/jobs', {
    method: 'POST',
    body: JSON.stringify({ config })
  })
}

export function fetchIndexJob(jobId: string) {
  return request<IndexJobStatus>(`/api/index/jobs/${jobId}`)
}

export function cancelIndexJob(jobId: string) {
  return request<IndexJobStatus>(`/api/index/jobs/${jobId}/cancel`, {
    method: 'POST'
  })
}

export function fetchAgentJobs() {
  return request<AgentJob[]>('/api/agents/jobs')
}

export function fetchAgentJob(jobId: string) {
  return request<AgentJob>(`/api/agents/jobs/${jobId}`)
}

export function cancelAgentJob(jobId: string) {
  return request<AgentJob>(`/api/agents/jobs/${jobId}/cancel`, {
    method: 'POST'
  })
}

export function rerunAgentJob(jobId: string, promptOverride?: string) {
  return request<AgentJob>(`/api/agents/jobs/${jobId}/rerun`, {
    method: 'POST',
    body: JSON.stringify({ promptOverride })
  })
}
