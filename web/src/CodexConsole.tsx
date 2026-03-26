import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {
  LoaderCircle,
  AtSign,
  FolderSearch,
  LocateFixed,
  Maximize2,
  Minimize2,
  RotateCcw,
  SendHorizontal,
  Square,
  X
} from 'lucide-react'

import {
  cancelCodexConsoleJob,
  fetchCodexConsoleJob,
  startCodexConsoleJob
} from './api'
import { normalizeMarkdownForRender } from './markdown'
import type {
  CodexConsoleJob,
  CodexConsoleReply,
  DocumentData,
  DocumentListItem,
  WorkProject
} from './types'

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

type FloatFrame = {
  height: number
  width: number
  x: number
  y: number
}

type ResizeDirection = 'e' | 'n' | 'ne' | 'nw' | 's' | 'se' | 'sw' | 'w'

type ConsoleMessage =
  | {
      content: string
      createdAt: string
      id: string
      role: 'user'
    }
  | {
      createdAt: string
      error?: string
      id: string
      jobId?: string
      reply?: CodexConsoleReply
      role: 'assistant'
      state: 'cancelled' | 'failed' | 'ready' | 'running'
    }

type Props = {
  autoReferenceCurrentDoc: boolean
  currentDocument: DocumentData | null
  defaultDockLeft?: number
  defaultDockTop?: number
  documents: DocumentListItem[]
  model: string
  models: string[]
  onAutoReferenceCurrentDocChange: (value: boolean) => void
  onDockingStateChange?: (value: boolean) => void
  onModelChange: (value: string) => void
  onReasoningEffortChange: (value: ReasoningEffort) => void
  onSelectedProjectIdsChange: (value: string[]) => void
  onSelectedReferenceIdsChange: (value: string[]) => void
  reasoningEffort: ReasoningEffort
  reasoningEfforts: ReasoningEffort[]
  selectedProjectIds: string[]
  selectedReferenceIds: string[]
  workProjects: WorkProject[]
}

