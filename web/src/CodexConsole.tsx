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
  subscribeAgentJobStream,
  startCodexConsoleJob
} from './api'
import { normalizeMarkdownForRender } from './markdown'
import type {
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
      liveLogs?: string[]
      liveText?: string
      reply?: CodexConsoleReply
      role: 'assistant'
      summary?: string
      state: 'cancelled' | 'failed' | 'ready' | 'running'
    }

type Props = {
  autoReferenceCurrentDoc: boolean
  currentDocument: DocumentData | null
  defaultDockLeft?: number
  defaultDockTop?: number
  dockMainLeft?: number
  dockMaxHeight?: number
  dockRightBoundary?: number
  documents: DocumentListItem[]
  model: string
  models: string[]
  onAutoReferenceCurrentDocChange: (value: boolean) => void
  onLayoutChange?: (value: { frame: FloatFrame | null; isDefaultDocked: boolean; isOpen: boolean }) => void
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

const FLOAT_WINDOW_MIN_WIDTH = 360
const FLOAT_WINDOW_MIN_HEIGHT = 420
const FLOAT_WINDOW_EDGE_MARGIN = 8
const FLOAT_DOCK_GAP = 16
const FLOAT_DOCK_MIN_DOCUMENT_WIDTH = 860

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
    dockMainLeft: props.dockMainLeft,
    dockMaxHeight: props.dockMaxHeight,
    dockRightBoundary: props.dockRightBoundary,
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
  const jobStreamCleanupRef = useRef<null | (() => void)>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const deferredReferenceQuery = useDeferredValue(referenceQuery.trim().toLowerCase())
  const defaultFrame = useMemo(() => buildDefaultFloatFrame({
    defaultDockLeft: props.defaultDockLeft,
    defaultDockTop: props.defaultDockTop,
    dockMainLeft: props.dockMainLeft,
    dockMaxHeight: props.dockMaxHeight,
    dockRightBoundary: props.dockRightBoundary,
    isCollapsed,
    isMobile
  }), [isCollapsed, isMobile, props.defaultDockLeft, props.defaultDockTop, props.dockMainLeft, props.dockMaxHeight, props.dockRightBoundary])

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
    return () => {
      jobStreamCleanupRef.current?.()
      jobStreamCleanupRef.current = null
    }
  }, [])

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
          ? clampDockedFrame(current, {
              dockMainLeft: props.dockMainLeft,
              dockMaxHeight: props.dockMaxHeight,
              dockRightBoundary: props.dockRightBoundary,
              dockTop: props.defaultDockTop,
              isCollapsed
            })
          : clampFrame(current, isCollapsed)
        return framesEqual(current, next) ? current : next
      })
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [defaultFrame, isCollapsed, isDefaultDocked, props.defaultDockTop, props.dockMainLeft, props.dockMaxHeight, props.dockRightBoundary])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setFrame((current) => {
      const next = isDefaultDocked
        ? clampDockedFrame(current, {
            dockMainLeft: props.dockMainLeft,
            dockMaxHeight: props.dockMaxHeight,
            dockRightBoundary: props.dockRightBoundary,
            dockTop: props.defaultDockTop,
            isCollapsed
          })
        : clampFrame(current, isCollapsed)
      return framesEqual(current, next) ? current : next
    })
  }, [defaultFrame, isCollapsed, isDefaultDocked, isOpen, props.defaultDockTop, props.dockMainLeft, props.dockMaxHeight, props.dockRightBoundary])

  useEffect(() => {
    props.onLayoutChange?.({
      frame: isOpen ? frame : null,
      isDefaultDocked,
      isOpen
    })
  }, [frame, isDefaultDocked, isOpen, props.onLayoutChange])

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
    const resizedFrame = resizeFrameByDirection(
      currentResize.frame,
      currentResize.direction,
      event.clientX - currentResize.startX,
      event.clientY - currentResize.startY
    )
    setFrame(
      isDefaultDocked
        ? clampDockedFrame(resizedFrame, {
            dockMainLeft: props.dockMainLeft,
            dockMaxHeight: props.dockMaxHeight,
            dockRightBoundary: props.dockRightBoundary,
            dockTop: props.defaultDockTop,
            isCollapsed: false
          })
        : clampFrame(resizedFrame, false)
    )
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
      attachJobStream(job.id, assistantMessageId)
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

  const attachJobStream = (jobId: string, messageId: string) => {
    jobStreamCleanupRef.current?.()
    jobStreamCleanupRef.current = subscribeAgentJobStream(jobId, (incomingJob) => {
      if (incomingJob.kind !== 'console' || currentJobRef.current?.jobId !== jobId) {
        return
      }

      setMessages((current) => current.map((item) => {
        if (item.id !== messageId || item.role !== 'assistant') {
          return item
        }

        if (incomingJob.status === 'ready') {
          return {
            ...item,
            jobId,
            liveLogs: incomingJob.liveLogs,
            liveText: incomingJob.liveText,
            reply: incomingJob.result,
            state: 'ready',
            summary: incomingJob.summary
          }
        }

        if (incomingJob.status === 'failed' || incomingJob.status === 'cancelled') {
          return {
            ...item,
            error: incomingJob.error,
            jobId,
            liveLogs: incomingJob.liveLogs,
            liveText: incomingJob.liveText,
            state: incomingJob.status === 'cancelled' ? 'cancelled' : 'failed',
            summary: incomingJob.summary
          }
        }

        return {
          ...item,
          jobId,
          liveLogs: incomingJob.liveLogs,
          liveText: incomingJob.liveText,
          state: 'running',
          summary: incomingJob.summary
        }
      }))

      if (incomingJob.status === 'ready' || incomingJob.status === 'failed' || incomingJob.status === 'cancelled') {
        setRunningJobId(null)
        currentJobRef.current = null
        jobStreamCleanupRef.current?.()
        jobStreamCleanupRef.current = null
      } else {
        setRunningJobId(jobId)
      }
    })
  }

  const handleCancel = async () => {
    const active = currentJobRef.current
    if (!active || !runningJobId) {
      return
    }

    jobStreamCleanupRef.current?.()
    jobStreamCleanupRef.current = null
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
                            <span className="console-inline-status">{message.summary ?? 'Codex 正在整理并执行…'}</span>
                            {message.liveText && (
                              <div className="console-markdown live-preview">
                                <ReactMarkdown rehypePlugins={[rehypeKatex]} remarkPlugins={[remarkGfm, remarkMath]}>
                                  {normalizeMarkdownForRender(message.liveText)}
                                </ReactMarkdown>
                              </div>
                            )}
                            {message.liveLogs && message.liveLogs.length > 0 && (
                              <div className="job-log-list stream-log-list">
                                {message.liveLogs.slice(-4).map((line) => (
                                  <div key={`${message.id}-${line}`} className="job-log-line">{line}</div>
                                ))}
                              </div>
                            )}
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
  const width = clamp(frame.width, FLOAT_WINDOW_MIN_WIDTH, window.innerWidth - 16)
  const height = isCollapsed ? 72 : clamp(frame.height, FLOAT_WINDOW_MIN_HEIGHT, window.innerHeight - 84)
  const x = clamp(frame.x, FLOAT_WINDOW_EDGE_MARGIN, window.innerWidth - width - FLOAT_WINDOW_EDGE_MARGIN)
  const y = clamp(frame.y, 64, window.innerHeight - height - FLOAT_WINDOW_EDGE_MARGIN)
  return { height, width, x, y }
}

