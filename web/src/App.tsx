import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {
  ArrowUpRight,
  Activity,
  Briefcase,
  BookOpenText,
  BrainCircuit,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X
} from 'lucide-react'

import {
  cancelAgentJob,
  fetchDocument,
  fetchDocuments,
  fetchAgentJob,
  fetchAgentJobs,
  fetchJob,
  fetchMeta,
  fetchQuestions,
  fetchQuestionDetail,
  fetchSearch,
  fetchSourcesSettings,
  fetchWorkProjects,
  importInterviewEntry,
  rerunAgentJob,
  saveSourcesSettings,
  startAnswerGeneration,
  startIndexJob
} from './api'
import { normalizeMarkdownForRender } from './markdown'
import type {
  AgentJob,
  DocumentData,
  DocumentListItem,
  InterviewImportPayload,
  JobStatus,
  SourcesConfig,
  SourcesSettingsSnapshot,
  MetaResponse,
  QuestionDetail,
  QuestionListItem,
  SearchResponse,
  UiTypographySettings,
  WorkProject
} from './types'
import { FloatingCodexWindow } from './CodexConsole'
import { InterviewerModeDrawer } from './InterviewerMode'
import { InterviewImportModal } from './InterviewImportModal'
import { FirstRunDialog, JobsDrawer, SettingsDrawer } from './WorkspacePanels'
import './App.css'

type CachedQuestionMap = Record<string, QuestionDetail>
type QuestionJobMap = Record<string, JobStatus>
type InterviewCategoryGroup = {
  categoryId: string
  categoryLabel: string
  categoryOrder: number
  questions: QuestionListItem[]
}
type PendingFocus = {
  anchor?: string
  documentId: string
  heading?: string
  knowledgeAnchor?: string
}
type BrowserNavState = {
  anchor?: string | null
  documentId?: string | null
  questionId?: string | null
  sidebarTab: SidebarTab
  scrollY?: number
}
type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'
type RelatedQuestion = DocumentData['sections'][number]['relatedQuestions'][number]
type SidebarTab = 'documents' | 'interviews' | 'mywork'
type WorkspaceThemeId = 'mist' | 'paper' | 'sage' | 'slate'
type WorkspaceUiState = {
  currentDocumentId: string | null
  currentInterviewQuestionId: string | null
  sidebarOpen: boolean
  sidebarWidth: number
  sidebarTab: SidebarTab
  themeId: WorkspaceThemeId
  typography: UiTypographySettings
}
type SidebarResizeState = {
  startWidth: number
  startX: number
}
type WorkspaceTheme = {
  hint: string
  id: WorkspaceThemeId
  label: string
  swatches: [string, string, string]
  vars: Record<string, string>
}
type WorkspaceViewState = {
  guideDocumentId: string | null
  interviewQuestionId: string | null
  workDocumentId: string | null
}
type PaneNavigationSection = {
  anchor: string
  badge?: number | string | null
  heading: string
  kicker: string
  tone?: 'default' | 'knowledge'
}
type InterviewStageSectionKind =
  | 'source'
  | 'elevator_pitch'
  | 'project_bridge'
  | 'full_answer'
  | 'knowledge_map'
  | 'follow_ups'
  | 'missing_basics'
  | 'citations'
  | 'generate'
type InterviewStageSectionSpec = {
  anchor: string
  badge?: number | string | null
  heading: string
  kind: InterviewStageSectionKind
  kicker: string
}
type SelectionUpdateSource = 'navigation' | 'scroll'
type InterviewerSession = {
  questionId: string
  questionTitle: string
  seedFollowUp: string
  sessionKey: string
}

const UI_STATE_STORAGE_KEY = 'offerloom.workspace-ui.v1'
const DOC_SCROLL_STORAGE_KEY = 'offerloom.doc-scroll.v1'
const INTERVIEW_SCROLL_STORAGE_KEY = 'offerloom.interview-scroll.v1'
const VIEW_STATE_STORAGE_KEY = 'offerloom.view-state.v1'
const GUIDE_FALLBACK_SECTION_ANCHOR = 'chapter-question-bank'
const DOCUMENT_SCROLL_VIEWPORT_OFFSET = 104
const DEFAULT_UI_STATE: WorkspaceUiState = {
  currentDocumentId: null,
  currentInterviewQuestionId: null,
  sidebarOpen: true,
  sidebarWidth: 334,
  sidebarTab: 'documents',
  themeId: 'mist',
  typography: {
    answerFontSize: 15.5,
    docFontSize: 18,
    docHeadingScale: 1.08,
    sidebarFontSize: 13.5
  }
}
const WORKSPACE_THEMES: WorkspaceTheme[] = [
  {
    id: 'mist',
    label: '雾青',
    hint: '冷雾青灰',
    swatches: ['#eaf4f7', '#8db9c3', '#2f7e89'],
    vars: {
      '--accent': '#4d98a5',
      '--accent-faint': 'rgba(77, 152, 165, 0.12)',
      '--accent-strong': '#2c6e79',
      '--app-background': 'radial-gradient(circle at top left, rgba(117, 188, 200, 0.16), transparent 34%), radial-gradient(circle at top right, rgba(180, 215, 224, 0.18), transparent 30%), linear-gradient(180deg, #f6f9fc, #eef4f8 44%, #f8fbfd)',
      '--border-soft': 'rgba(107, 136, 149, 0.14)',
      '--border-strong': 'rgba(90, 132, 143, 0.24)',
      '--control-surface': 'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 252, 0.97))',
      '--panel-surface': 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(246, 250, 252, 0.94))',
      '--panel-surface-strong': 'linear-gradient(180deg, rgba(252, 254, 255, 0.98), rgba(242, 248, 251, 0.96))',
      '--primary-from': '#2f7e89',
      '--primary-to': '#58a7b3',
      '--shadow-rgb': '24, 38, 49',
      '--surface-muted': 'rgba(244, 249, 252, 0.92)',
      '--surface-soft': 'rgba(255, 255, 255, 0.88)',
      '--surface-subtle': 'rgba(239, 247, 250, 0.94)',
      '--text': '#182631',
      '--muted': '#667785'
    }
  },
  {
    id: 'paper',
    label: '砂页',
    hint: '暖白纸感',
    swatches: ['#fbf5eb', '#d7b78b', '#9d6946'],
    vars: {
      '--accent': '#c48a59',
      '--accent-faint': 'rgba(196, 138, 89, 0.14)',
      '--accent-strong': '#9d6946',
      '--app-background': 'radial-gradient(circle at top left, rgba(238, 208, 172, 0.16), transparent 34%), radial-gradient(circle at top right, rgba(228, 198, 169, 0.18), transparent 30%), linear-gradient(180deg, #fbf7f1, #f6efe5 44%, #fcfaf6)',
      '--border-soft': 'rgba(145, 112, 84, 0.14)',
      '--border-strong': 'rgba(164, 121, 84, 0.24)',
      '--control-surface': 'linear-gradient(180deg, rgba(255, 252, 248, 0.98), rgba(247, 241, 233, 0.97))',
      '--panel-surface': 'linear-gradient(180deg, rgba(255, 252, 248, 0.96), rgba(248, 242, 235, 0.94))',
      '--panel-surface-strong': 'linear-gradient(180deg, rgba(255, 253, 250, 0.98), rgba(245, 238, 228, 0.96))',
      '--primary-from': '#ab734d',
      '--primary-to': '#d29b69',
      '--shadow-rgb': '58, 41, 28',
      '--surface-muted': 'rgba(250, 246, 239, 0.94)',
      '--surface-soft': 'rgba(255, 252, 248, 0.9)',
      '--surface-subtle': 'rgba(248, 242, 235, 0.95)',
      '--text': '#2f241d',
      '--muted': '#7a6658'
    }
  },
  {
    id: 'sage',
    label: '松雾',
    hint: '灰绿矿物',
    swatches: ['#edf4ef', '#9db7a4', '#4f7b66'],
    vars: {
      '--accent': '#6a9580',
      '--accent-faint': 'rgba(106, 149, 128, 0.14)',
      '--accent-strong': '#4f7b66',
      '--app-background': 'radial-gradient(circle at top left, rgba(172, 206, 183, 0.16), transparent 34%), radial-gradient(circle at top right, rgba(202, 225, 210, 0.18), transparent 30%), linear-gradient(180deg, #f5faf6, #edf5ef 44%, #f9fcfa)',
      '--border-soft': 'rgba(96, 124, 110, 0.14)',
      '--border-strong': 'rgba(86, 129, 107, 0.24)',
      '--control-surface': 'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 250, 246, 0.97))',
      '--panel-surface': 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 250, 246, 0.94))',
      '--panel-surface-strong': 'linear-gradient(180deg, rgba(252, 255, 253, 0.98), rgba(239, 248, 242, 0.96))',
      '--primary-from': '#5f8d76',
      '--primary-to': '#8bb099',
      '--shadow-rgb': '28, 42, 33',
      '--surface-muted': 'rgba(241, 248, 243, 0.94)',
      '--surface-soft': 'rgba(255, 255, 255, 0.9)',
      '--surface-subtle': 'rgba(236, 246, 240, 0.95)',
      '--text': '#1d2d25',
      '--muted': '#617268'
    }
  },
  {
    id: 'slate',
    label: '石墨',
    hint: '云灰蓝调',
    swatches: ['#eef2f8', '#a4b2cb', '#556b92'],
    vars: {
      '--accent': '#7186ad',
      '--accent-faint': 'rgba(113, 134, 173, 0.14)',
      '--accent-strong': '#556b92',
      '--app-background': 'radial-gradient(circle at top left, rgba(161, 180, 215, 0.16), transparent 34%), radial-gradient(circle at top right, rgba(198, 210, 235, 0.18), transparent 30%), linear-gradient(180deg, #f5f7fc, #edf1f8 44%, #f9fbfe)',
      '--border-soft': 'rgba(109, 125, 154, 0.14)',
      '--border-strong': 'rgba(91, 110, 146, 0.24)',
      '--control-surface': 'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(244, 247, 252, 0.97))',
      '--panel-surface': 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(244, 247, 252, 0.94))',
      '--panel-surface-strong': 'linear-gradient(180deg, rgba(252, 253, 255, 0.98), rgba(240, 245, 252, 0.96))',
      '--primary-from': '#647ca4',
      '--primary-to': '#8ba0c4',
      '--shadow-rgb': '28, 37, 54',
      '--surface-muted': 'rgba(241, 245, 252, 0.94)',
      '--surface-soft': 'rgba(255, 255, 255, 0.9)',
      '--surface-subtle': 'rgba(237, 243, 252, 0.95)',
      '--text': '#1d2736',
      '--muted': '#667384'
    }
  }
]