export function FloatingCodexWindow(props: Props) {
  const isMobile = useMediaQuery('(max-width: 980px)')
  const [isOpen, setIsOpen] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isDefaultDocked, setIsDefaultDocked] = useState(true)
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [referenceQuery, setReferenceQuery] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ConsoleMessage[]>([])
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const [frame, setFrame] = useState<FloatFrame>(() => buildDefaultFloatFrame({
    defaultDockLeft: props.defaultDockLeft,
    defaultDockTop: props.defaultDockTop,
    isCollapsed: false,
    isMobile: typeof window === 'undefined' ? false : window.matchMedia('(max-width: 980px)').matches
  }))
  const dragState = useRef<null | { offsetX: number; offsetY: number }>(null)
  const resizeState = useRef<null | {
    direction: ResizeDirection
    frame: FloatFrame
    startX: number
    startY: number
  }>(null)
  const currentJobRef = useRef<null | { jobId: string; messageId: string }>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const deferredReferenceQuery = useDeferredValue(referenceQuery.trim().toLowerCase())
  const defaultFrame = useMemo(() => buildDefaultFloatFrame({
    defaultDockLeft: props.defaultDockLeft,
    defaultDockTop: props.defaultDockTop,
    isCollapsed,
    isMobile
  }), [isCollapsed, isMobile, props.defaultDockLeft, props.defaultDockTop])

  const selectedReferenceDocs = useMemo(() => {
    const byId = new Map(props.documents.map((item) => [item.id, item]))
    return props.selectedReferenceIds
      .map((id) => byId.get(id))
      .filter((item): item is DocumentListItem => Boolean(item))
  }, [props.documents, props.selectedReferenceIds])

  const expandedSelectedDocumentIds = props.selectedReferenceIds

  const fileOptions = useMemo(() => {
    return props.documents
      .filter((item) => item.kind === 'guide' || item.kind === 'work')
      .filter((item) => item.id !== props.currentDocument?.id)
      .filter((item) => {
        if (!deferredReferenceQuery) {
          return true
        }
        const haystack = `${item.title}\n${item.relPath}\n${item.path}`.toLowerCase()
        return haystack.includes(deferredReferenceQuery)
      })
      .sort((left, right) => (
        Number(props.selectedReferenceIds.includes(right.id)) - Number(props.selectedReferenceIds.includes(left.id))
        || Number(right.kind === 'work') - Number(left.kind === 'work')
        || left.title.localeCompare(right.title, 'zh-Hans-CN')
      ))
      .slice(0, deferredReferenceQuery ? 14 : 8)
  }, [deferredReferenceQuery, props.currentDocument?.id, props.documents, props.selectedReferenceIds])

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end'
    })
  }, [messages])

  useEffect(() => {
    if (!isPickerOpen) {
      setReferenceQuery('')
    }
  }, [isPickerOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (isPickerOpen) {
        setIsPickerOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isPickerOpen])

  useEffect(() => {
    const handleResize = () => {
      setFrame((current) => {
        const next = isDefaultDocked
          ? clampFrame(defaultFrame, isCollapsed)
          : clampFrame(current, isCollapsed)
        return framesEqual(current, next) ? current : next
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [defaultFrame, isCollapsed, isDefaultDocked])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setFrame((current) => {
      const next = isDefaultDocked
        ? clampFrame(defaultFrame, isCollapsed)
        : clampFrame(current, isCollapsed)
      return framesEqual(current, next) ? current : next
    })
  }, [defaultFrame, isCollapsed, isDefaultDocked, isOpen])

  useEffect(() => {
    props.onDockingStateChange?.(isOpen && isDefaultDocked)
  }, [isDefaultDocked, isOpen, props])

  const toggleReference = (documentId: string) => {
    props.onSelectedReferenceIdsChange(
      props.selectedReferenceIds.includes(documentId)
        ? props.selectedReferenceIds.filter((id) => id !== documentId)
        : [...props.selectedReferenceIds, documentId]
    )
  }

  const releaseDefaultDock = () => {
    if (!isDefaultDocked) {
      return
    }
    setIsDefaultDocked(false)
    props.onDockingStateChange?.(false)
  }

  const dragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button, input, select, textarea, label')) {
      return
    }
    dragState.current = {
      offsetX: event.clientX - frame.x,
      offsetY: event.clientY - frame.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const dragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const currentDrag = dragState.current
    if (!currentDrag) {
      return
    }
    releaseDefaultDock()
    setFrame((current) => clampFrame({
      ...current,
      x: event.clientX - currentDrag.offsetX,
      y: event.clientY - currentDrag.offsetY
    }, isCollapsed))
  }

  const dragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const resizeStart = (direction: ResizeDirection) => (event: ReactPointerEvent<HTMLDivElement>) => {
    releaseDefaultDock()
    resizeState.current = {
      direction,
      frame,
      startX: event.clientX,
      startY: event.clientY
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const resizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const currentResize = resizeState.current
    if (!currentResize || isCollapsed) {
      return
    }
    setFrame(clampFrame(
      resizeFrameByDirection(
        currentResize.frame,
        currentResize.direction,
        event.clientX - currentResize.startX,
        event.clientY - currentResize.startY
      ),
      false
    ))
  }

  const resizeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    resizeState.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || runningJobId) {
      return
    }

    const createdAt = new Date().toISOString()
    const userMessage: ConsoleMessage = {
      content: trimmed,
      createdAt,
      id: `user_${Date.now()}`,
      role: 'user'
    }
    const assistantMessageId = `assistant_${Date.now()}`
    const assistantPlaceholder: ConsoleMessage = {
      createdAt,
      id: assistantMessageId,
      role: 'assistant',
      state: 'running'
    }

    const historyMessages = [...messages, userMessage]
    setMessages((current) => [...current, userMessage, assistantPlaceholder])
    setInput('')

    try {
      const job = await startCodexConsoleJob({
        autoReferenceCurrentDoc: props.autoReferenceCurrentDoc,
        conversation: buildConversationTurns(historyMessages),
        currentDocumentId: props.currentDocument?.id ?? null,
        message: trimmed,
        model: props.model,
        reasoningEffort: props.reasoningEffort,
        selectedDocumentIds: expandedSelectedDocumentIds,
        selectedProjectIds: props.selectedProjectIds
      })

      currentJobRef.current = {
        jobId: job.id,
        messageId: assistantMessageId
      }
      setRunningJobId(job.id)
      await pollJob(job, assistantMessageId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages((current) => current.map((item) => (
        item.id === assistantMessageId && item.role === 'assistant'
          ? {
              ...item,
              error: message,
              state: 'failed'
            }
          : item
      )))
      setRunningJobId(null)
      currentJobRef.current = null
    }
  }

  const pollJob = async (job: CodexConsoleJob, messageId: string) => {
    let latest = job
    while (currentJobRef.current?.jobId === job.id) {
      if (latest.status === 'ready') {
        setMessages((current) => current.map((item) => (
          item.id === messageId && item.role === 'assistant'
            ? {
                ...item,
                jobId: job.id,
                reply: latest.result,
                state: 'ready'
              }
            : item
        )))
        setRunningJobId(null)
        currentJobRef.current = null
        return
      }

      if (latest.status === 'failed' || latest.status === 'cancelled') {
        const nextState = latest.status === 'cancelled' ? 'cancelled' : 'failed'
        setMessages((current) => current.map((item) => (
          item.id === messageId && item.role === 'assistant'
            ? {
                ...item,
                error: latest.error,
                jobId: job.id,
                state: nextState
              }
            : item
        )))
        setRunningJobId(null)
        currentJobRef.current = null
        return
      }

      await sleep(1200)
      if (currentJobRef.current?.jobId !== job.id) {
        return
      }
      latest = await fetchCodexConsoleJob(job.id)
    }
  }

  const handleCancel = async () => {
    const active = currentJobRef.current
    if (!active || !runningJobId) {
      return
    }

    currentJobRef.current = null
    setRunningJobId(null)

    setMessages((current) => current.map((item) => (
      item.id === active.messageId && item.role === 'assistant'
        ? {
            ...item,
            error: '任务已取消',
            state: 'cancelled'
          }
        : item
    )))

    try {
      await cancelCodexConsoleJob(runningJobId)
    } catch {
      // Keep the local UI in a cancelled state even if the network request fails late.
    }
  }

  const handleReset = () => {
    if (runningJobId) {
      return
    }
    setMessages([])
    setInput('')
  }

  const handleRestoreDefaultDock = () => {
    setIsDefaultDocked(true)
    setFrame(defaultFrame)
  }

  const style: CSSProperties = {
    height: isCollapsed ? 74 : frame.height,
    left: frame.x,
    top: frame.y,
    width: Math.min(frame.width, isMobile ? window.innerWidth - 24 : frame.width)
  }

  if (!isOpen) {
    return (
      <button className="codex-launcher" onClick={() => setIsOpen(true)}>
        打开 Codex
      </button>
    )
  }

  return (
    <motion.section
      className={`codex-float codex-console-shell ${isCollapsed ? 'collapsed' : ''}`}
      initial={false}
      style={style}
    >
      <div
        className="codex-float-header codex-console-header"
        onPointerDown={dragStart}
        onPointerMove={dragMove}
        onPointerUp={dragEnd}
      >
        <div className="codex-console-title">
          <span className="console-kicker">CODEX</span>
          <strong>文档助手</strong>
        </div>

        <div className="codex-console-header-actions">
          <span
            aria-label={runningJobId ? 'Codex 正在处理' : 'Codex 空闲'}
            className={`console-status-orb ${runningJobId ? 'busy' : 'idle'}`}
            title={runningJobId ? 'Codex 正在处理' : 'Codex 空闲'}
          >
            <LoaderCircle className={runningJobId ? 'spin' : ''} size={15} />
          </span>
          <button
            aria-label="恢复默认停靠位"
            className="console-header-icon"
            disabled={isDefaultDocked}
            onClick={handleRestoreDefaultDock}
            title="恢复默认停靠位"
          >
            <LocateFixed size={15} />
          </button>
          <button
            aria-label={isCollapsed ? '展开浮窗' : '收起浮窗'}
            className="console-header-icon"
            onClick={() => setIsCollapsed((current) => !current)}
            title={isCollapsed ? '展开浮窗' : '收起浮窗'}
          >
            {isCollapsed ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
          </button>
          <button
            aria-label="关闭 Codex 浮窗"
            className="console-header-icon"
            onClick={() => setIsOpen(false)}
            title="关闭 Codex 浮窗"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          <div className="codex-float-body codex-console-body">
            <div className="console-reference-strip">
              {props.currentDocument && props.autoReferenceCurrentDoc && (
                <button className="console-ref-chip current" onClick={() => props.onAutoReferenceCurrentDocChange(false)}>
                  <div>
                    <span>自动引用当前文档</span>
                    <strong>{props.currentDocument.relPath}</strong>
                  </div>
                  <small>取消</small>
                </button>
              )}

              {props.currentDocument && !props.autoReferenceCurrentDoc && (
                <button className="console-ref-chip muted" onClick={() => props.onAutoReferenceCurrentDocChange(true)}>
                  <div>
                    <span>当前文档未自动带入</span>
                    <strong>{props.currentDocument.relPath}</strong>
                  </div>
                  <small>恢复</small>
                </button>
              )}

              {selectedReferenceDocs.map((item) => (
                <button key={item.id} className="console-ref-chip" onClick={() => toggleReference(item.id)}>
                  <div>
                    <span>文件引用</span>
                    <strong>{item.relPath}</strong>
                  </div>
                  <small>取消</small>
                </button>
              ))}
            </div>

            {isPickerOpen && (
              <div className="console-picker-panel">
                <div className="console-picker-top">
                  <div>
                    <strong>插入具体文档</strong>
                    <p>只搜索文档本身，不再拆成系列或目录列。</p>
                  </div>
                  <button className="console-picker-close" onClick={() => setIsPickerOpen(false)}>
                    <X size={16} />
                  </button>
                </div>

                <label className="console-search-shell">
                  <FolderSearch size={16} />
                  <input
                    placeholder="搜索具体文档，例如 README / transformer / rag"
                    value={referenceQuery}
                    onChange={(event) => setReferenceQuery(event.target.value)}
                  />
                </label>

                <div className="console-picker-summary">
                  <span>{fileOptions.length} 条文档结果</span>
                  <small>支持主线文档和 `mywork` 中已识别的文档</small>
                </div>

                <div className="console-picker-list single-column">
                  {fileOptions.map((item) => (
                    <button
                      key={item.id}
                      className={`console-picker-item ${props.selectedReferenceIds.includes(item.id) ? 'selected' : ''}`}
                      onClick={() => toggleReference(item.id)}
                    >
                      <strong>{item.title}</strong>
                      <small>{item.relPath}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="console-message-list">
              {messages.length === 0 ? (
                <div className="console-empty-state">
                  <strong>提问 / 修改指令</strong>
                  <p>结合选中的目录、文件和当前文档，直接让我帮你分析、改写、补充或落地修改。</p>
                </div>
              ) : (
                messages.map((message) => (
                  message.role === 'user'
                    ? (
                      <article key={message.id} className="console-message user">
                        <div className="console-message-bubble">
                          <p>{message.content}</p>
                        </div>
                      </article>
                    )
                    : (
                      <article key={message.id} className="console-message assistant">
                        {message.state === 'running' ? (
                          <div className="console-assistant-card running">
                            <span className="console-inline-status">Codex 正在整理并执行…</span>
                          </div>
                        ) : message.state === 'ready' && message.reply ? (
                          <AssistantReplyCard reply={message.reply} />
                        ) : (
                          <div className={`console-assistant-card ${message.state}`}>
                            <span className="console-inline-status">
                              {message.state === 'cancelled' ? '任务已取消' : message.error ?? '任务失败'}
                            </span>
                          </div>
                        )}
                      </article>
                    )
                ))
              )}
              <div ref={messageEndRef} />
            </div>

            <div className="console-composer-card">
              <label className="console-composer-label" htmlFor="codex-console-input">提问 / 修改指令</label>
              <textarea
                id="codex-console-input"
                className="console-composer-input"
                placeholder="例如：结合 @ 当前文档和一个项目目录，帮我补一段说明；如果合适，直接修改对应 md 文件。"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />

              <div className="console-control-row">
                <label className="console-mini-select">
                  <span>模型</span>
                  <select value={props.model} onChange={(event) => props.onModelChange(event.target.value)}>
                    {props.models.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>

                <label className="console-mini-select">
                  <span>effort</span>
                  <select
                    value={props.reasoningEffort}
                    onChange={(event) => props.onReasoningEffortChange(event.target.value as ReasoningEffort)}
                  >
                    {props.reasoningEfforts.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>

                <button className="console-pill-button" onClick={() => setIsPickerOpen((current) => !current)}>
                  <AtSign size={16} />
                  插入路径
                </button>

                <button
                  className="console-pill-button"
                  disabled={!runningJobId}
                  onClick={() => void handleCancel()}
                >
                  <Square size={15} />
                  停止任务
                </button>

                <button
                  className="console-pill-button"
                  disabled={Boolean(runningJobId) || messages.length === 0}
                  onClick={handleReset}
                >
                  <RotateCcw size={15} />
                  重置会话
                </button>
              </div>

              <div className="console-footer-row">
                <p>
                  支持搜索并插入具体文档。当前文档可自动引用，也可以在上方单独取消。
                  <code>Ctrl/Cmd + Enter</code> 直接发送。
                </p>

                <button
                  className="console-send-button"
                  disabled={!input.trim() || Boolean(runningJobId)}
                  onClick={() => void handleSend()}
                >
                  发送到 Codex
                  <SendHorizontal size={17} />
                </button>
              </div>
            </div>
          </div>

          {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeDirection[]).map((direction) => (
            <div
              key={direction}
              className={`codex-resizer codex-resizer-${direction}`}
              onPointerDown={resizeStart(direction)}
              onPointerMove={resizeMove}
              onPointerUp={resizeEnd}
            />
          ))}
        </>
      )}
    </motion.section>
  )
}

function AssistantReplyCard(props: { reply: CodexConsoleReply }) {
  return (
    <div className="console-assistant-card">
      <div className="console-assistant-head">
        <span className={`console-mode-pill ${props.reply.mode}`}>{describeConsoleMode(props.reply.mode)}</span>
        <strong>{props.reply.headline}</strong>
      </div>

      {props.reply.summary && <p className="console-summary">{props.reply.summary}</p>}

      {props.reply.warnings.length > 0 && (
        <div className="console-warning-box">
          {props.reply.warnings.map((item) => (
            <div key={item} className="console-warning-item">{item}</div>
          ))}
        </div>
      )}

      <div className="console-markdown">
        <ReactMarkdown rehypePlugins={[rehypeKatex]} remarkPlugins={[remarkGfm, remarkMath]}>
          {normalizeMarkdownForRender(props.reply.reply_markdown)}
        </ReactMarkdown>
      </div>

      {props.reply.changed_files.length > 0 && (
        <div className="console-meta-block">
          <span>已修改文件</span>
          <div className="console-meta-list">
            {props.reply.changed_files.map((item) => (
              <div key={`${item.path}-${item.summary}`} className="console-meta-chip">
                <strong>{item.path}</strong>
                <small>{item.summary}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {props.reply.citations.length > 0 && (
        <div className="console-meta-block">
          <span>引用来源</span>
          <div className="console-meta-list">
            {props.reply.citations.map((item) => (
              <div key={`${item.path}-${item.label}`} className="console-meta-chip">
                <strong>{item.label}</strong>
                <small>{item.path}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {props.reply.follow_ups.length > 0 && (
        <div className="console-meta-block">
          <span>可以继续追问</span>
          <div className="console-follow-up-row">
            {props.reply.follow_ups.map((item) => (
              <div key={item} className="console-follow-up-chip">{item}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function buildConversationTurns(messages: ConsoleMessage[]): Array<{ content: string; role: 'assistant' | 'user' }> {
  const turns: Array<{ content: string; role: 'assistant' | 'user' }> = []

  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({
        content: message.content,
        role: 'user'
      })
      continue
    }

    if (message.state !== 'ready' || !message.reply) {
      continue
    }

    turns.push({
      content: `${message.reply.summary}\n\n${message.reply.reply_markdown}`.trim(),
      role: 'assistant'
    })
  }

  return turns
}

function describeConsoleMode(mode: CodexConsoleReply['mode']) {
  if (mode === 'edit') {
    return '已改写'
  }
  if (mode === 'plan') {
    return '执行方案'
  }
  if (mode === 'review') {
    return '审阅结果'
  }
  if (mode === 'mixed') {
    return '答复 + 修改'
  }
  return '直接回答'
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const media = window.matchMedia(query)
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    media.addEventListener('change', listener)
    return () => {
      media.removeEventListener('change', listener)
    }
  }, [query])

  return matches
}

function clampFrame(frame: FloatFrame, isCollapsed: boolean) {
  const minWidth = 360
  const minHeight = 420
  const width = clamp(frame.width, minWidth, window.innerWidth - 16)
  const height = isCollapsed ? 72 : clamp(frame.height, minHeight, window.innerHeight - 84)
  const x = clamp(frame.x, 8, window.innerWidth - width - 8)
  const y = clamp(frame.y, 64, window.innerHeight - height - 8)
  return { height, width, x, y }
}

function buildDefaultFloatFrame(props: {
  defaultDockLeft?: number
  defaultDockTop?: number
  isCollapsed: boolean
  isMobile: boolean
}): FloatFrame {
  if (typeof window === 'undefined') {
    return {
      height: props.isCollapsed ? 72 : 720,
      width: 432,
      x: 20,
      y: props.isMobile ? 84 : 184
    }
  }

  if (props.isMobile) {
    const width = Math.min(window.innerWidth - 24, 460)
    const expandedHeight = clamp(window.innerHeight - 108, 440, 720)
    const height = props.isCollapsed ? 72 : expandedHeight

    return clampFrame({
      height,
      width,
      x: 12,
      y: props.isCollapsed
        ? window.innerHeight - height - 12
        : window.innerHeight - expandedHeight - 12
    }, props.isCollapsed)
  }

  const width = 432
  const top = clamp(props.defaultDockTop ?? 136, 88, Math.max(88, window.innerHeight - 180))
  const expandedHeight = clamp(window.innerHeight - top - 18, 520, 1040)
  const height = props.isCollapsed ? 72 : expandedHeight
  const defaultLeft = props.defaultDockLeft ?? (window.innerWidth - width - 24)

  return clampFrame({
    height,
    width,
    x: defaultLeft,
    y: top
  }, props.isCollapsed)
}

function resizeFrameByDirection(frame: FloatFrame, direction: ResizeDirection, deltaX: number, deltaY: number): FloatFrame {
  let next = { ...frame }

  if (direction.includes('e')) {
    next.width = frame.width + deltaX
  }
  if (direction.includes('s')) {
    next.height = frame.height + deltaY
  }
  if (direction.includes('w')) {
    next.width = frame.width - deltaX
    next.x = frame.x + deltaX
  }
  if (direction.includes('n')) {
    next.height = frame.height - deltaY
    next.y = frame.y + deltaY
  }

  return next
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function framesEqual(left: FloatFrame, right: FloatFrame) {
  return left.height === right.height
    && left.width === right.width
    && left.x === right.x
    && left.y === right.y
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