function clampDockedFrame(frame: FloatFrame, props: {
  dockMainLeft?: number
  dockMaxHeight?: number
  dockRightBoundary?: number
  dockTop?: number
  isCollapsed: boolean
}) {
  const rightBoundary = Math.max(FLOAT_WINDOW_MIN_WIDTH + FLOAT_WINDOW_EDGE_MARGIN, props.dockRightBoundary ?? (window.innerWidth - 16))
  const topBoundary = clamp(props.dockTop ?? 96, 72, Math.max(72, window.innerHeight - 180))
  const maxWidthByViewport = Math.max(FLOAT_WINDOW_MIN_WIDTH, rightBoundary - FLOAT_WINDOW_EDGE_MARGIN)
  const maxWidthByDocument = typeof props.dockMainLeft === 'number'
    ? Math.max(FLOAT_WINDOW_MIN_WIDTH, rightBoundary - props.dockMainLeft - FLOAT_DOCK_GAP - FLOAT_DOCK_MIN_DOCUMENT_WIDTH)
    : maxWidthByViewport
  const width = clamp(frame.width, FLOAT_WINDOW_MIN_WIDTH, Math.min(maxWidthByViewport, maxWidthByDocument))
  const maxHeight = Math.max(FLOAT_WINDOW_MIN_HEIGHT, Math.min(props.dockMaxHeight ?? (window.innerHeight - topBoundary - FLOAT_WINDOW_EDGE_MARGIN), window.innerHeight - topBoundary - FLOAT_WINDOW_EDGE_MARGIN))
  const height = props.isCollapsed ? 72 : clamp(frame.height, FLOAT_WINDOW_MIN_HEIGHT, maxHeight)
  const x = clamp(rightBoundary - width, FLOAT_WINDOW_EDGE_MARGIN, Math.max(FLOAT_WINDOW_EDGE_MARGIN, rightBoundary - FLOAT_WINDOW_MIN_WIDTH))
  const y = clamp(frame.y, topBoundary, window.innerHeight - height - FLOAT_WINDOW_EDGE_MARGIN)
  return { height, width, x, y }
}

function buildDefaultFloatFrame(props: {
  defaultDockLeft?: number
  defaultDockTop?: number
  dockMainLeft?: number
  dockMaxHeight?: number
  dockRightBoundary?: number
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
  const expandedHeight = clamp(props.dockMaxHeight ?? (window.innerHeight - top - 18), 520, 1040)
  const height = props.isCollapsed ? 72 : expandedHeight
  const defaultLeft = props.defaultDockLeft ?? (props.dockRightBoundary ?? (window.innerWidth - 16)) - width

  return clampDockedFrame({
    height,
    width,
    x: defaultLeft,
    y: top
  }, {
    dockMainLeft: props.dockMainLeft,
    dockMaxHeight: props.dockMaxHeight,
    dockRightBoundary: props.dockRightBoundary,
    dockTop: props.defaultDockTop,
    isCollapsed: props.isCollapsed
  })
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