function App() {
  const [meta, setMeta] = useState<MetaResponse | null>(null)
  const [sourcesSettings, setSourcesSettings] = useState<SourcesSettingsSnapshot | null>(null)
  const [draftSourcesConfig, setDraftSourcesConfig] = useState<SourcesConfig | null>(null)
  const [documents, setDocuments] = useState<DocumentListItem[]>([])
  const [documentCache, setDocumentCache] = useState<Record<string, DocumentData>>({})
  const [questionList, setQuestionList] = useState<QuestionListItem[]>([])
  const [workProjects, setWorkProjects] = useState<WorkProject[]>([])
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<DocumentData | null>(null)
  const [selectedInterviewQuestionId, setSelectedInterviewQuestionId] = useState<string | null>(null)
  const [selectedInterviewQuestion, setSelectedInterviewQuestion] = useState<QuestionDetail | null>(null)
  const [questionCache, setQuestionCache] = useState<CachedQuestionMap>({})
  const [questionJobs, setQuestionJobs] = useState<QuestionJobMap>({})
  const [agentJobs, setAgentJobs] = useState<AgentJob[]>([])
  const [selectedAgentJobId, setSelectedAgentJobId] = useState<string | null>(null)
  const [selectedAgentJob, setSelectedAgentJob] = useState<AgentJob | null>(null)
  const [agentPromptDraft, setAgentPromptDraft] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchPreview, setSearchPreview] = useState<SearchResponse | null>(null)
  const [statusNote, setStatusNote] = useState('正在载入文档与题库')
  const [model, setModel] = useState('gpt-5.4')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('high')
  const [answerEffort, setAnswerEffort] = useState<'low' | 'high' | 'xhigh'>('high')
  const [interviewerEffort, setInterviewerEffort] = useState<ReasoningEffort>('high')
  const [autoReferenceCurrentDoc, setAutoReferenceCurrentDoc] = useState(true)
  const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([])
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [liveRefreshAt, setLiveRefreshAt] = useState<string | null>(null)
  const [activeSectionAnchor, setActiveSectionAnchor] = useState<string | null>(null)
  const [knowledgeAnchor, setKnowledgeAnchor] = useState<string | null>(null)
  const [generatingQuestionId, setGeneratingQuestionId] = useState<string | null>(null)
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [jobsOpen, setJobsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [activeIndexJobId, setActiveIndexJobId] = useState<string | null>(null)
  const [interviewerSession, setInterviewerSession] = useState<InterviewerSession | null>(null)
  const [workspaceUi, setWorkspaceUi] = useState<WorkspaceUiState>(() => readWorkspaceUiState())
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [expandedGuideKeys, setExpandedGuideKeys] = useState<string[]>([])
  const [expandedInterviewCategoryIds, setExpandedInterviewCategoryIds] = useState<string[]>([])
  const lastIndexJobStatusRef = useRef<string | null>(null)

  const sectionRefs = useRef(new Map<string, HTMLElement>())
  const guideArticleRefs = useRef(new Map<string, HTMLElement>())
  const selectedDocumentIdRef = useRef<string | null>(null)
  const documentScrollStateRef = useRef<Record<string, number>>(readDocumentScrollState())
  const interviewScrollStateRef = useRef<Record<string, number>>(readInterviewScrollState())
  const viewStateRef = useRef<WorkspaceViewState>(readWorkspaceViewState())
  const sidebarResizeState = useRef<SidebarResizeState | null>(null)
  const scrollSpyLockRef = useRef<{ anchor: string; expiresAt: number } | null>(null)
  const guideSelectionSourceRef = useRef<SelectionUpdateSource>('navigation')
  const guideNavigationLockRef = useRef<{ documentId: string; expiresAt: number } | null>(null)
  const lastViewportKeyRef = useRef<string | null>(null)
  const deferredSearch = useDeferredValue(globalSearch)
  const isMobile = useMediaQuery('(max-width: 980px)')
  const viewportWidth = useViewportWidth()

  useEffect(() => {
    selectedDocumentIdRef.current = selectedDocumentId
  }, [selectedDocumentId])

  useEffect(() => {
    writeWorkspaceUiState(workspaceUi)
  }, [workspaceUi])

  useEffect(() => {
    viewStateRef.current = {
      guideDocumentId: documents.find((item) => item.id === selectedDocumentId)?.kind === 'guide'
        ? selectedDocumentId
        : viewStateRef.current.guideDocumentId,
      interviewQuestionId: selectedInterviewQuestionId ?? viewStateRef.current.interviewQuestionId,
      workDocumentId: documents.find((item) => item.id === selectedDocumentId)?.kind === 'work'
        ? selectedDocumentId
        : viewStateRef.current.workDocumentId
    }
    writeWorkspaceViewState(viewStateRef.current)
  }, [documents, selectedDocumentId, selectedInterviewQuestionId])

  useEffect(() => {
    if (!isMobile) {
      setMobileSidebarOpen(false)
    }
  }, [isMobile])

  const guideDocuments = useMemo(() => (
    documents.filter((item) => item.kind === 'guide')
  ), [documents])

  const orderedGuideDocuments = useMemo(() => (
    sortGuideDocuments(guideDocuments)
  ), [guideDocuments])

  const guideGroups = useMemo(() => (
    buildGuideGroups(orderedGuideDocuments)
  ), [orderedGuideDocuments])

  const selectedGuideListItem = useMemo(() => (
    documents.find((item) => item.id === selectedDocumentId && item.kind === 'guide') ?? null
  ), [documents, selectedDocumentId])

  const activeDocument = useMemo(() => (
    selectedDocument && selectedDocument.id === selectedDocumentId ? selectedDocument : null
  ), [selectedDocument, selectedDocumentId])

  const activeInterviewQuestion = useMemo(() => (
    selectedInterviewQuestion && selectedInterviewQuestion.id === selectedInterviewQuestionId ? selectedInterviewQuestion : null
  ), [selectedInterviewQuestion, selectedInterviewQuestionId])

  const activeGuideGroupKey = useMemo(() => {
    const guideRelPath = activeDocument?.kind === 'guide'
      ? activeDocument.relPath
      : selectedGuideListItem?.relPath ?? null

    if (!guideRelPath) {
      return guideGroups[0]?.key ?? null
    }
    return getGuideGroupInfo(guideRelPath).key
  }, [activeDocument, guideGroups, selectedGuideListItem])

  const activeGuideGroup = useMemo(() => (
    guideGroups.find((group) => group.key === activeGuideGroupKey) ?? guideGroups[0] ?? null
  ), [activeGuideGroupKey, guideGroups])

  const workDocuments = useMemo(() => (
    documents.filter((item) => item.kind === 'work')
  ), [documents])

  const orderedWorkDocuments = useMemo(() => (
    [...workDocuments].sort((left, right) => (
      left.relPath.localeCompare(right.relPath, 'zh-Hans-CN')
    ))
  ), [workDocuments])

  const interviewCategoryGroups = useMemo(() => (
    buildInterviewCategoryGroups(questionList)
  ), [questionList])

  const activeInterviewCategoryId = useMemo(() => (
    questionList.find((item) => item.id === selectedInterviewQuestionId)?.categoryId ?? interviewCategoryGroups[0]?.categoryId ?? null
  ), [interviewCategoryGroups, questionList, selectedInterviewQuestionId])

  const sidebarWidth = useMemo(() => (
    isMobile
      ? clampNumber(viewportWidth - 28, 272, 380, 320)
      : clampSidebarWidth(workspaceUi.sidebarWidth)
  ), [isMobile, viewportWidth, workspaceUi.sidebarWidth])

  const effectiveSidebarOpen = isMobile ? mobileSidebarOpen : workspaceUi.sidebarOpen

  const appStyle = useMemo(() => (
    buildWorkspaceCssVars(workspaceUi)
  ), [workspaceUi])

  const sidebarToggleStyle = useMemo(() => {
    if (isMobile) {
      return {
        left: '10px'
      } as CSSProperties
    }

    return {
      left: effectiveSidebarOpen
        ? `${Math.max(10, 20 + sidebarWidth - 16)}px`
        : '10px'
    } as CSSProperties
  }, [effectiveSidebarOpen, isMobile, sidebarWidth])

  useEffect(() => {
    if (guideGroups.length === 0) {
      return
    }

    setExpandedGuideKeys([activeGuideGroupKey ?? guideGroups[0].key])
  }, [activeGuideGroupKey, guideGroups])

  useEffect(() => {
    if (interviewCategoryGroups.length === 0) {
      return
    }

    setExpandedInterviewCategoryIds([activeInterviewCategoryId ?? interviewCategoryGroups[0].categoryId])
  }, [activeInterviewCategoryId, interviewCategoryGroups])

  useEffect(() => {
    if (!effectiveSidebarOpen || typeof document === 'undefined') {
      return
    }

    const selector = workspaceUi.sidebarTab === 'interviews'
      ? '.interview-question-leaf.active'
      : workspaceUi.sidebarTab === 'documents'
        ? '.guide-tree-leaf.active'
        : '.project-link.active'
    const node = document.querySelector(selector)
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: 'nearest' })
    }
  }, [effectiveSidebarOpen, selectedDocumentId, selectedInterviewQuestionId, workspaceUi.sidebarTab])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const url = new URL(window.location.href)
    url.searchParams.set('tab', workspaceUi.sidebarTab)
    if (workspaceUi.sidebarTab === 'interviews' && selectedInterviewQuestionId) {
      url.searchParams.set('q', selectedInterviewQuestionId)
      url.searchParams.delete('doc')
    } else if (selectedDocumentId) {
      url.searchParams.set('doc', selectedDocumentId)
      url.searchParams.delete('q')
    }

    window.history.replaceState({
      documentId: workspaceUi.sidebarTab === 'interviews' ? null : selectedDocumentId,
      questionId: workspaceUi.sidebarTab === 'interviews' ? selectedInterviewQuestionId : null,
      sidebarTab: workspaceUi.sidebarTab,
      scrollY: window.scrollY
    } satisfies BrowserNavState, '', url)
  }, [selectedDocumentId, selectedInterviewQuestionId, workspaceUi.sidebarTab])

  const activeIndexJob = useMemo(() => (
    agentJobs.find((job): job is Extract<AgentJob, { kind: 'index' }> => (
      job.id === activeIndexJobId && job.kind === 'index'
    )) ?? null
  ), [activeIndexJobId, agentJobs])

  const selectedKnowledgeSection = useMemo(() => (
    activeDocument?.sections.find((section) => section.anchor === knowledgeAnchor) ?? null
  ), [activeDocument, knowledgeAnchor])

  const interviewStageSections = useMemo(() => (
    activeInterviewQuestion ? buildInterviewStageSections(activeInterviewQuestion) : []
  ), [activeInterviewQuestion])

  const currentPaneId = useMemo(() => {
    if (workspaceUi.sidebarTab === 'interviews') {
      return activeInterviewQuestion ? `interview:${activeInterviewQuestion.id}` : null
    }
    return activeDocument?.id ?? null
  }, [activeDocument?.id, activeInterviewQuestion, workspaceUi.sidebarTab])

  const currentPaneSections = useMemo<PaneNavigationSection[]>(() => {
    if (workspaceUi.sidebarTab === 'interviews') {
      return interviewStageSections.map((section) => ({
        anchor: section.anchor,
        badge: section.badge,
        heading: section.heading,
        kicker: section.kicker,
        tone: section.kind === 'source' ? 'knowledge' : 'default'
      }))
    }

    if (!activeDocument) {
      return []
    }

    const sections: PaneNavigationSection[] = activeDocument.sections.map((section) => ({
      anchor: section.anchor,
      badge: section.knowledgeHitCount > 0 ? section.knowledgeHitCount : null,
      heading: section.heading,
      kicker: `H${section.level}`,
      tone: section.knowledgeHitCount > 0 ? 'knowledge' : 'default'
    }))

    if (activeDocument.looseRelatedQuestions.length > 0) {
      sections.push({
        anchor: GUIDE_FALLBACK_SECTION_ANCHOR,
        badge: activeDocument.looseRelatedQuestions.length,
        heading: '章节延伸题',
        kicker: 'PLUS',
        tone: 'knowledge'
      })
    }

    return sections
  }, [activeDocument, interviewStageSections, workspaceUi.sidebarTab])

  const currentPaneOutlineTitle = useMemo(() => {
    if (workspaceUi.sidebarTab === 'interviews') {
      return '当前题目'
    }
    if (workspaceUi.sidebarTab === 'mywork') {
      return '当前材料'
    }
    return '当前文档'
  }, [workspaceUi.sidebarTab])

  const currentPaneOutlineCountLabel = useMemo(() => {
    if (currentPaneSections.length === 0) {
      return workspaceUi.sidebarTab === 'interviews' ? '未打开' : '未打开'
    }
    return workspaceUi.sidebarTab === 'interviews'
      ? `${currentPaneSections.length} 段`
      : `${currentPaneSections.length} 节`
  }, [currentPaneSections.length, workspaceUi.sidebarTab])

  const refreshWorkspace = useEffectEvent(async (preserveSelection = true) => {
    const [metaResponse, documentResponse, questionResponse, workProjectResponse, settingsResponse] = await Promise.all([
      fetchMeta(),
      fetchDocuments(),
      fetchQuestions({ limit: 1600 }),
      fetchWorkProjects(),
      fetchSourcesSettings()
    ])
    const routeState = !preserveSelection ? readBrowserNavFromUrl(documentResponse, questionResponse) : null

    setMeta(metaResponse)
    setDocuments(documentResponse)
    setQuestionList(questionResponse)
    setWorkProjects(workProjectResponse)
    setSourcesSettings(settingsResponse)
    setDraftSourcesConfig(settingsResponse.config)
    setModel(metaResponse.models.find((item) => item === 'gpt-5.4') ?? metaResponse.models[0] ?? 'gpt-5.4')
    setStatusNote(
      `${describeRetrievalMode(metaResponse.retrievalMode)} · 题目中文化 ${metaResponse.counts.translatedQuestions}/${metaResponse.counts.questions} · 已校验 ${metaResponse.workIndexSummary.indexed ?? 0}/${metaResponse.workIndexSummary.total ?? 0} 个项目`
    )

    const guideDocumentId = pickRememberedDocumentId(
      orderedGuideCandidates(documentResponse),
      routeState?.sidebarTab === 'documents' ? routeState.documentId : null,
      preserveSelection ? selectedDocumentIdRef.current : null,
      viewStateRef.current.guideDocumentId
    )
    const workDocumentId = pickRememberedDocumentId(
      documentResponse.filter((item) => item.kind === 'work'),
      routeState?.sidebarTab === 'mywork' ? routeState.documentId : null,
      preserveSelection && documentResponse.find((item) => item.id === selectedDocumentIdRef.current)?.kind === 'work'
        ? selectedDocumentIdRef.current
        : null,
      viewStateRef.current.workDocumentId
    )
    const nextSidebarTab = routeState?.sidebarTab ?? workspaceUi.sidebarTab
    const nextDocumentId = nextSidebarTab === 'mywork'
      ? workDocumentId ?? guideDocumentId
      : guideDocumentId ?? workDocumentId

    setSelectedDocumentId((current) => {
      if (preserveSelection && current && documentResponse.some((item) => item.id === current)) {
        return current
      }
      return nextDocumentId
    })

    setWorkspaceUi((current) => ({
      ...current,
      currentDocumentId: nextDocumentId,
      currentInterviewQuestionId: routeState?.questionId ?? current.currentInterviewQuestionId,
      sidebarTab: nextSidebarTab
    }))

    setSelectedInterviewQuestionId((current) => {
      if (preserveSelection && current && questionResponse.some((item) => item.id === current)) {
        return current
      }
      return routeState?.questionId
        ?? viewStateRef.current.interviewQuestionId
        ?? questionResponse[0]?.id
        ?? null
    })

    if (!settingsResponse.initialized) {
      setShowOnboarding(true)
    }
  })

  const loadQuestionDetails = useEffectEvent(async (questionIds: string[]) => {
    const missing = questionIds.filter((id) => !questionCache[id])
    if (missing.length === 0) {
      return
    }

    const results = await Promise.all(
      missing.map(async (id) => {
        try {
          return await fetchQuestionDetail(id)
        } catch {
          return null
        }
      })
    )

    setQuestionCache((current) => {
      const next = { ...current }
      for (const item of results) {
        if (item) {
          next[item.id] = item
        }
      }
      return next
    })
  })

  const refreshDocument = useEffectEvent(async (documentId: string) => {
    const document = await fetchDocument(documentId)
    setDocumentCache((current) => ({
      ...current,
      [documentId]: document
    }))
    if (selectedDocumentIdRef.current !== documentId) {
      return
    }
    setSelectedDocument(document)
    setLiveRefreshAt(new Date().toLocaleTimeString())
  })

  const primeDocumentCache = useEffectEvent(async (documentIds: string[]) => {
    const missing = documentIds.filter((id) => !documentCache[id])
    if (missing.length === 0) {
      return
    }

    const results = await Promise.all(
      missing.map(async (id) => {
        try {
          return await fetchDocument(id)
        } catch {
          return null
        }
      })
    )

    setDocumentCache((current) => {
      const next = { ...current }
      for (const item of results) {
        if (item) {
          next[item.id] = item
        }
      }
      return next
    })
  })

  const persistDocumentScroll = useEffectEvent((documentId: string | null, scrollY = window.scrollY) => {
    if (!documentId) {
      return
    }

    const baseTop = getDocumentScrollBaseTop(documentId)
    const normalizedScroll = baseTop === null
      ? Math.max(0, Math.round(scrollY))
      : Math.max(0, Math.round(scrollY - baseTop))

    documentScrollStateRef.current = {
      ...documentScrollStateRef.current,
      [documentId]: normalizedScroll
    }
    writeDocumentScrollState(documentScrollStateRef.current)
  })

  const persistInterviewScroll = useEffectEvent((questionId: string | null, scrollY = window.scrollY) => {
    if (!questionId) {
      return
    }

    interviewScrollStateRef.current = {
      ...interviewScrollStateRef.current,
      [questionId]: Math.max(0, Math.round(scrollY))
    }
    writeInterviewScrollState(interviewScrollStateRef.current)
  })

  useEffect(() => {
    void refreshWorkspace(false)
      .catch((error) => {
        setStatusNote(error instanceof Error ? error.message : String(error))
      })
  }, [])

  useEffect(() => {
    if (!selectedDocumentId) {
      setSelectedDocument(null)
      return
    }
    const cached = documentCache[selectedDocumentId]
    if (cached) {
      setSelectedDocument(cached)
      return
    }
    setSelectedDocument(null)
    void refreshDocument(selectedDocumentId)
      .catch((error) => {
        setStatusNote(error instanceof Error ? error.message : String(error))
      })
  }, [documentCache, selectedDocumentId])

  useEffect(() => {
    const preloadIds = [
      ...orderedGuideDocuments.map((item) => item.id),
      ...orderedWorkDocuments.map((item) => item.id)
    ]
    if (preloadIds.length === 0) {
      return
    }
    void primeDocumentCache(preloadIds)
  }, [orderedGuideDocuments, orderedWorkDocuments, primeDocumentCache])

  useEffect(() => {
    if (!selectedDocumentId || workspaceUi.sidebarTab === 'interviews') {
      return
    }

    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId !== null) {
        return
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        persistDocumentScroll(selectedDocumentIdRef.current)
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [persistDocumentScroll, selectedDocumentId, workspaceUi.sidebarTab])

  useEffect(() => {
    if (workspaceUi.sidebarTab !== 'documents' || !activeGuideGroup || activeGuideGroup.documents.length === 0) {
      return
    }

    const updateActiveGuideDocument = () => {
      const lock = guideNavigationLockRef.current
      if (lock && lock.expiresAt > Date.now()) {
        return
      }

      const position = window.scrollY + 132
      let nextDocumentId = activeGuideGroup.documents[0]?.id ?? null

      for (const document of activeGuideGroup.documents) {
        const element = guideArticleRefs.current.get(document.id)
        if (!element) {
          continue
        }
        if (element.offsetTop <= position) {
          nextDocumentId = document.id
        } else {
          break
        }
      }

      if (!nextDocumentId || nextDocumentId === selectedDocumentIdRef.current) {
        return
      }

      guideSelectionSourceRef.current = 'scroll'
      selectedDocumentIdRef.current = nextDocumentId
      setWorkspaceUi((current) => (
        current.currentDocumentId === nextDocumentId
          ? current
          : { ...current, currentDocumentId: nextDocumentId }
      ))
      setSelectedDocumentId(nextDocumentId)
      setSelectedDocument(documentCache[nextDocumentId] ?? null)
      setKnowledgeAnchor(null)
    }

    updateActiveGuideDocument()
    window.addEventListener('scroll', updateActiveGuideDocument, { passive: true })
    window.addEventListener('resize', updateActiveGuideDocument)
    return () => {
      window.removeEventListener('scroll', updateActiveGuideDocument)
      window.removeEventListener('resize', updateActiveGuideDocument)
    }
  }, [activeGuideGroup, documentCache, workspaceUi.sidebarTab])

  useEffect(() => {
    if (workspaceUi.sidebarTab !== 'interviews' || !selectedInterviewQuestionId) {
      return
    }

    let rafId: number | null = null
    const handleScroll = () => {
      if (rafId !== null) {
        return
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        persistInterviewScroll(selectedInterviewQuestionId)
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [persistInterviewScroll, selectedInterviewQuestionId, workspaceUi.sidebarTab])

  useEffect(() => {
    if (!deferredSearch.trim()) {
      setSearchPreview(null)
      return
    }

    const controller = new AbortController()
    void fetchSearch(deferredSearch)
      .then((response) => {
        if (!controller.signal.aborted) {
          setSearchPreview(response)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSearchPreview(null)
        }
      })

    return () => {
      controller.abort()
    }
  }, [deferredSearch])

  useEffect(() => {
    let cancelled = false

    const loadJobs = async () => {
      try {
        const jobs = await fetchAgentJobs()
        if (!cancelled) {
          setAgentJobs(jobs)
        }
      } catch {}
    }

    void loadJobs()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const shouldPoll = settingsOpen
      || jobsOpen
      || Boolean(activeIndexJobId)
      || agentJobs.some((job) => job.status === 'queued' || job.status === 'running')

    if (!shouldPoll) {
      return
    }

    let cancelled = false
    const tick = async () => {
      try {
        const jobs = await fetchAgentJobs()
        if (!cancelled) {
          setAgentJobs(jobs)
        }
      } catch {}
    }

    void tick()
    const timer = window.setInterval(() => {
      void tick()
    }, 1500)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [activeIndexJobId, agentJobs, jobsOpen, settingsOpen])

  useEffect(() => {
    if (!selectedAgentJobId) {
      setSelectedAgentJob(null)
      setAgentPromptDraft('')
      return
    }

    let cancelled = false
    void fetchAgentJob(selectedAgentJobId)
      .then((job) => {
        if (cancelled) {
          return
        }
        setSelectedAgentJob(job)
        if ('promptPreview' in job && typeof job.promptPreview === 'string') {
          setAgentPromptDraft(job.promptPreview)
        } else {
          setAgentPromptDraft('')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedAgentJob(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedAgentJobId])

  useEffect(() => {
    if (!selectedAgentJobId || !agentJobs.some((job) => job.id === selectedAgentJobId)) {
      return
    }
    void fetchAgentJob(selectedAgentJobId)
      .then((job) => {
        setSelectedAgentJob(job)
      })
      .catch(() => {})
  }, [agentJobs, selectedAgentJobId])

  useEffect(() => {
    if (!selectedInterviewQuestionId) {
      setSelectedInterviewQuestion(null)
      return
    }

    const cached = questionCache[selectedInterviewQuestionId]
    if (cached) {
      setSelectedInterviewQuestion(cached)
      return
    }

    setSelectedInterviewQuestion(null)

    let cancelled = false
    const load = async () => {
      try {
        const detail = await fetchQuestionDetail(selectedInterviewQuestionId)
        if (cancelled) {
          return
        }
        setQuestionCache((current) => ({
          ...current,
          [detail.id]: detail
        }))
        setSelectedInterviewQuestion(detail)
      } catch {
        if (!cancelled) {
          setSelectedInterviewQuestion(null)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [questionCache, selectedInterviewQuestionId])

  useEffect(() => {
    if (!selectedInterviewQuestionId) {
      return
    }

    if (!questionList.some((item) => item.id === selectedInterviewQuestionId)) {
      setSelectedInterviewQuestionId(questionList[0]?.id ?? null)
    }
  }, [questionList, selectedInterviewQuestionId])

  useEffect(() => {
    if (workspaceUi.sidebarTab !== 'interviews') {
      return
    }
    if (!selectedInterviewQuestionId && questionList.length > 0) {
      setSelectedInterviewQuestionId(questionList[0].id)
    }
  }, [questionList, selectedInterviewQuestionId, workspaceUi.sidebarTab])

  useEffect(() => {
    if (!selectedInterviewQuestionId) {
      return
    }
    const currentIndex = questionList.findIndex((item) => item.id === selectedInterviewQuestionId)
    const candidateIds = [
      questionList[currentIndex - 1]?.id,
      questionList[currentIndex]?.id,
      questionList[currentIndex + 1]?.id
    ].filter((item): item is string => Boolean(item))

    void loadQuestionDetails(candidateIds)
  }, [loadQuestionDetails, questionList, selectedInterviewQuestionId])

  useEffect(() => {
    if (!activeDocument?.watchPath) {
      return
    }

    let refreshTimer: number | null = null
    const socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/watch`)
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        type: 'watch',
        path: activeDocument.watchPath
      }))
    })
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data) as { type?: string }
      if (message.type === 'changed' && selectedDocumentId) {
        if (refreshTimer) {
          window.clearTimeout(refreshTimer)
        }
        refreshTimer = window.setTimeout(() => {
          if (selectedDocumentIdRef.current === selectedDocumentId) {
            void refreshDocument(selectedDocumentId)
          }
        }, 120)
      }
    })

    return () => {
      if (refreshTimer) {
        window.clearTimeout(refreshTimer)
      }
      socket.close()
    }
  }, [activeDocument?.watchPath, selectedDocumentId])

  useEffect(() => {
    if (!currentPaneId || currentPaneSections.length === 0) {
      return
    }

    const updateActiveSection = () => {
      const lock = scrollSpyLockRef.current
      if (lock && lock.expiresAt > Date.now() && currentPaneSections.some((section) => section.anchor === lock.anchor)) {
        setActiveSectionAnchor(lock.anchor)
        return
      }

      const position = window.scrollY + 156
      let nextAnchor = currentPaneSections[0]?.anchor ?? null

      for (const section of currentPaneSections) {
        const element = sectionRefs.current.get(buildSectionRefKey(currentPaneId, section.anchor))
        if (!element) {
          continue
        }
        if (element.offsetTop <= position) {
          nextAnchor = section.anchor
        } else {
          break
        }
      }

      if (nextAnchor) {
        setActiveSectionAnchor(nextAnchor)
      }
    }

    updateActiveSection()
    window.addEventListener('scroll', updateActiveSection, { passive: true })
    window.addEventListener('resize', updateActiveSection)
    return () => {
      window.removeEventListener('scroll', updateActiveSection)
      window.removeEventListener('resize', updateActiveSection)
    }
  }, [currentPaneId, currentPaneSections])

  useEffect(() => {
    if (!selectedKnowledgeSection) {
      return
    }
    void loadQuestionDetails(selectedKnowledgeSection.relatedQuestions.map((item) => item.id))
  }, [selectedKnowledgeSection])

  useEffect(() => {
    setActiveSectionAnchor((current) => (
      current && currentPaneSections.some((section) => section.anchor === current)
        ? current
        : currentPaneSections[0]?.anchor ?? null
    ))
  }, [currentPaneId, currentPaneSections])

  useEffect(() => {
    const currentViewportKey = workspaceUi.sidebarTab === 'interviews'
      ? selectedInterviewQuestionId
        ? `interview:${selectedInterviewQuestionId}`
        : null
      : activeDocument?.id
        ? `document:${activeDocument.id}`
        : null

    const previousViewportKey = lastViewportKeyRef.current
    lastViewportKeyRef.current = currentViewportKey

    if (!currentViewportKey || currentViewportKey === previousViewportKey) {
      return
    }

    if (workspaceUi.sidebarTab === 'interviews') {
      const nextScrollY = selectedInterviewQuestionId
        ? interviewScrollStateRef.current[selectedInterviewQuestionId] ?? 0
        : 0

      const rafId = window.requestAnimationFrame(() => {
        window.scrollTo({
          top: nextScrollY,
          behavior: 'auto'
        })
      })

      return () => {
        window.cancelAnimationFrame(rafId)
      }
    }

    if (guideSelectionSourceRef.current === 'scroll') {
      guideSelectionSourceRef.current = 'navigation'
      return
    }

    if (!activeDocument?.id || pendingFocus?.documentId === activeDocument.id) {
      return
    }

    const savedOffset = documentScrollStateRef.current[activeDocument.id] ?? 0

    const rafId = window.requestAnimationFrame(() => {
      const baseTop = getDocumentScrollBaseTop(activeDocument.id)
      const nextScrollY = baseTop === null
        ? savedOffset
        : Math.max(0, baseTop + savedOffset)
      window.scrollTo({
        top: nextScrollY,
        behavior: 'auto'
      })
    })

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [activeDocument?.id, pendingFocus?.documentId, selectedInterviewQuestionId, workspaceUi.sidebarTab])

  useEffect(() => {
    if (!pendingFocus || pendingFocus.documentId !== activeDocument?.id) {
      return
    }

    const targetSection = pendingFocus.anchor
      ? activeDocument.sections.find((section) => section.anchor === pendingFocus.anchor)
      : pendingFocus.heading
        ? activeDocument.sections.find((section) => section.heading === pendingFocus.heading)
        : null

    if (targetSection) {
      window.requestAnimationFrame(() => {
        scrollSpyLockRef.current = {
          anchor: targetSection.anchor,
          expiresAt: Date.now() + 1200
        }
        setActiveSectionAnchor(targetSection.anchor)
        sectionRefs.current.get(buildSectionRefKey(activeDocument.id, targetSection.anchor))?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      })
      if (pendingFocus.knowledgeAnchor) {
        setKnowledgeAnchor(pendingFocus.knowledgeAnchor)
      }
    }

    setPendingFocus(null)
  }, [activeDocument, pendingFocus])

  useEffect(() => {
    const status = activeIndexJob?.status ?? null
    if (!status || status === lastIndexJobStatusRef.current) {
      return
    }
    lastIndexJobStatusRef.current = status

    if (status === 'ready') {
      void refreshWorkspace()
      setShowOnboarding(false)
      setStatusNote('索引已更新，当前站点已切换到最新数据')
      return
    }

    if (status === 'failed') {
      setStatusNote(activeIndexJob?.error ?? '索引构建失败')
      return
    }

    if (status === 'cancelled') {
      setStatusNote('索引任务已取消')
    }
  }, [activeIndexJob, refreshWorkspace])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as BrowserNavState | null
      if (!state) {
        return
      }

      setWorkspaceUi((current) => ({
        ...current,
        currentDocumentId: state.documentId ?? current.currentDocumentId,
        currentInterviewQuestionId: state.questionId ?? current.currentInterviewQuestionId,
        sidebarTab: state.sidebarTab
      }))

      if (state.sidebarTab === 'interviews') {
        setSelectedInterviewQuestionId(state.questionId ?? null)
      } else if (state.documentId) {
        selectedDocumentIdRef.current = state.documentId
        setSelectedDocumentId(state.documentId)
        setPendingFocus(state.anchor
          ? {
              anchor: state.anchor,
              documentId: state.documentId,
              knowledgeAnchor: state.sidebarTab === 'documents' ? state.anchor : undefined
            }
          : null)
      }

      window.requestAnimationFrame(() => {
        if (typeof state.scrollY === 'number') {
          window.scrollTo({ top: state.scrollY, behavior: 'auto' })
        }
      })
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const setSidebarOpen = (open: boolean) => {
    if (isMobile) {
      setMobileSidebarOpen(open)
      return
    }

    setWorkspaceUi((current) => ({ ...current, sidebarOpen: open }))
  }

  const toggleSidebar = () => {
    setSidebarOpen(!effectiveSidebarOpen)
  }

  const switchSidebarTab = (nextTab: SidebarTab) => {
    if (workspaceUi.sidebarTab === 'interviews') {
      persistInterviewScroll(selectedInterviewQuestionId)
    } else {
      persistDocumentScroll(selectedDocumentIdRef.current)
    }

    if (nextTab !== 'documents') {
      setKnowledgeAnchor(null)
    }

    setWorkspaceUi((current) => ({ ...current, sidebarTab: nextTab }))

    if (nextTab === 'interviews') {
      const nextQuestionId = selectedInterviewQuestionId
        ?? viewStateRef.current.interviewQuestionId
        ?? questionList[0]?.id
        ?? null
      if (nextQuestionId) {
        setSelectedInterviewQuestionId(nextQuestionId)
      }
      pushBrowserNavigation({
        documentId: null,
        questionId: nextQuestionId,
        sidebarTab: nextTab
      })
      return
    }

    const preferredDocumentId = nextTab === 'mywork'
      ? viewStateRef.current.workDocumentId ?? workDocuments[0]?.id ?? null
      : viewStateRef.current.guideDocumentId ?? orderedGuideDocuments[0]?.id ?? null

    if (preferredDocumentId && preferredDocumentId !== selectedDocumentIdRef.current) {
      openDocument(preferredDocumentId, undefined, {
        pushHistory: false,
        tab: nextTab
      })
      pushBrowserNavigation({
        documentId: preferredDocumentId,
        questionId: null,
        sidebarTab: nextTab
      })
    } else {
      pushBrowserNavigation({
        documentId: preferredDocumentId,
        questionId: null,
        sidebarTab: nextTab
      })
    }
  }
  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isMobile) {
      return
    }

    sidebarResizeState.current = {
      startWidth: workspaceUi.sidebarWidth,
      startX: event.clientX
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const currentResize = sidebarResizeState.current
    if (!currentResize || isMobile) {
      return
    }

    const nextWidth = clampSidebarWidth(currentResize.startWidth + (event.clientX - currentResize.startX))
    setWorkspaceUi((current) => (
      current.sidebarWidth === nextWidth
        ? current
        : { ...current, sidebarWidth: nextWidth }
    ))
  }

  const endSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    sidebarResizeState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const pushBrowserNavigation = (nextState: BrowserNavState) => {
    if (typeof window === 'undefined') {
      return
    }

    const url = new URL(window.location.href)
    url.searchParams.set('tab', nextState.sidebarTab)
    if (nextState.documentId) {
      url.searchParams.set('doc', nextState.documentId)
    } else {
      url.searchParams.delete('doc')
    }
    if (nextState.questionId) {
      url.searchParams.set('q', nextState.questionId)
    } else {
      url.searchParams.delete('q')
    }
    if (nextState.anchor) {
      url.searchParams.set('anchor', nextState.anchor)
    } else {
      url.searchParams.delete('anchor')
    }

    window.history.pushState({
      ...nextState,
      scrollY: window.scrollY
    } satisfies BrowserNavState, '', url)
  }

  const openDocument = (
    documentId: string,
    nextFocus?: Omit<PendingFocus, 'documentId'>,
    options?: { pushHistory?: boolean; tab?: SidebarTab }
  ) => {
    const nextTab = options?.tab ?? (documents.find((item) => item.id === documentId)?.kind === 'work' ? 'mywork' : 'documents')
    const targetDocument = documents.find((item) => item.id === documentId) ?? null
    if (workspaceUi.sidebarTab === 'interviews') {
      persistInterviewScroll(selectedInterviewQuestionId)
    } else {
      persistDocumentScroll(selectedDocumentIdRef.current)
    }
    scrollSpyLockRef.current = null
    guideSelectionSourceRef.current = 'navigation'
    if (nextTab === 'documents' && targetDocument?.kind === 'guide') {
      setExpandedGuideKeys([getGuideGroupInfo(targetDocument.relPath).key])
    }
    guideNavigationLockRef.current = nextTab === 'documents' && targetDocument?.kind === 'guide'
      ? { documentId, expiresAt: Date.now() + 1200 }
      : null
    selectedDocumentIdRef.current = documentId
    setSelectedDocument(documentCache[documentId] ?? null)
    startTransition(() => {
      setWorkspaceUi((current) => ({ ...current, currentDocumentId: documentId, sidebarTab: nextTab }))
      setSelectedDocumentId(documentId)
      setKnowledgeAnchor(nextFocus?.knowledgeAnchor ?? null)
      setPendingFocus(nextFocus ? { documentId, ...nextFocus } : null)
    })
    if (options?.pushHistory !== false) {
      pushBrowserNavigation({
        anchor: nextFocus?.anchor ?? nextFocus?.knowledgeAnchor ?? null,
        documentId,
        sidebarTab: nextTab
      })
    }
    if (isMobile) {
      setMobileSidebarOpen(false)
    }
  }

  const openSearchQuestion = async (questionId: string) => {
    try {
      const detail = questionCache[questionId] ?? await fetchQuestionDetail(questionId)
      setQuestionCache((current) => ({
        ...current,
        [detail.id]: detail
      }))

      const primaryGuide = detail.guideMatches[0]
      if (!primaryGuide) {
        const fallbackGuide = detail.guideFallbackMatches[0]
        if (fallbackGuide) {
          openDocument(fallbackGuide.documentId, {
            anchor: GUIDE_FALLBACK_SECTION_ANCHOR
          })
          return
        }
        openInterviewQuestion(detail.id)
        setStatusNote('这个题目暂时没有主线锚点，已切到纯面经视图')
        return
      }

      openDocument(primaryGuide.documentId, {
        anchor: primaryGuide.anchor,
        knowledgeAnchor: primaryGuide.anchor
      })
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error))
    }
  }

  const openSearchSection = (item: SearchResponse['sections'][number]) => {
    openDocument(item.documentId, {
      heading: item.heading
    })
  }

  const openProjectDocument = (projectName: string) => {
    const match = workDocuments.find((document) => document.relPath === `${projectName}/README.md`)
      ?? workDocuments.find((document) => document.relPath.startsWith(`${projectName}/README`))
      ?? workDocuments.find((document) => document.relPath.startsWith(`${projectName}/`))
    if (match) {
      openDocument(match.id, undefined, { tab: 'mywork' })
      return
    }
    setStatusNote(`${projectName} 暂时没有可打开的工作文档`)
  }

  const openInterviewQuestion = (questionId: string, options?: { pushHistory?: boolean }) => {
    if (workspaceUi.sidebarTab === 'interviews') {
      persistInterviewScroll(selectedInterviewQuestionId)
    } else {
      persistDocumentScroll(selectedDocumentIdRef.current)
    }
    setWorkspaceUi((current) => ({ ...current, currentInterviewQuestionId: questionId, sidebarTab: 'interviews' }))
    setSelectedInterviewQuestionId(questionId)
    const questionCategoryId = questionList.find((item) => item.id === questionId)?.categoryId
    if (questionCategoryId) {
      setExpandedInterviewCategoryIds([questionCategoryId])
    }
    setKnowledgeAnchor(null)
    if (options?.pushHistory !== false) {
      pushBrowserNavigation({
        questionId,
        sidebarTab: 'interviews'
      })
    }
    if (isMobile) {
      setMobileSidebarOpen(false)
    }
  }

  const openGuideKnowledge = (documentId: string, anchor: string) => {
    if (documentId !== selectedDocumentIdRef.current) {
      guideSelectionSourceRef.current = 'scroll'
      selectedDocumentIdRef.current = documentId
      setWorkspaceUi((current) => ({ ...current, currentDocumentId: documentId, sidebarTab: 'documents' }))
      setSelectedDocumentId(documentId)
      setSelectedDocument(documentCache[documentId] ?? null)
    }

    setKnowledgeAnchor(anchor)
  }

  const scrollToPaneSection = (anchor: string) => {
    if (!currentPaneId) {
      return
    }

    scrollSpyLockRef.current = {
      anchor,
      expiresAt: Date.now() + 1200
    }
    setActiveSectionAnchor(anchor)

    if (workspaceUi.sidebarTab === 'documents') {
      const targetSection = activeDocument?.sections.find((section) => section.anchor === anchor) ?? null
      setKnowledgeAnchor(targetSection && targetSection.knowledgeHitCount > 0 ? anchor : null)
    } else {
      setKnowledgeAnchor(null)
    }

    sectionRefs.current.get(buildSectionRefKey(currentPaneId, anchor))?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }

  const toggleGuideGroup = (groupKey: string) => {
    setExpandedGuideKeys((current) => (
      current[0] === groupKey ? [] : [groupKey]
    ))
  }

  const toggleInterviewCategory = (categoryId: string) => {
    setExpandedInterviewCategoryIds((current) => (
      current[0] === categoryId ? [] : [categoryId]
    ))
  }

  const generateAnswerForQuestion = useEffectEvent(async (questionId: string) => {
    setGeneratingQuestionId(questionId)
    setStatusNote('Codex 正在围绕当前知识点生成个性化答案')

    try {
      const detail = questionCache[questionId] ?? await fetchQuestionDetail(questionId)
      setQuestionCache((current) => ({
        ...current,
        [detail.id]: detail
      }))
      const contextDocumentId = activeDocument?.id ?? detail.guideMatches[0]?.documentId ?? null

      const startedJob = await startAnswerGeneration({
        autoReferenceCurrentDoc,
        currentDocumentId: contextDocumentId,
        model: 'gpt-5.4',
        questionId,
        reasoningEffort: answerEffort,
        selectedDocumentIds: selectedReferenceIds
      })

      setQuestionJobs((current) => ({
        ...current,
        [questionId]: startedJob
      }))

      let latestJob = startedJob
      while (latestJob.status === 'queued' || latestJob.status === 'running') {
        await sleep(1500)
        latestJob = await fetchJob(startedJob.id)
        setQuestionJobs((current) => ({
          ...current,
          [questionId]: latestJob
        }))
      }

      const refreshed = await fetchQuestionDetail(questionId)
      setQuestionCache((current) => ({
        ...current,
        [questionId]: refreshed
      }))
      setSelectedInterviewQuestion((current) => current?.id === refreshed.id ? refreshed : current)
      if (activeDocument?.id) {
        await refreshDocument(activeDocument.id)
      }

      setStatusNote(
        latestJob.status === 'ready'
          ? '个性化答案已就位，可以继续顺着这一章往下学'
          : latestJob.error ?? '答案生成失败'
      )
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error))
    } finally {
      setGeneratingQuestionId(null)
    }
  })

  const openInterviewerMode = useEffectEvent((questionId: string, seedFollowUp: string, questionTitle?: string | null) => {
    const cached = questionCache[questionId]
    setInterviewerSession({
      questionId,
      questionTitle: questionTitle?.trim() || cached?.displayText || cached?.text || questionId,
      seedFollowUp,
      sessionKey: `${questionId}:${Date.now()}`
    })
  })

  const saveCurrentSourcesConfig = useEffectEvent(async () => {
    if (!draftSourcesConfig) {
      return
    }
    setSettingsBusy(true)
    try {
      await saveSourcesSettings(draftSourcesConfig)
      const refreshed = await fetchSourcesSettings()
      setSourcesSettings(refreshed)
      setDraftSourcesConfig(refreshed.config)
      setShowOnboarding(false)
      setStatusNote('来源配置已保存')
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error))
    } finally {
      setSettingsBusy(false)
    }
  })

  const startWorkspaceBuild = useEffectEvent(async (config: SourcesConfig) => {
    setSettingsBusy(true)
    try {
      const job = await startIndexJob(config)
      setActiveIndexJobId(job.id)
      setSettingsOpen(true)
      setJobsOpen(false)
      setShowOnboarding(false)
      setStatusNote('开始同步来源并重建索引')
      setAgentJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error))
    } finally {
      setSettingsBusy(false)
    }
  })

  const importInterviewQuestionBank = useEffectEvent(async (payload: InterviewImportPayload) => {
    setImportBusy(true)
    try {
      const imported = await importInterviewEntry(payload)
      const refreshedSettings = await fetchSourcesSettings()
      setSourcesSettings(refreshedSettings)
      setDraftSourcesConfig(refreshedSettings.config)
      setImportOpen(false)
      setStatusNote(`已保存《${imported.title}》，准备重建索引`)
      await startWorkspaceBuild(refreshedSettings.config)
      setWorkspaceUi((current) => ({ ...current, sidebarTab: 'interviews' }))
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error))
    } finally {
      setImportBusy(false)
    }
  })

  const openAgentJob = useEffectEvent((jobId: string) => {
    setSelectedAgentJobId(jobId)
  })

  const cancelSelectedAgentJob = useEffectEvent(async (jobId: string) => {
    try {
      const job = await cancelAgentJob(jobId)
      setAgentJobs((current) => current.map((item) => item.id === job.id ? job : item))
      if (selectedAgentJobId === job.id) {
        setSelectedAgentJob(job)
      }
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error))
    }
  })

  const rerunSelectedAgentJob = useEffectEvent(async (jobId: string, prompt: string) => {
    try {
      const job = await rerunAgentJob(jobId, prompt)
      setAgentJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])
      setSelectedAgentJobId(job.id)
      setStatusNote('已基于当前 prompt 重新提交任务')
    } catch (error) {
      setStatusNote(error instanceof Error ? error.message : String(error))
    }
  })

  const sidebarPanel = (
    <div className="sidebar-card sidebar-shell">
      <div className="sidebar-topbar">
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${workspaceUi.sidebarTab === 'documents' ? 'active' : ''}`}
            onClick={() => switchSidebarTab('documents')}
          >
            <BookOpenText size={16} />
            <span className="sidebar-tab-label">主线</span>
            <small>{guideDocuments.length}</small>
          </button>
          <button
            className={`sidebar-tab ${workspaceUi.sidebarTab === 'interviews' ? 'active' : ''}`}
            onClick={() => switchSidebarTab('interviews')}
          >
            <BrainCircuit size={16} />
            <span className="sidebar-tab-label">面经</span>
            <small>{questionList.length}</small>
          </button>
          <button
            className={`sidebar-tab ${workspaceUi.sidebarTab === 'mywork' ? 'active' : ''}`}
            onClick={() => switchSidebarTab('mywork')}
          >
            <Briefcase size={16} />
            <span className="sidebar-tab-label">工作</span>
            <small>{workProjects.length}</small>
          </button>
        </div>
      </div>

      {workspaceUi.sidebarTab === 'documents' ? (
        <div className="sidebar-scroll">
          <section className="sidebar-subsection">
            <div className="sidebar-section-head compact">
              <h2>学习顺序</h2>
              <span>一级 / 二级树</span>
            </div>

            <div className="guide-tree">
              {guideGroups.map((group) => {
                const expanded = expandedGuideKeys.includes(group.key)
                return (
                  <section key={group.key} className="guide-tree-group">
                    <button
                      className={`guide-tree-parent ${activeGuideGroupKey === group.key ? 'active' : ''}`}
                      onClick={() => {
                        if (activeGuideGroupKey !== group.key && group.documents[0]) {
                          setExpandedGuideKeys([group.key])
                          openDocument(group.documents[0].id)
                          return
                        }
                        toggleGuideGroup(group.key)
                      }}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="guide-order">{group.order}</span>
                      <strong>{group.label}</strong>
                      <small>{group.documents.length}</small>
                    </button>

                    {expanded && (
                      <div className="guide-tree-children">
                        {group.documents.map((document) => (
                          <button
                            key={document.id}
                            className={`guide-tree-leaf ${document.id === selectedDocumentId ? 'active' : ''}`}
                            onClick={() => openDocument(document.id)}
                          >
                            <div>
                              <span className="guide-source">{formatGuideLeafLabel(document.relPath)}</span>
                              <strong>{document.title}</strong>
                            </div>
                            {(document.knowledgeHitCount ?? 0) > 0 && <small>{document.knowledgeHitCount}</small>}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </section>

          <section className="sidebar-subsection toc-card">
            <CurrentPaneOutlineCard
              activeAnchor={activeSectionAnchor}
              countLabel={currentPaneOutlineCountLabel}
              emptyNote="打开一篇主线文档后，这里会显示当前章节树和知识命中点。"
              onSelect={scrollToPaneSection}
              sections={currentPaneSections}
              title={currentPaneOutlineTitle}
            />
          </section>
        </div>
      ) : workspaceUi.sidebarTab === 'interviews' ? (
        <div className="sidebar-scroll">
          <section className="sidebar-subsection">
            <div className="sidebar-section-head compact">
              <h2>面经分类</h2>
              <span>{questionList.length} 题</span>
            </div>
            <p className="sidebar-note">
              默认题库和你手动导入的新面经会一起归进这里，按主题分类后直接浏览个性化答案。
            </p>

            <div className="guide-tree interview-tree">
              {interviewCategoryGroups.map((group) => {
                const expanded = expandedInterviewCategoryIds.includes(group.categoryId)
                return (
                  <section key={group.categoryId} className="guide-tree-group">
                    <button
                      className={`guide-tree-parent ${activeInterviewCategoryId === group.categoryId ? 'active' : ''}`}
                      onClick={() => toggleInterviewCategory(group.categoryId)}
                    >
                      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="guide-order">{String(group.categoryOrder).padStart(2, '0')}</span>
                      <strong>{group.categoryLabel}</strong>
                      <small>{group.questions.length}</small>
                    </button>

                    {expanded && (
                      <div className="guide-tree-children interview-question-children">
                        {group.questions.map((question) => (
                          <button
                            key={question.id}
                            className={`guide-tree-leaf interview-question-leaf ${question.id === selectedInterviewQuestionId ? 'active' : ''}`}
                            onClick={() => openInterviewQuestion(question.id)}
                          >
                            <div className="interview-question-main">
                              <span className="guide-source">
                                {question.company ?? question.sourceTitle}
                              </span>
                              <QuestionTitle displayText={question.displayText} text={question.text} />
                              <div className="interview-question-meta-row">
                                <GuidePresenceBadge
                                  exactCount={question.guideLinkCount}
                                  fallbackCount={question.guideFallbackCount}
                                  compact
                                />
                                <span className="interview-question-presence-copy">
                                  {buildQuestionPresenceSummary(question)}
                                </span>
                                <span className={`question-state-pill ${question.generatedStatus === 'ready' ? 'ready' : 'pending'}`}>
                                  {question.generatedStatus === 'ready' ? '答案已就绪' : '待生成'}
                                </span>
                              </div>
                            </div>
                            <div className="interview-question-trailing">
                              <small>{question.difficulty}</small>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          </section>

          <section className="sidebar-subsection toc-card">
            <CurrentPaneOutlineCard
              activeAnchor={activeSectionAnchor}
              countLabel={currentPaneOutlineCountLabel}
              emptyNote="打开一道面经题后，这里会显示当前题目的回答结构与证据分布。"
              onSelect={scrollToPaneSection}
              sections={currentPaneSections}
              title={currentPaneOutlineTitle}
            />
          </section>
        </div>
      ) : (
        <div className="sidebar-scroll">
          <section className="sidebar-subsection">
            <div className="sidebar-section-head compact">
              <h2>工作集</h2>
              <span>{workProjects.length} 个项目</span>
            </div>
            <p className="sidebar-note">
              首次使用请把论文、代码、笔记放进 <code>./mywork</code>，或在设置里改成你自己的目录。
            </p>
            <div className="project-list compact">
              {workProjects.map((project) => (
                <button
                  key={project.id}
                  className={`project-link compact ${activeDocument?.relPath?.startsWith(`${project.name}/`) ? 'active' : ''}`}
                  onClick={() => openProjectDocument(project.name)}
                >
                  <strong>{project.name}</strong>
                  <p>{project.summary}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="sidebar-subsection toc-card">
            <CurrentPaneOutlineCard
              activeAnchor={activeSectionAnchor}
              countLabel={currentPaneOutlineCountLabel}
              emptyNote="打开一个项目文档后，这里会同步显示当前材料的结构导航。"
              onSelect={scrollToPaneSection}
              sections={currentPaneSections}
              title={currentPaneOutlineTitle}
            />
          </section>
        </div>
      )}
    </div>
  )

  return (
    <div className="app-shell doc-site-shell" style={appStyle}>
      <section className="command-deck compact-toolbar">
        <label className="field search-field search-field-inline">
          <div className="input-shell">
            <Search size={16} />
            <input
              placeholder="全局搜索章节、题目、面经与主题"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
          </div>
        </label>

        <div className="command-controls">
          <button className="ghost-button toolbar-icon-button icon-only" aria-label="打开设置" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={16} />
          </button>
          <button className="ghost-button toolbar-icon-button icon-only" aria-label="打开任务中心" onClick={() => setJobsOpen(true)}>
            <Activity size={16} />
            {agentJobs.some((job) => job.status === 'queued' || job.status === 'running') && (
              <span className="inline-badge">{agentJobs.filter((job) => job.status === 'queued' || job.status === 'running').length}</span>
            )}
          </button>
          <button className="ghost-button toolbar-icon-button icon-only" aria-label="添加面经" onClick={() => setImportOpen(true)}>
            <Plus size={16} />
          </button>
        </div>
      </section>

      <div className="workspace-status-note">{statusNote}</div>

      <AnimatePresence initial={false}>
        {searchPreview && deferredSearch.trim() && (
          <motion.section
            className="search-preview-sheet"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="search-preview-column">
              <div className="search-preview-header">
                <strong>题库命中</strong>
                <span>{searchPreview.questions.length}</span>
              </div>
              <div className="search-preview-list">
                {searchPreview.questions.slice(0, 8).map((item) => (
                  <button key={item.id} className="search-result-card" onClick={() => void openSearchQuestion(item.id)}>
                    <span className="result-kind">题目</span>
                    <QuestionTitle displayText={item.displayText} text={item.text} />
                  </button>
                ))}
              </div>
            </div>

            <div className="search-preview-column">
              <div className="search-preview-header">
                <strong>章节命中</strong>
                <span>{searchPreview.sections.length}</span>
              </div>
              <div className="search-preview-list">
                {searchPreview.sections.slice(0, 8).map((item) => (
                  <button key={item.id} className="search-result-card" onClick={() => openSearchSection(item)}>
                    <span className="result-kind">章节</span>
                    <strong>{item.heading}</strong>
                    <small>{item.relPath}</small>
                  </button>
                ))}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div
        className={`study-layout ${effectiveSidebarOpen ? '' : 'sidebar-collapsed'} ${isMobile ? 'is-mobile' : ''}`}
        style={{
          ['--sidebar-width' as string]: `${sidebarWidth}px`
        }}
      >
        <button
          className={`sidebar-rail-toggle ${effectiveSidebarOpen ? 'open' : 'closed'}`}
          aria-label={effectiveSidebarOpen ? '收起侧边栏' : '展开侧边栏'}
          onClick={toggleSidebar}
          style={sidebarToggleStyle}
        >
          {effectiveSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        {isMobile ? (
          <AnimatePresence initial={false}>
            {effectiveSidebarOpen && (
              <>
                <motion.button
                  aria-label="关闭侧边栏"
                  className="sidebar-mobile-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMobileSidebarOpen(false)}
                />
                <motion.aside
                  className="study-sidebar mobile"
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                >
                  {sidebarPanel}
                </motion.aside>
              </>
            )}
          </AnimatePresence>
        ) : effectiveSidebarOpen ? (
          <aside className="study-sidebar">
            {sidebarPanel}
            <div
              aria-label="调整侧边栏宽度"
              className="sidebar-resize-handle"
              onPointerDown={startSidebarResize}
              onPointerMove={moveSidebarResize}
              onPointerUp={endSidebarResize}
              onPointerCancel={endSidebarResize}
              role="separator"
            />
          </aside>
        ) : null}

        <main className="doc-stage">
          {workspaceUi.sidebarTab === 'interviews' ? (
            questionList.length > 0 ? (
              activeInterviewQuestion ? (
                <div className="interview-workspace">
                  <InterviewQuestionStage
                    answerEffort={answerEffort}
                    onGenerate={generateAnswerForQuestion}
                    onOpenGuideFallback={(match) => {
                      openDocument(match.documentId, {
                        anchor: GUIDE_FALLBACK_SECTION_ANCHOR
                      })
                    }}
                    onOpenGuideMatch={(match) => {
                      openDocument(match.documentId, {
                        anchor: match.anchor,
                        knowledgeAnchor: match.anchor
                      })
                    }}
                    onOpenInterviewerMode={openInterviewerMode}
                    onOpenWorkMatch={(match) => {
                      openDocument(match.id, undefined, { tab: 'mywork' })
                    }}
                    onSelectAnswerEffort={setAnswerEffort}
                    paneId={currentPaneId ?? `interview:${activeInterviewQuestion.id}`}
                    question={activeInterviewQuestion}
                    sectionRefs={sectionRefs}
                  />
                </div>
              ) : selectedInterviewQuestionId ? (
                <LoadingPaper
                  label="面经题"
                  message="正在载入题目详情与个性化答案"
                  reference={questionList.find((item) => item.id === selectedInterviewQuestionId)?.sourcePath ?? ''}
                  title={questionList.find((item) => item.id === selectedInterviewQuestionId)?.displayText ?? '正在载入面经题'}
                />
              ) : (
                <EmptyPanel
                  body="从左侧选一道已经分类好的面经题，这里会直接展开来源、知识命中和个性化答案。"
                  icon={<BrainCircuit size={18} />}
                  title="还没有打开面经题"
                />
              )
            ) : (
              <EmptyPanel
                body="从左侧选一道已经分类好的面经题，这里会直接展开来源、知识命中和个性化答案。"
                icon={<BrainCircuit size={18} />}
                title="还没有打开面经题"
              />
            )
          ) : workspaceUi.sidebarTab === 'documents' ? (
            activeGuideGroup ? (
              <GuideDocumentStream
                activeDocumentId={selectedDocumentId}
                articleRefs={guideArticleRefs}
                documentCache={documentCache}
                documents={activeGuideGroup.documents}
                focusedKnowledgeAnchor={knowledgeAnchor}
                liveRefreshAt={liveRefreshAt}
                onOpenKnowledge={openGuideKnowledge}
                onOpenQuestion={openInterviewQuestion}
                sectionRefs={sectionRefs}
              />
            ) : (
              <EmptyPanel
                body="从左侧按顺序打开一篇指南文档，这里会显示正文、章节目录和底部注脚。"
                icon={<BookOpenText size={18} />}
                title="还没有打开文档"
              />
            )
          ) : activeDocument ? (
            <DocumentStreamArticle
              document={activeDocument}
              focusedKnowledgeAnchor={knowledgeAnchor}
              liveRefreshAt={liveRefreshAt}
              onOpenKnowledge={(_documentId, anchor) => {
                setKnowledgeAnchor(anchor)
              }}
              onOpenQuestion={openInterviewQuestion}
              sectionRefs={sectionRefs}
            />
          ) : selectedDocumentId ? (
            <LoadingPaper
              label={workspaceUi.sidebarTab === 'mywork' ? '工作材料' : '主线文档'}
              message={workspaceUi.sidebarTab === 'mywork' ? '正在载入项目材料与结构导航' : '正在载入文档内容与章节锚点'}
              reference={documents.find((item) => item.id === selectedDocumentId)?.path ?? ''}
              title={documents.find((item) => item.id === selectedDocumentId)?.title ?? '正在载入文档'}
            />
          ) : (
            <EmptyPanel
              body="从左侧按顺序打开一篇指南文档，这里会显示正文、章节目录和底部注脚。"
              icon={<BookOpenText size={18} />}
              title="还没有打开文档"
            />
          )}
        </main>
      </div>

      <KnowledgePanel
        activeSection={selectedKnowledgeSection}
        answerEffort={answerEffort}
        generatingQuestionId={generatingQuestionId}
        jobs={questionJobs}
        onClose={() => setKnowledgeAnchor(null)}
        onOpenDocument={(documentId, tab) => openDocument(documentId, undefined, { tab })}
        onOpenInterviewerMode={openInterviewerMode}
        onGenerate={generateAnswerForQuestion}
        onSelectAnswerEffort={setAnswerEffort}
        questionCache={questionCache}
      />

      <FloatingCodexWindow
        autoReferenceCurrentDoc={autoReferenceCurrentDoc}
        currentDocument={activeDocument}
        documents={documents}
        model={model}
        models={meta?.models ?? ['gpt-5.4', 'gpt-5.2', 'gpt-5']}
        onAutoReferenceCurrentDocChange={setAutoReferenceCurrentDoc}
        onModelChange={setModel}
        onReasoningEffortChange={setReasoningEffort}
        onSelectedProjectIdsChange={setSelectedProjectIds}
        onSelectedReferenceIdsChange={setSelectedReferenceIds}
        reasoningEffort={reasoningEffort}
        reasoningEfforts={(meta?.reasoningEfforts ?? ['low', 'medium', 'high', 'xhigh']) as ReasoningEffort[]}
        selectedProjectIds={selectedProjectIds}
        selectedReferenceIds={selectedReferenceIds}
        workProjects={workProjects}
      />

      <InterviewerModeDrawer
        onClose={() => setInterviewerSession(null)}
        onReasoningEffortChange={setInterviewerEffort}
        open={Boolean(interviewerSession)}
        reasoningEffort={interviewerEffort}
        reasoningEfforts={(meta?.reasoningEfforts ?? ['low', 'medium', 'high', 'xhigh']) as ReasoningEffort[]}
        session={interviewerSession}
      />

      <SettingsDrawer
        busy={settingsBusy}
        draftConfig={draftSourcesConfig}
        indexJob={activeIndexJob}
        onClose={() => setSettingsOpen(false)}
        onDraftChange={setDraftSourcesConfig}
        onResetDefaults={() => {
          if (sourcesSettings) {
            setDraftSourcesConfig({
              ...sourcesSettings.defaultConfig,
              myWork: sourcesSettings.autoDetectedMyWorkPath
                ? {
                    ...sourcesSettings.defaultConfig.myWork,
                    path: sourcesSettings.autoDetectedMyWorkPath
                  }
                : sourcesSettings.defaultConfig.myWork
            })
          }
        }}
        onSave={() => void saveCurrentSourcesConfig()}
        onStartBuild={() => {
          if (draftSourcesConfig) {
            void startWorkspaceBuild(draftSourcesConfig)
          }
        }}
        onThemeChange={(themeId) => setWorkspaceUi((current) => ({ ...current, themeId: themeId as WorkspaceThemeId }))}
        onTypographyChange={(typography) => setWorkspaceUi((current) => ({ ...current, typography }))}
        open={settingsOpen}
        settings={sourcesSettings}
        themeId={workspaceUi.themeId}
        themes={WORKSPACE_THEMES.map((theme) => ({
          hint: theme.hint,
          id: theme.id,
          label: theme.label,
          swatches: theme.swatches
        }))}
        typography={workspaceUi.typography}
      />

      <JobsDrawer
        jobs={agentJobs}
        onCancel={(jobId) => void cancelSelectedAgentJob(jobId)}
        onClose={() => setJobsOpen(false)}
        onPromptDraftChange={setAgentPromptDraft}
        onRerun={(jobId, prompt) => void rerunSelectedAgentJob(jobId, prompt)}
        onSelectJob={(jobId) => void openAgentJob(jobId)}
        open={jobsOpen}
        promptDraft={agentPromptDraft}
        selectedJob={selectedAgentJob}
      />

      <InterviewImportModal
        busy={importBusy}
        onClose={() => setImportOpen(false)}
        onSubmit={(payload) => void importInterviewQuestionBank(payload)}
        open={importOpen}
      />

      <FirstRunDialog
        onOpenSettings={() => {
          setShowOnboarding(false)
          setSettingsOpen(true)
        }}
        onQuickStart={() => {
          if (draftSourcesConfig) {
            void startWorkspaceBuild(draftSourcesConfig)
          }
        }}
        onSkip={() => setShowOnboarding(false)}
        open={showOnboarding}
        settings={sourcesSettings}
      />
    </div>
  )
}

function EmptyPanel(props: { body: string; icon: ReactNode; title: string }) {
  return (
    <div className="empty-panel">
      <div className="empty-icon">{props.icon}</div>
      <strong>{props.title}</strong>
      <p>{props.body}</p>
    </div>
  )
}

function LoadingPaper(props: {
  label: string
  message: string
  reference?: string | null
  title: string
}) {
  return (
    <article className="doc-paper doc-paper-loading">
      <div className="doc-paper-header">
        <div>
          <div className="doc-header-stats">
            <span className="sub-chip accent">{props.label}</span>
            <span className="sub-chip">加载中</span>
          </div>
          <h2>{props.title}</h2>
          {props.reference && <p className="doc-reference">{props.reference}</p>}
        </div>
      </div>

      <div className="loading-panel">
        <div className="loading-mark" aria-hidden="true">
          <span className="loading-mark-dot" />
          <span className="loading-mark-dot" />
          <span className="loading-mark-dot" />
        </div>
        <div className="loading-copy">
          <strong>{props.message}</strong>
          <p>正在整理正文、结构导航和引用关系。</p>
        </div>
        <div className="loading-skeleton" aria-hidden="true">
          <span className="loading-line long" />
          <span className="loading-line medium" />
          <span className="loading-line short" />
        </div>
      </div>
    </article>
  )
}

function CurrentPaneOutlineCard(props: {
  activeAnchor: string | null
  countLabel: string
  emptyNote: string
  onSelect: (anchor: string) => void
  sections: PaneNavigationSection[]
  title: string
}) {
  return (
    <>
      <div className="sidebar-section-head compact">
        <h2>{props.title}</h2>
        <span>{props.countLabel}</span>
      </div>
      {props.sections.length > 0 ? (
        <div className="toc-list">
          {props.sections.map((section) => (
            <button
              key={section.anchor}
              className={`toc-link compact ${section.anchor === props.activeAnchor ? 'active' : ''} ${section.tone === 'knowledge' ? 'has-knowledge' : ''}`}
              onClick={() => props.onSelect(section.anchor)}
            >
              <span>{section.kicker}</span>
              <strong>{section.heading}</strong>
              {section.badge ? <small>{section.badge}</small> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="sidebar-empty-note">{props.emptyNote}</div>
      )}
    </>
  )
}

function GuideDocumentStream(props: {
  activeDocumentId: string | null
  articleRefs: MutableRefObject<Map<string, HTMLElement>>
  documentCache: Record<string, DocumentData>
  documents: DocumentListItem[]
  focusedKnowledgeAnchor: string | null
  liveRefreshAt: string | null
  onOpenKnowledge: (documentId: string, anchor: string) => void
  onOpenQuestion: (questionId: string) => void
  sectionRefs: MutableRefObject<Map<string, HTMLElement>>
}) {
  return (
    <div className="document-stream">
      {props.documents.map((item) => {
        const document = props.documentCache[item.id]
        const isActive = item.id === props.activeDocumentId

        if (!document || document.id !== item.id) {
          return (
            <LoadingPaper
              key={item.id}
              label="主线文档"
              message="正在载入这一篇文章"
              reference={item.path}
              title={item.title}
            />
          )
        }

        return (
          <DocumentStreamArticle
            key={item.id}
            articleRef={(node) => {
              if (node) {
                props.articleRefs.current.set(item.id, node)
              } else {
                props.articleRefs.current.delete(item.id)
              }
            }}
            document={document}
            focusedKnowledgeAnchor={isActive ? props.focusedKnowledgeAnchor : null}
            isActive={isActive}
            liveRefreshAt={isActive ? props.liveRefreshAt : null}
            onOpenKnowledge={props.onOpenKnowledge}
            onOpenQuestion={props.onOpenQuestion}
            sectionRefs={props.sectionRefs}
          />
        )
      })}
    </div>
  )
}

function DocumentStreamArticle(props: {
  articleRef?: ((node: HTMLElement | null) => void) | undefined
  document: DocumentData
  focusedKnowledgeAnchor: string | null
  isActive?: boolean
  liveRefreshAt: string | null
  onOpenKnowledge: (documentId: string, anchor: string) => void
  onOpenQuestion: (questionId: string) => void
  sectionRefs: MutableRefObject<Map<string, HTMLElement>>
}) {
  return (
    <article
      ref={props.articleRef}
      className={`doc-paper stream-article ${props.isActive ? 'active-stream-article' : ''}`}
      data-document-id={props.document.id}
    >
      <div className="doc-paper-header">
        <div>
          <h2>{props.document.title}</h2>
          <div className="doc-header-stats">
            <span className="sub-chip">{props.document.kind === 'guide' ? '指南文档' : props.document.kind}</span>
            <span className="sub-chip">{props.document.sections.length} 个章节</span>
            <span className="sub-chip accent">
              {props.document.sections.filter((section) => section.knowledgeHitCount > 0).length} 个知识命中点
            </span>
            {props.liveRefreshAt && <span className="sub-chip">刷新于 {props.liveRefreshAt}</span>}
          </div>
          <p className="doc-reference">{props.document.path}</p>
        </div>
      </div>

      <div className="doc-article-flow">
        {props.document.sections.map((section) => (
          <section
            key={`${props.document.id}-${section.anchor}-${section.startLine}`}
            ref={(node) => {
              const key = buildSectionRefKey(props.document.id, section.anchor)
              if (node) {
                props.sectionRefs.current.set(key, node)
              } else {
                props.sectionRefs.current.delete(key)
              }
            }}
            data-anchor={section.anchor}
            className={`doc-chapter ${section.knowledgeHitCount > 0 ? 'has-knowledge' : ''} ${section.anchor === props.focusedKnowledgeAnchor ? 'focused' : ''}`}
          >
            <div className="doc-chapter-header">
              <div>
                <span className="chapter-level">H{section.level}</span>
                <h3>{section.heading}</h3>
              </div>

              {section.knowledgeHitCount > 0 && (
                <button className="knowledge-trigger" onClick={() => props.onOpenKnowledge(props.document.id, section.anchor)}>
                  <BrainCircuit size={16} />
                  <span>相关追问</span>
                  <strong>{section.knowledgeHitCount}</strong>
                </button>
              )}
            </div>

            <DocumentSectionView
              content={section.content}
              isMarkdown={['md', 'mdx', 'markdown', 'txt'].includes(props.document.ext)}
            />

            {section.relatedQuestions.length > 0 && (
              <div className="chapter-footnotes">
                <div className="footnote-heading">
                  <span>本节注脚</span>
                  <strong>相关面试题</strong>
                </div>
                <SectionFootnotes
                  onOpen={() => props.onOpenKnowledge(props.document.id, section.anchor)}
                  questions={section.relatedQuestions}
                />
              </div>
            )}
          </section>
        ))}

        {props.document.looseRelatedQuestions.length > 0 && (
          <section
            ref={(node) => {
              const key = buildSectionRefKey(props.document.id, GUIDE_FALLBACK_SECTION_ANCHOR)
              if (node) {
                props.sectionRefs.current.set(key, node)
              } else {
                props.sectionRefs.current.delete(key)
              }
            }}
            data-anchor={GUIDE_FALLBACK_SECTION_ANCHOR}
            className="doc-chapter doc-chapter-extension has-knowledge"
          >
            <div className="doc-chapter-header">
              <div>
                <span className="chapter-level">PLUS</span>
                <h3>章节延伸题</h3>
              </div>
              <GuidePresenceBadge
                exactCount={0}
                fallbackCount={props.document.looseRelatedQuestions.length}
              />
            </div>

            <p className="chapter-extension-copy">
              这些题目和本章大意明显相关，但还没有精准命中到某个具体知识点，所以统一沉淀在章末，方便按学习顺序补齐。
            </p>

            <div className="chapter-footnotes chapter-footnotes-extension">
              <div className="footnote-heading">
                <span>本章延伸</span>
                <strong>大意相关题</strong>
              </div>
              <SectionFootnotes
                onOpen={() => undefined}
                onOpenQuestion={props.onOpenQuestion}
                questions={props.document.looseRelatedQuestions}
              />
            </div>
          </section>
        )}
      </div>
    </article>
  )
}

function DocumentSectionView(props: { content: string; isMarkdown: boolean }) {
  if (!props.isMarkdown) {
    return <pre className="code-block">{props.content}</pre>
  }

  return (
    <div className="markdown-block">
      <MarkdownRenderer>{props.content}</MarkdownRenderer>
    </div>
  )
}

function MarkdownRenderer(props: { children: string }) {
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeKatex]}
      remarkPlugins={[remarkGfm, remarkMath]}
    >
      {normalizeMarkdownForRender(props.children)}
    </ReactMarkdown>
  )
}

function QuestionTitle(props: { displayText?: string | null; text: string }) {
  const title = buildQuestionTitleParts(props.displayText, props.text)

  return (
    <div className="question-title-stack">
      <strong>{title.primary}</strong>
      {title.secondary && <small>{title.secondary}</small>}
    </div>
  )
}

function FollowUpInterviewerList(props: {
  items: string[]
  onOpenInterviewerMode: (questionId: string, followUp: string, questionTitle?: string | null) => void
  questionId: string
  questionTitle?: string | null
}) {
  return (
    <div className="answer-bullet-list follow-up-drill-list">
      {props.items.map((item) => (
        <div key={`${props.questionId}-${item}`} className="answer-bullet-item follow-up-drill-item">
          <span>{item}</span>
          <button
            aria-label="进入面试官模式"
            className="follow-up-drill-button"
            onClick={() => props.onOpenInterviewerMode(props.questionId, item, props.questionTitle)}
            title="面试官模式"
            type="button"
          >
            <BrainCircuit size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

function GuidePresenceBadge(props: {
  compact?: boolean
  exactCount: number
  fallbackCount: number
}) {
  const status = props.exactCount > 0
    ? 'direct'
    : props.fallbackCount > 0
      ? 'fallback'
      : 'none'
  const label = props.exactCount > 0
    ? '主线命中'
    : props.fallbackCount > 0
      ? '章末补充'
      : '未出现'
  const exactLabel = props.exactCount > 0 ? String(props.exactCount) : null
  const fallbackLabel = props.exactCount > 0 && props.fallbackCount > 0
    ? `+${props.fallbackCount}`
    : props.exactCount === 0 && props.fallbackCount > 0
      ? String(props.fallbackCount)
      : null

  return (
    <div className={`guide-presence-badge ${status} ${props.compact ? 'compact' : ''}`}>
      <span className="guide-presence-led" />
      {!props.compact && <span className="guide-presence-label">{label}</span>}
      {exactLabel ? <strong>{exactLabel}</strong> : null}
      {fallbackLabel ? <small>{fallbackLabel}</small> : null}
      {!exactLabel && !fallbackLabel && props.compact && (
        <small className="guide-presence-empty">未</small>
      )}
    </div>
  )
}

function SectionFootnotes(props: {
  onOpen: () => void
  onOpenQuestion?: (questionId: string) => void
  questions: RelatedQuestion[]
}) {
  const groupedQuestions = partitionQuestionsByLearningProgress(props.questions)

  return (
    <>
      <div className="footnote-list">
        {groupedQuestions.fresh.map((question, index) => (
          <button
            key={question.id}
            className="footnote-card"
            onClick={() => {
              if (props.onOpenQuestion) {
                props.onOpenQuestion(question.id)
                return
              }
              props.onOpen()
            }}
          >
            <div className="footnote-index">[{index + 1}]</div>
            <div className="footnote-copy">
              <QuestionTitle displayText={question.displayText} text={question.text} />
              <div className="footnote-meta">
                <span className="pill subtle">{question.questionType}</span>
                <span className="pill subtle">{question.difficulty}</span>
                <span className={`pill ${question.generatedStatus === 'ready' ? 'success' : ''}`}>
                  {question.generatedStatus === 'ready' ? '已有个性化答案' : '可现场生成'}
                </span>
              </div>
            </div>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>

      {groupedQuestions.revisited.length > 0 && (
        <details className="revisited-group chapter-revisited-group">
          <summary>前面已经出现过的题目 {groupedQuestions.revisited.length} 条</summary>
          <div className="revisited-group-body footnote-list">
            {groupedQuestions.revisited.map((question) => (
              <button
                key={question.id}
                className="footnote-card revisited-footnote-card"
                onClick={() => {
                  if (props.onOpenQuestion) {
                    props.onOpenQuestion(question.id)
                    return
                  }
                  props.onOpen()
                }}
              >
                <div className="footnote-index">↺</div>
                <div className="footnote-copy">
                  <QuestionTitle displayText={question.displayText} text={question.text} />
                  <div className="footnote-meta">
                    <span className="pill subtle">{question.questionType}</span>
                    <span className="pill subtle">{question.difficulty}</span>
                    <span className={`pill ${question.generatedStatus === 'ready' ? 'success' : ''}`}>
                      {question.generatedStatus === 'ready' ? '已有个性化答案' : '可现场生成'}
                    </span>
                  </div>
                </div>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </details>
      )}
    </>
  )
}

function KnowledgePanel(props: {
  activeSection: DocumentData['sections'][number] | null
  answerEffort: 'low' | 'high' | 'xhigh'
  generatingQuestionId: string | null
  jobs: QuestionJobMap
  onClose: () => void
  onOpenDocument: (documentId: string, tab?: SidebarTab) => void
  onOpenInterviewerMode: (questionId: string, followUp: string, questionTitle?: string | null) => void
  onGenerate: (questionId: string) => Promise<void> | void
  onSelectAnswerEffort: (effort: 'low' | 'high' | 'xhigh') => void
  questionCache: CachedQuestionMap
}) {
  const groupedQuestions = props.activeSection
    ? partitionQuestionsByLearningProgress(props.activeSection.relatedQuestions)
    : { fresh: [], revisited: [] }
  const freshQuestions = groupedQuestions.fresh
  const revisitedQuestions = groupedQuestions.revisited

  return (
    <AnimatePresence initial={false}>
      {props.activeSection && (
        <>
          <motion.button
            aria-label="Close knowledge panel"
            className="knowledge-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={props.onClose}
          />

          <motion.aside
            className="knowledge-panel"
            initial={{ opacity: 0, x: 28, y: 10 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 32, y: 0 }}
            transition={{ duration: 0.22 }}
          >
            <div className="knowledge-panel-header">
              <div>
                <h2>{props.activeSection.heading}</h2>
                <p>题目、证据和可直接开口的回答都收在这里。</p>
              </div>

              <div className="knowledge-panel-actions">
                <div className="segmented-effort">
                  {(['low', 'high', 'xhigh'] as const).map((item) => (
                    <button
                      key={item}
                      className={item === props.answerEffort ? 'active' : ''}
                      onClick={() => props.onSelectAnswerEffort(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <button className="ghost-button icon-button" onClick={props.onClose}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="knowledge-panel-body">
              {freshQuestions.map((question, index) => {
                const detail = props.questionCache[question.id]
                const generated = detail?.generated?.output ?? question.generated
                const job = props.jobs[question.id]
                const isGenerating = props.generatingQuestionId === question.id

                return (
                  <article key={question.id} className="question-drill-card">
                    <div className="question-drill-top">
                      <span className="footnote-index">[{index + 1}]</span>
                      <div className="question-drill-title">
                        <QuestionTitle displayText={question.displayText} text={question.text} />
                        <div className="footnote-meta">
                          <span className="pill subtle">{question.questionType}</span>
                          <span className="pill subtle">{question.difficulty}</span>
                          <span className={`pill ${generated ? 'success' : ''}`}>
                            {generated ? '已生成' : '待生成'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {job && (
                      <div className={`job-banner ${job.status}`}>
                        <strong>任务状态：{job.status}</strong>
                        <span>{job.error ?? `${job.model} · ${job.reasoningEffort}`}</span>
                      </div>
                    )}

                    {generated ? (
                      <div className="question-answer-stack">
                        {generated.elevator_pitch && (
                          <div className="answer-card micro-answer">
                            <span>20 秒开场</span>
                            <p>{generated.elevator_pitch}</p>
                          </div>
                        )}

                        {(generated.work_evidence_status || generated.work_evidence_note) && (
                          <div className="answer-card micro-answer">
                            <span>项目依据</span>
                            <div className="grounding-meta-row">
                              {generated.work_evidence_status && (
                                <span className={`pill grounding-${generated.work_evidence_status}`}>
                                  {describeWorkEvidenceStatus(generated.work_evidence_status)}
                                </span>
                              )}
                              {generated.work_evidence_note && <p>{generated.work_evidence_note}</p>}
                            </div>
                          </div>
                        )}

                        {generated.work_story && (
                          <div className="answer-card micro-answer">
                            <span>项目切入</span>
                            <p>{generated.work_story}</p>
                          </div>
                        )}

                        {generated.full_answer_markdown && (
                          <div className="question-answer-markdown chat-answer">
                            <MarkdownRenderer>{generated.full_answer_markdown}</MarkdownRenderer>
                          </div>
                        )}

                        {generated.knowledge_map && generated.knowledge_map.length > 0 && (
                          <div className="answer-card answer-grid-card">
                            <span>知识骨架</span>
                            <div className="knowledge-map-grid">
                              {generated.knowledge_map.map((item) => (
                                <div key={`${question.id}-${item.concept}`} className="knowledge-map-chip">
                                  <strong>{item.concept}</strong>
                                  <small>{item.why_it_matters}</small>
                                  <span className={`pill confidence-${item.confidence}`}>{item.confidence}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {generated.missing_basics && generated.missing_basics.length > 0 && (
                          <div className="answer-card answer-list-card">
                            <span>需要顺手补的基础点</span>
                            <div className="answer-bullet-list">
                              {generated.missing_basics.map((item) => (
                                <div key={`${question.id}-${item}`} className="answer-bullet-item">{item}</div>
                              ))}
                            </div>
                          </div>
                        )}

                        {detail && (
                          <>
                            <div className="answer-card question-grounding">
                              <span>项目引用</span>
                              {detail.workMatches.length > 0 ? (
                                <div className="grounding-list">
                                  {detail.workMatches.slice(0, 3).map((item) => (
                                    <button key={item.id} className="grounding-chip grounding-chip-button" onClick={() => props.onOpenDocument(item.id, 'mywork')}>
                                      <strong>{item.title}</strong>
                                      <small>{item.path}</small>
                                    </button>
                                  ))}
                                </div>
                              ) : detail.workHintMatches.length > 0 ? (
                                <>
                                  <p className="muted-copy">没有直接项目证据，已回源检查相邻材料，只能作为贴边表达，不能当成同题直证。</p>
                                  <div className="grounding-list">
                                    {detail.workHintMatches.slice(0, 3).map((item) => (
                                      <button key={item.id} className="grounding-chip grounding-chip-button" onClick={() => props.onOpenDocument(item.id, 'mywork')}>
                                        <strong>{item.title}</strong>
                                        <small>{item.path}</small>
                                      </button>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <p className="muted-copy">当前 `mywork` 里没有足够强的直接项目证据，这道题会以主线知识为主，不硬贴经历。</p>
                              )}
                            </div>

                            {generated.follow_ups && generated.follow_ups.length > 0 && (
                              <div className="answer-card answer-list-card">
                                <span>下一轮高概率追问</span>
                                <FollowUpInterviewerList
                                  items={generated.follow_ups}
                                  onOpenInterviewerMode={props.onOpenInterviewerMode}
                                  questionId={question.id}
                                  questionTitle={question.displayText}
                                />
                              </div>
                            )}

                            {detail.generated?.citations && detail.generated.citations.length > 0 && (
                              <div className="answer-card answer-list-card">
                                <span>引用回溯</span>
                                <div className="citation-list">
                                  {detail.generated.citations.map((item, citationIndex) => (
                                    <div key={`${question.id}-cite-${citationIndex}`} className="citation-chip">
                                      <strong>{item.label}</strong>
                                      <small>{item.path}</small>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="question-answer-stack">
                        <p className="muted-copy">
                          这个题目还没有现成答案。你可以直接按当前章节为上下文现场生成，这样输出会自然引用当前知识点。
                        </p>
                        <button
                          className="primary-button"
                          disabled={isGenerating}
                          onClick={() => void props.onGenerate(question.id)}
                        >
                          <Sparkles size={16} />
                          {isGenerating ? '生成中…' : '生成个性化答案'}
                        </button>
                      </div>
                    )}
                  </article>
                )
              })}

              {revisitedQuestions.length > 0 && (
                <details className="revisited-group" open={false}>
                  <summary>前面已经出现过的题目 {revisitedQuestions.length} 条</summary>
                  <div className="revisited-group-body">
                    {revisitedQuestions.map((question) => {
                      const detail = props.questionCache[question.id]
                      const generated = detail?.generated?.output ?? question.generated
                      const job = props.jobs[question.id]
                      const isGenerating = props.generatingQuestionId === question.id

                      return (
                        <article key={question.id} className="question-drill-card revisited-card">
                          <div className="question-drill-top">
                            <span className="footnote-index">↺</span>
                            <div className="question-drill-title">
                              <QuestionTitle displayText={question.displayText} text={question.text} />
                              <div className="footnote-meta">
                                <span className="pill subtle">{question.questionType}</span>
                                <span className="pill subtle">{question.difficulty}</span>
                                <span className={`pill ${generated ? 'success' : ''}`}>
                                  {generated ? '已生成' : '待生成'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {job && (
                            <div className={`job-banner ${job.status}`}>
                              <strong>任务状态：{job.status}</strong>
                              <span>{job.error ?? `${job.model} · ${job.reasoningEffort}`}</span>
                            </div>
                          )}

                          {generated ? (
                            <div className="question-answer-stack">
                              {(generated.work_evidence_status || generated.work_evidence_note) && (
                                <div className="answer-card micro-answer">
                                  <span>项目依据</span>
                                  <div className="grounding-meta-row">
                                    {generated.work_evidence_status && (
                                      <span className={`pill grounding-${generated.work_evidence_status}`}>
                                        {describeWorkEvidenceStatus(generated.work_evidence_status)}
                                      </span>
                                    )}
                                    {generated.work_evidence_note && <p>{generated.work_evidence_note}</p>}
                                  </div>
                                </div>
                              )}

                              {generated.elevator_pitch && (
                                <div className="answer-card micro-answer">
                                  <span>20 秒开场</span>
                                  <p>{generated.elevator_pitch}</p>
                                </div>
                              )}

                              {generated.work_story && (
                                <div className="answer-card micro-answer">
                                  <span>项目切入</span>
                                  <p>{generated.work_story}</p>
                                </div>
                              )}

                              {generated.full_answer_markdown && (
                                <div className="question-answer-markdown chat-answer">
                                  <MarkdownRenderer>{generated.full_answer_markdown}</MarkdownRenderer>
                                </div>
                              )}

                              {generated.knowledge_map && generated.knowledge_map.length > 0 && (
                                <div className="answer-card answer-grid-card">
                                  <span>知识骨架</span>
                                  <div className="knowledge-map-grid">
                                    {generated.knowledge_map.map((item) => (
                                      <div key={`${question.id}-${item.concept}`} className="knowledge-map-chip">
                                        <strong>{item.concept}</strong>
                                        <small>{item.why_it_matters}</small>
                                        <span className={`pill confidence-${item.confidence}`}>{item.confidence}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {generated.missing_basics && generated.missing_basics.length > 0 && (
                                <div className="answer-card answer-list-card">
                                  <span>需要顺手补的基础点</span>
                                  <div className="answer-bullet-list">
                                    {generated.missing_basics.map((item) => (
                                      <div key={`${question.id}-${item}`} className="answer-bullet-item">{item}</div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {detail && (
                                <>
                                  <div className="answer-card question-grounding">
                                    <span>项目引用</span>
                                    {detail.workMatches.length > 0 ? (
                                      <div className="grounding-list">
                                        {detail.workMatches.slice(0, 3).map((item) => (
                                          <button key={item.id} className="grounding-chip grounding-chip-button" onClick={() => props.onOpenDocument(item.id, 'mywork')}>
                                            <strong>{item.title}</strong>
                                            <small>{item.path}</small>
                                          </button>
                                        ))}
                                      </div>
                                    ) : detail.workHintMatches.length > 0 ? (
                                      <>
                                        <p className="muted-copy">没有直接项目证据，已回源检查相邻材料，只能作为贴边表达，不能当成同题直证。</p>
                                        <div className="grounding-list">
                                          {detail.workHintMatches.slice(0, 3).map((item) => (
                                            <button key={item.id} className="grounding-chip grounding-chip-button" onClick={() => props.onOpenDocument(item.id, 'mywork')}>
                                              <strong>{item.title}</strong>
                                              <small>{item.path}</small>
                                            </button>
                                          ))}
                                        </div>
                                      </>
                                    ) : (
                                      <p className="muted-copy">当前 `mywork` 里没有足够强的直接项目证据，这道题会以主线知识为主，不硬贴经历。</p>
                                    )}
                                  </div>

                                  {generated.follow_ups && generated.follow_ups.length > 0 && (
                                    <div className="answer-card answer-list-card">
                                      <span>下一轮高概率追问</span>
                                      <FollowUpInterviewerList
                                        items={generated.follow_ups}
                                        onOpenInterviewerMode={props.onOpenInterviewerMode}
                                        questionId={question.id}
                                        questionTitle={question.displayText}
                                      />
                                    </div>
                                  )}

                                  {detail.generated?.citations && detail.generated.citations.length > 0 && (
                                    <div className="answer-card answer-list-card">
                                      <span>引用回溯</span>
                                      <div className="citation-list">
                                        {detail.generated.citations.map((item, citationIndex) => (
                                          <div key={`${question.id}-cite-${citationIndex}`} className="citation-chip">
                                            <strong>{item.label}</strong>
                                            <small>{item.path}</small>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ) : (
                            <div className="question-answer-stack">
                              <button
                                className="primary-button"
                                disabled={isGenerating}
                                onClick={() => void props.onGenerate(question.id)}
                              >
                                <Sparkles size={16} />
                                {isGenerating ? '生成中…' : '生成个性化答案'}
                              </button>
                            </div>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </details>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function InterviewQuestionStage(props: {
  answerEffort: 'low' | 'high' | 'xhigh'
  onGenerate: (questionId: string) => Promise<void> | void
  onOpenGuideFallback: (match: QuestionDetail['guideFallbackMatches'][number]) => void
  onOpenGuideMatch: (match: QuestionDetail['guideMatches'][number]) => void
  onOpenInterviewerMode: (questionId: string, followUp: string, questionTitle?: string | null) => void
  onOpenWorkMatch: (match: QuestionDetail['workMatches'][number] | QuestionDetail['workHintMatches'][number]) => void
  onSelectAnswerEffort: (effort: 'low' | 'high' | 'xhigh') => void
  paneId: string
  question: QuestionDetail
  sectionRefs: MutableRefObject<Map<string, HTMLElement>>
}) {
  const generated = props.question.generated?.output ?? null
  const company = readQuestionMetaString(props.question.metadata, 'company')
  const role = readQuestionMetaString(props.question.metadata, 'role')
  const interviewDate = readQuestionMetaString(props.question.metadata, 'interviewDate')
  const categoryLabel = readQuestionMetaString(props.question.metadata, 'primaryCategoryLabel') ?? '面经题'
  const stageSections = buildInterviewStageSections(props.question)
  const totalGuideAppearances = props.question.guideMatches.length + props.question.guideFallbackMatches.length

  const renderStageSection = (section: InterviewStageSectionSpec) => {
    if (section.kind === 'source') {
      return (
        <>
          <div className="doc-chapter-header">
            <div>
              <span className="chapter-level">{section.kicker}</span>
              <h3>{section.heading}</h3>
            </div>
          </div>

          <div className="interview-source-grid">
            <div className="answer-card micro-answer">
              <span>来源</span>
              <p>{props.question.sourceTitle}</p>
              <p className="muted-copy">{props.question.sourcePath}</p>
            </div>

            <div className="answer-card micro-answer">
              <span>主线出现</span>
              <div className="question-appearance-card">
                <GuidePresenceBadge
                  exactCount={props.question.guideMatches.length}
                  fallbackCount={props.question.guideFallbackMatches.length}
                />
                <div className="question-appearance-stats">
                  <div className="appearance-stat-chip">
                    <strong>{totalGuideAppearances}</strong>
                    <small>总出现次数</small>
                  </div>
                  <div className="appearance-stat-chip">
                    <strong>{props.question.guideMatches.length}</strong>
                    <small>精确锚点</small>
                  </div>
                  <div className="appearance-stat-chip">
                    <strong>{props.question.guideFallbackMatches.length}</strong>
                    <small>章节兜底</small>
                  </div>
                </div>
                <p>
                  {props.question.guideMatches.length > 0
                    ? `这道题已经在主线里出现 ${totalGuideAppearances} 次，其中精确命中 ${props.question.guideMatches.length} 次，可以直接沿反引回到对应知识点。`
                    : props.question.guideFallbackMatches.length > 0
                      ? `这道题暂时只在章末补充里出现 ${props.question.guideFallbackMatches.length} 次，说明它和章节主题相关，但还没有卡到具体段落。`
                      : '主线里还没有出现这道题，需要靠当前题库和动态答案补齐。'}
                </p>
              </div>
            </div>

            <div className="answer-card micro-answer">
              <span>项目依据</span>
              {props.question.workMatches.length > 0 ? (
                <p>已经命中直接相关的 `mywork` 证据，可以直接往自己的项目表达上靠。</p>
              ) : props.question.workHintMatches.length > 0 ? (
                <p>暂时只有相邻项目材料，适合做贴边表达，不建议硬说成直接经验。</p>
              ) : (
                <p>当前没有强直接项目证据，这题更适合从主线知识和工程理解作答。</p>
              )}
            </div>
          </div>

          {props.question.guideMatches.length > 0 && (
            <div className="answer-card answer-list-card">
              <span>反引到主线</span>
              <div className="citation-list">
                {props.question.guideMatches.slice(0, 4).map((match) => (
                  <button key={match.id} className="citation-chip actionable" onClick={() => props.onOpenGuideMatch(match)}>
                    <strong>{match.documentTitle}</strong>
                    <small>{match.heading}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {props.question.guideFallbackMatches.length > 0 && (
            <div className="answer-card answer-list-card">
              <span>章末补充入口</span>
              <div className="citation-list">
                {props.question.guideFallbackMatches.slice(0, 4).map((match) => (
                  <button key={`${match.documentId}-${match.relPath}`} className="citation-chip actionable fallback" onClick={() => props.onOpenGuideFallback(match)}>
                    <strong>{match.documentTitle}</strong>
                    <small>{match.path}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(props.question.workMatches.length > 0 || props.question.workHintMatches.length > 0) && (
            <div className="answer-card answer-list-card">
              <span>相关工作材料</span>
              <div className="citation-list">
                {(props.question.workMatches.length > 0 ? props.question.workMatches : props.question.workHintMatches)
                  .slice(0, 4)
                  .map((item) => (
                    <button key={item.id} className="citation-chip actionable" onClick={() => props.onOpenWorkMatch(item)}>
                      <strong>{item.title}</strong>
                      <small>{item.path}</small>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </>
      )
    }

    if (section.kind === 'elevator_pitch' && generated?.elevator_pitch) {
      return (
        <>
          <div className="footnote-heading">
            <span>{section.kicker}</span>
            <strong>{section.heading}</strong>
          </div>
          <div className="answer-card micro-answer">
            <p>{generated.elevator_pitch}</p>
          </div>
        </>
      )
    }

    if (section.kind === 'project_bridge' && (generated?.work_evidence_status || generated?.work_evidence_note || generated?.work_story)) {
      return (
        <>
          <div className="footnote-heading">
            <span>{section.kicker}</span>
            <strong>{section.heading}</strong>
          </div>

          {(generated.work_evidence_status || generated.work_evidence_note) && (
            <div className="answer-card micro-answer">
              <span>项目依据</span>
              <div className="grounding-meta-row">
                {generated.work_evidence_status && (
                  <span className={`pill grounding-${generated.work_evidence_status}`}>
                    {describeWorkEvidenceStatus(generated.work_evidence_status)}
                  </span>
                )}
                {generated.work_evidence_note && <p>{generated.work_evidence_note}</p>}
              </div>
            </div>
          )}

          {generated.work_story && (
            <div className="answer-card micro-answer">
              <span>项目切入</span>
              <p>{generated.work_story}</p>
            </div>
          )}
        </>
      )
    }

    if (section.kind === 'full_answer' && generated?.full_answer_markdown) {
      return (
        <>
          <div className="footnote-heading">
            <span>{section.kicker}</span>
            <strong>{section.heading}</strong>
          </div>
          <div className="question-answer-markdown chat-answer">
            <MarkdownRenderer>{generated.full_answer_markdown}</MarkdownRenderer>
          </div>
        </>
      )
    }

    if (section.kind === 'knowledge_map' && generated?.knowledge_map && generated.knowledge_map.length > 0) {
      return (
        <>
          <div className="footnote-heading">
            <span>{section.kicker}</span>
            <strong>{section.heading}</strong>
          </div>
          <div className="knowledge-map-grid">
            {generated.knowledge_map.map((item) => (
              <div key={`${props.question.id}-${item.concept}`} className="knowledge-map-chip">
                <strong>{item.concept}</strong>
                <small>{item.why_it_matters}</small>
                <span className={`pill confidence-${item.confidence}`}>{item.confidence}</span>
              </div>
            ))}
          </div>
        </>
      )
    }

    if (section.kind === 'follow_ups' && generated?.follow_ups && generated.follow_ups.length > 0) {
      return (
        <>
          <div className="footnote-heading">
            <span>{section.kicker}</span>
            <strong>{section.heading}</strong>
          </div>
          <FollowUpInterviewerList
            items={generated.follow_ups}
            onOpenInterviewerMode={props.onOpenInterviewerMode}
            questionId={props.question.id}
            questionTitle={props.question.displayText}
          />
        </>
      )
    }

    if (section.kind === 'missing_basics' && generated?.missing_basics && generated.missing_basics.length > 0) {
      return (
        <>
          <div className="footnote-heading">
            <span>{section.kicker}</span>
            <strong>{section.heading}</strong>
          </div>
          <div className="answer-bullet-list">
            {generated.missing_basics.map((item) => (
              <div key={`${props.question.id}-basic-${item}`} className="answer-bullet-item">{item}</div>
            ))}
          </div>
        </>
      )
    }

    if (section.kind === 'citations' && props.question.generated?.citations && props.question.generated.citations.length > 0) {
      return (
        <>
          <div className="footnote-heading">
            <span>{section.kicker}</span>
            <strong>{section.heading}</strong>
          </div>
          <div className="citation-list">
            {props.question.generated.citations.map((item, index) => (
              <div key={`${props.question.id}-citation-${index}`} className="citation-chip">
                <strong>{item.label}</strong>
                <small>{item.path}</small>
              </div>
            ))}
          </div>
        </>
      )
    }

    return (
      <>
        <div className="footnote-heading">
          <span>{section.kicker}</span>
          <strong>{section.heading}</strong>
        </div>
        <div className="answer-card micro-answer">
          <p>这道题还没有现成答案。当前会优先引用主线知识命中，再尝试从 `mywork` 里找最贴近的项目证据来生成你的回答版本。</p>
        </div>
      </>
    )
  }

  return (
    <article className="doc-paper interview-stage-paper">
      <div className="doc-paper-header interview-stage-header">
        <div className="interview-stage-heading">
          <div className="doc-header-stats">
            <span className="sub-chip accent">{categoryLabel}</span>
            <span className="sub-chip">{props.question.questionType}</span>
            <span className="sub-chip">{props.question.difficulty}</span>
            <span className={`sub-chip ${generated ? 'accent' : ''}`}>
              {generated ? '已生成个性化答案' : '待生成'}
            </span>
          </div>
          <div className="interview-stage-question-title">
            <QuestionTitle displayText={props.question.displayText} text={props.question.text} />
          </div>
          <p className="doc-reference">
            {[company, role, interviewDate].filter(Boolean).join(' · ') || props.question.sourcePath}
          </p>
        </div>

        <div className="interview-stage-actions">
          <div className="segmented-effort">
            {(['low', 'high', 'xhigh'] as const).map((item) => (
              <button
                key={item}
                className={item === props.answerEffort ? 'active' : ''}
                onClick={() => props.onSelectAnswerEffort(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <button className="primary-button" onClick={() => void props.onGenerate(props.question.id)}>
            <Sparkles size={16} />
            {generated ? '重新生成答案' : '生成个性化答案'}
          </button>
        </div>
      </div>

      <div className="doc-article-flow interview-stage-flow">
        {stageSections.map((section) => (
          <section
            key={`${props.paneId}-${section.anchor}`}
            ref={(node) => {
              const key = buildSectionRefKey(props.paneId, section.anchor)
              if (node) {
                props.sectionRefs.current.set(key, node)
              } else {
                props.sectionRefs.current.delete(key)
              }
            }}
            className={`doc-chapter ${section.kind === 'source' ? 'has-knowledge' : ''}`}
          >
            {renderStageSection(section)}
          </section>
        ))}
      </div>
    </article>
  )
}

function describeRetrievalMode(retrievalMode: string) {
  if (retrievalMode === 'hybrid_hierarchical_semantic') {
    return '分层混合检索（chunk + parent + embedding）'
  }
  if (retrievalMode === 'lexical_hierarchical_fallback') {
    return '分层词法回退（embedding 初始化失败）'
  }
  return '词法检索'
}

function describeWorkEvidenceStatus(status: 'adjacent' | 'direct' | 'none') {
  if (status === 'direct') {
    return '直接命中'
  }
  if (status === 'adjacent') {
    return '相邻回源'
  }
  return '无项目证据'
}

function partitionQuestionsByLearningProgress(questions: RelatedQuestion[]) {
  const fresh = questions
    .filter((question) => !question.isRevisited)
    .sort((left, right) => right.score - left.score)
  const revisited = questions
    .filter((question) => question.isRevisited)
    .sort((left, right) => right.score - left.score)

  return { fresh, revisited }
}

function buildInterviewCategoryGroups(questions: QuestionListItem[]): InterviewCategoryGroup[] {
  const groups = new Map<string, InterviewCategoryGroup>()

  for (const question of questions) {
    const existing = groups.get(question.categoryId) ?? {
      categoryId: question.categoryId,
      categoryLabel: question.categoryLabel,
      categoryOrder: question.categoryOrder,
      questions: []
    }
    existing.questions.push(question)
    groups.set(question.categoryId, existing)
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      questions: [...group.questions].sort((left, right) => (
        scoreQuestionGuidePresence(right) - scoreQuestionGuidePresence(left)
        || right.guideLinkCount - left.guideLinkCount
        || right.guideFallbackCount - left.guideFallbackCount
        || Number(right.generatedStatus === 'ready') - Number(left.generatedStatus === 'ready')
        || left.displayText.localeCompare(right.displayText, 'zh-Hans-CN')
      ))
    }))
    .sort((left, right) => left.categoryOrder - right.categoryOrder || left.categoryLabel.localeCompare(right.categoryLabel, 'zh-Hans-CN'))
}

function scoreQuestionGuidePresence(question: Pick<QuestionListItem, 'guideFallbackCount' | 'guideLinkCount'>) {
  if (question.guideLinkCount > 0) {
    return 2
  }
  if (question.guideFallbackCount > 0) {
    return 1
  }
  return 0
}

function buildQuestionPresenceSummary(question: Pick<QuestionListItem, 'guideFallbackCount' | 'guideLinkCount'>) {
  if (question.guideLinkCount > 0 && question.guideFallbackCount > 0) {
    return `主线 ${question.guideLinkCount} · 章末 ${question.guideFallbackCount}`
  }
  if (question.guideLinkCount > 0) {
    return `主线 ${question.guideLinkCount}`
  }
  if (question.guideFallbackCount > 0) {
    return `章末 ${question.guideFallbackCount}`
  }
  return '主线未出现'
}

function buildInterviewStageSections(question: QuestionDetail): InterviewStageSectionSpec[] {
  const generated = question.generated?.output ?? null
  const appearanceCount = question.guideMatches.length + question.guideFallbackMatches.length
  const sections: InterviewStageSectionSpec[] = [
    {
      anchor: 'source',
      badge: appearanceCount > 0 ? appearanceCount : null,
      heading: '来源与匹配',
      kind: 'source',
      kicker: 'SOURCE'
    }
  ]

  if (!generated) {
    sections.push({
      anchor: 'generate',
      heading: '现场生成答案',
      kind: 'generate',
      kicker: 'READY'
    })
    return sections
  }

  if (generated.elevator_pitch) {
    sections.push({
      anchor: 'elevator-pitch',
      heading: '20 秒开场',
      kind: 'elevator_pitch',
      kicker: 'OPEN'
    })
  }

  if (generated.work_evidence_status || generated.work_evidence_note || generated.work_story) {
    sections.push({
      anchor: 'project-bridge',
      heading: '结合我的工作',
      kind: 'project_bridge',
      kicker: 'WORK'
    })
  }

  if (generated.full_answer_markdown) {
    sections.push({
      anchor: 'full-answer',
      heading: '完整答案',
      kind: 'full_answer',
      kicker: 'ANSWER'
    })
  }

  if (generated.knowledge_map && generated.knowledge_map.length > 0) {
    sections.push({
      anchor: 'knowledge-map',
      badge: generated.knowledge_map.length,
      heading: '知识骨架',
      kind: 'knowledge_map',
      kicker: 'MAP'
    })
  }

  if (generated.follow_ups && generated.follow_ups.length > 0) {
    sections.push({
      anchor: 'follow-ups',
      badge: generated.follow_ups.length,
      heading: '追问清单',
      kind: 'follow_ups',
      kicker: 'NEXT'
    })
  }

  if (generated.missing_basics && generated.missing_basics.length > 0) {
    sections.push({
      anchor: 'missing-basics',
      badge: generated.missing_basics.length,
      heading: '补基础',
      kind: 'missing_basics',
      kicker: 'BASE'
    })
  }

  if (question.generated?.citations && question.generated.citations.length > 0) {
    sections.push({
      anchor: 'citations',
      badge: question.generated.citations.length,
      heading: '引用回溯',
      kind: 'citations',
      kicker: 'CITE'
    })
  }

  return sections
}

function readQuestionMetaString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function sortGuideDocuments(documents: DocumentListItem[]) {
  return [...documents].sort((left, right) => (
    compareGuideDocumentOrder(left, right)
      || left.title.localeCompare(right.title, 'zh-Hans-CN')
  ))
}

function compareGuideDocumentOrder(left: DocumentListItem, right: DocumentListItem) {
  const sourceCompare = left.sourceId.localeCompare(right.sourceId, 'en')
  if (sourceCompare !== 0) {
    return sourceCompare
  }
  return buildGuideOrderKey(left.relPath).localeCompare(buildGuideOrderKey(right.relPath), 'en')
}

function buildGuideOrderKey(relPath: string) {
  if (relPath === 'README.md') {
    return '00-README'
  }

  const segments = relPath.split('/')
  const topLevel = segments[0] ?? ''
  const leaf = segments.at(-1) ?? ''
  const topMatch = /^(\d+)-/.exec(topLevel)
  const leafMatch = /^(\d+)-/.exec(leaf)
  const topOrder = topMatch?.[1]?.padStart(2, '0') ?? '99'
  const leafOrder = leafMatch?.[1]?.padStart(2, '0') ?? (leaf === 'README.md' ? '00' : '99')
  return `${topOrder}-${topLevel}-${leafOrder}-${relPath.toLowerCase()}`
}

function buildGuideGroups(documents: DocumentListItem[]) {
  const groups = new Map<string, { documents: DocumentListItem[]; key: string; label: string; order: string }>()

  for (const document of documents) {
    const info = getGuideGroupInfo(document.relPath)
    const group = groups.get(info.key) ?? {
      key: info.key,
      label: info.label,
      order: info.order,
      documents: []
    }
    group.documents.push(document)
    groups.set(info.key, group)
  }

  return [...groups.values()].sort((left, right) => left.order.localeCompare(right.order, 'en'))
}

function getGuideGroupInfo(relPath: string) {
  if (relPath === 'README.md') {
    return { key: '00-overview', label: '总览', order: '00' }
  }

  const topLevel = relPath.split('/')[0] ?? relPath
  const match = /^(\d+)-(.+)$/.exec(topLevel)
  if (!match) {
    return { key: topLevel, label: topLevel, order: '99' }
  }

  const [, rawOrder, rawLabel] = match
  const order = rawOrder.padStart(2, '0')
  const labelMap: Record<string, string> = {
    Coding: '手撕代码',
    FineTuning: '微调与对齐',
    Foundation: '基础',
    HotTopics: '前沿热点',
    Inference: '推理与部署',
    RAG: 'RAG',
    RealQuestions: '真实面经',
    'Safety-Evaluation': '安全与评估',
    SystemDesign: '系统设计'
  }

  return {
    key: `${order}-${rawLabel}`,
    label: labelMap[rawLabel] ?? rawLabel.replaceAll('-', ' '),
    order
  }
}

function formatGuideLeafLabel(relPath: string) {
  if (relPath === 'README.md') {
    return 'README.md'
  }

  const fileName = relPath.split('/').at(-1) ?? relPath
  return fileName.replace(/\.mdx?$/i, '')
}

function buildSectionRefKey(documentId: string, anchor: string) {
  return `${documentId}::${anchor}`
}

function buildQuestionTitleParts(displayText: string | null | undefined, fallbackText: string) {
  const translated = displayText?.trim() || ''
  const original = fallbackText.trim()

  if (translated && translated !== original) {
    return {
      primary: translated,
      secondary: original
    }
  }

  if (translated) {
    const split = splitBilingualQuestionLine(translated)
    if (split) {
      return split
    }
    return {
      primary: translated,
      secondary: null
    }
  }

  return {
    primary: original,
    secondary: null
  }
}

function splitBilingualQuestionLine(input: string) {
  const normalized = input.replace(/\s+/g, ' ').trim()
  const byPunctuation = normalized.match(/^(.+?[。！？?!.])\s+([A-Za-z][\s\S]+)$/)
  if (byPunctuation) {
    return {
      primary: byPunctuation[1].trim(),
      secondary: byPunctuation[2].trim()
    }
  }

  const byEnglishLead = normalized.match(
    /^(.+?)(Why |What |How |When |Where |Which |Can |Could |Should |Would |Do |Does |Is |Are |Explain |Describe )([\s\S]+)$/
  )
  if (byEnglishLead && /[\u4e00-\u9fff]/.test(byEnglishLead[1])) {
    return {
      primary: byEnglishLead[1].trim(),
      secondary: `${byEnglishLead[2]}${byEnglishLead[3]}`.trim()
    }
  }

  return null
}

function readBrowserNavFromUrl(documents: DocumentListItem[], questions: QuestionListItem[]) {
  if (typeof window === 'undefined') {
    return null
  }

  const url = new URL(window.location.href)
  const sidebarTab = url.searchParams.get('tab')
  const documentId = url.searchParams.get('doc')
  const questionId = url.searchParams.get('q')

  const normalizedTab: SidebarTab = sidebarTab === 'interviews'
    ? 'interviews'
    : sidebarTab === 'mywork'
      ? 'mywork'
      : 'documents'

  return {
    documentId: documentId && documents.some((item) => item.id === documentId) ? documentId : null,
    questionId: questionId && questions.some((item) => item.id === questionId) ? questionId : null,
    sidebarTab: normalizedTab
  }
}

function readWorkspaceUiState(): WorkspaceUiState {
  if (typeof window === 'undefined') {
    return DEFAULT_UI_STATE
  }

  try {
    const raw = window.localStorage.getItem(UI_STATE_STORAGE_KEY)
    if (!raw) {
      return DEFAULT_UI_STATE
    }
    const parsed = JSON.parse(raw) as Partial<WorkspaceUiState>
    return {
      currentDocumentId: typeof parsed.currentDocumentId === 'string' ? parsed.currentDocumentId : DEFAULT_UI_STATE.currentDocumentId,
      currentInterviewQuestionId: typeof parsed.currentInterviewQuestionId === 'string'
        ? parsed.currentInterviewQuestionId
        : DEFAULT_UI_STATE.currentInterviewQuestionId,
      sidebarOpen: typeof parsed.sidebarOpen === 'boolean' ? parsed.sidebarOpen : DEFAULT_UI_STATE.sidebarOpen,
      sidebarWidth: clampSidebarWidth(typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : DEFAULT_UI_STATE.sidebarWidth),
      sidebarTab: parsed.sidebarTab === 'mywork'
        ? 'mywork'
        : parsed.sidebarTab === 'interviews'
          ? 'interviews'
          : 'documents',
      themeId: isWorkspaceThemeId(parsed.themeId) ? parsed.themeId : DEFAULT_UI_STATE.themeId,
      typography: {
        answerFontSize: clampNumber(parsed.typography?.answerFontSize, 13, 20, DEFAULT_UI_STATE.typography.answerFontSize),
        docFontSize: clampNumber(parsed.typography?.docFontSize, 16, 24, DEFAULT_UI_STATE.typography.docFontSize),
        docHeadingScale: clampNumber(parsed.typography?.docHeadingScale, 0.92, 1.35, DEFAULT_UI_STATE.typography.docHeadingScale),
        sidebarFontSize: clampNumber(parsed.typography?.sidebarFontSize, 12, 17, DEFAULT_UI_STATE.typography.sidebarFontSize)
      }
    }
  } catch {
    return DEFAULT_UI_STATE
  }
}

function writeWorkspaceUiState(state: WorkspaceUiState) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(state))
}

function readDocumentScrollState() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(DOC_SCROLL_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        next[key] = value
      }
    }
    return next
  } catch {
    return {}
  }
}

function writeDocumentScrollState(state: Record<string, number>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(DOC_SCROLL_STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

function readInterviewScrollState() {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.localStorage.getItem(INTERVIEW_SCROLL_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: Record<string, number> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        next[key] = value
      }
    }
    return next
  } catch {
    return {}
  }
}

function writeInterviewScrollState(state: Record<string, number>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(INTERVIEW_SCROLL_STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

function readWorkspaceViewState(): WorkspaceViewState {
  if (typeof window === 'undefined') {
    return {
      guideDocumentId: null,
      interviewQuestionId: null,
      workDocumentId: null
    }
  }

  try {
    const raw = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY)
    if (!raw) {
      return {
        guideDocumentId: null,
        interviewQuestionId: null,
        workDocumentId: null
      }
    }
    const parsed = JSON.parse(raw) as Partial<WorkspaceViewState>
    return {
      guideDocumentId: typeof parsed.guideDocumentId === 'string' ? parsed.guideDocumentId : null,
      interviewQuestionId: typeof parsed.interviewQuestionId === 'string' ? parsed.interviewQuestionId : null,
      workDocumentId: typeof parsed.workDocumentId === 'string' ? parsed.workDocumentId : null
    }
  } catch {
    return {
      guideDocumentId: null,
      interviewQuestionId: null,
      workDocumentId: null
    }
  }
}

function writeWorkspaceViewState(state: WorkspaceViewState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

function getDocumentScrollBaseTop(documentId: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null
  }

  const selector = `[data-document-id="${documentId}"]`
  const node = document.querySelector(selector)
  if (!(node instanceof HTMLElement)) {
    return null
  }

  return Math.max(0, Math.round(node.getBoundingClientRect().top + window.scrollY - DOCUMENT_SCROLL_VIEWPORT_OFFSET))
}

function buildWorkspaceCssVars(workspaceUi: WorkspaceUiState) {
  const theme = WORKSPACE_THEMES.find((item) => item.id === workspaceUi.themeId) ?? WORKSPACE_THEMES[0]
  return {
    '--answer-font-size': `${workspaceUi.typography.answerFontSize}px`,
    '--doc-font-size': `${workspaceUi.typography.docFontSize}px`,
    '--doc-heading-scale': workspaceUi.typography.docHeadingScale,
    '--sidebar-font-size': `${workspaceUi.typography.sidebarFontSize}px`,
    '--sidebar-width': `${clampSidebarWidth(workspaceUi.sidebarWidth)}px`,
    ...theme.vars
  } as CSSProperties
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  return Math.min(Math.max(value, min), max)
}

function clampSidebarWidth(value: number) {
  return clampNumber(value, 264, 420, DEFAULT_UI_STATE.sidebarWidth)
}

function isWorkspaceThemeId(value: unknown): value is WorkspaceThemeId {
  return typeof value === 'string' && WORKSPACE_THEMES.some((item) => item.id === value)
}

function orderedGuideCandidates(documents: DocumentListItem[]) {
  return sortGuideDocuments(documents.filter((item) => item.kind === 'guide'))
}

function pickRememberedDocumentId(
  candidates: DocumentListItem[],
  preferredId: string | null,
  currentId: string | null,
  rememberedId: string | null
) {
  const availableIds = new Set(candidates.map((item) => item.id))
  if (preferredId && availableIds.has(preferredId)) {
    return preferredId
  }
  if (currentId && availableIds.has(currentId)) {
    return currentId
  }
  if (rememberedId && availableIds.has(rememberedId)) {
    return rememberedId
  }
  return candidates[0]?.id ?? null
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => (
    typeof window === 'undefined' ? false : window.matchMedia(query).matches
  ))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const media = window.matchMedia(query)
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    setMatches(media.matches)
    media.addEventListener('change', listener)
    return () => {
      media.removeEventListener('change', listener)
    }
  }, [query])

  return matches
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => (
    typeof window === 'undefined' ? 1440 : window.innerWidth
  ))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const listener = () => {
      setWidth(window.innerWidth)
    }

    listener()
    window.addEventListener('resize', listener)
    return () => {
      window.removeEventListener('resize', listener)
    }
  }, [])

  return width
}

export default App
