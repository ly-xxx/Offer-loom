import {
  useEffect,
  useRef,
  useState
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import {
  RotateCcw,
  SendHorizontal,
  ShieldAlert,
  Square
} from 'lucide-react'

import {
  cancelInterviewerJob,
  subscribeAgentJobStream,
  startInterviewerJob
} from './api'
import { normalizeMarkdownForRender } from './markdown'
import type { InterviewerReply } from './types'
import { OverlayDrawer } from './WorkspacePanels'

type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh'

type InterviewerSession = {
  questionId: string
  questionTitle: string
  seedFollowUp: string
  sessionKey: string
}

type InterviewerMessage =
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
      reply?: InterviewerReply
      role: 'assistant'
      summary?: string
      state: 'cancelled' | 'failed' | 'ready' | 'running'
    }

type Props = {
  onClose: () => void
  onReasoningEffortChange: (value: ReasoningEffort) => void
  open: boolean
  reasoningEffort: ReasoningEffort
  reasoningEfforts: ReasoningEffort[]
  session: InterviewerSession | null
}

export function InterviewerModeDrawer(props: Props) {
  const [messages, setMessages] = useState<InterviewerMessage[]>([])
  const [input, setInput] = useState('')
  const [runningJobId, setRunningJobId] = useState<string | null>(null)
  const currentJobRef = useRef<null | { jobId: string; messageId: string; sessionKey: string }>(null)
  const jobStreamCleanupRef = useRef<null | (() => void)>(null)
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const sessionKeyRef = useRef<string | null>(null)

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end'
    })
  }, [messages])

  useEffect(() => {
    return () => {
      jobStreamCleanupRef.current?.()
      jobStreamCleanupRef.current = null
    }
  }, [])

  useEffect(() => {
    const session = props.session
    if (!props.open || !session) {
      return
    }

    sessionKeyRef.current = session.sessionKey
    currentJobRef.current = null
    setRunningJobId(null)
    setMessages([
      {
        createdAt: new Date().toISOString(),
        id: `assistant_boot_${session.sessionKey}`,
        role: 'assistant',
        state: 'running'
      }
    ])
    setInput('')

    void kickoffSession(session)
  }, [props.open, props.session])

  const kickoffSession = async (session: InterviewerSession) => {
    const messageId = `assistant_${Date.now()}`
    setMessages([{
      createdAt: new Date().toISOString(),
      id: messageId,
      role: 'assistant',
      state: 'running'
    }])

    try {
      const job = await startInterviewerJob({
        conversation: [],
        questionId: session.questionId,
        reasoningEffort: props.reasoningEffort,
        seedFollowUp: session.seedFollowUp
      })

      currentJobRef.current = {
        jobId: job.id,
        messageId,
        sessionKey: session.sessionKey
      }
      setRunningJobId(job.id)
      attachJobStream(job.id, messageId, session.sessionKey)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages([{
        createdAt: new Date().toISOString(),
        error: message,
        id: messageId,
        role: 'assistant',
        state: 'failed'
      }])
      setRunningJobId(null)
      currentJobRef.current = null
    }
  }

  const handleSend = async () => {
    const session = props.session
    const trimmed = input.trim()
    if (!session || !trimmed || runningJobId) {
      return
    }

    const createdAt = new Date().toISOString()
    const userMessage: InterviewerMessage = {
      content: trimmed,
      createdAt,
      id: `user_${Date.now()}`,
      role: 'user'
    }
    const assistantMessageId = `assistant_${Date.now()}`
    const assistantPlaceholder: InterviewerMessage = {
      createdAt,
      id: assistantMessageId,
      role: 'assistant',
      state: 'running'
    }

    const historyMessages = [...messages, userMessage]
    setMessages((current) => [...current, userMessage, assistantPlaceholder])
    setInput('')

    try {
      const job = await startInterviewerJob({
        candidateAnswer: trimmed,
        conversation: buildConversationTurns(historyMessages),
        questionId: session.questionId,
        reasoningEffort: props.reasoningEffort,
        seedFollowUp: session.seedFollowUp
      })

      currentJobRef.current = {
        jobId: job.id,
        messageId: assistantMessageId,
        sessionKey: session.sessionKey
      }
      setRunningJobId(job.id)
      attachJobStream(job.id, assistantMessageId, session.sessionKey)
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

  const attachJobStream = (jobId: string, messageId: string, sessionKey: string) => {
    jobStreamCleanupRef.current?.()
    jobStreamCleanupRef.current = subscribeAgentJobStream(jobId, (incomingJob) => {
      if (
        incomingJob.kind !== 'interviewer'
        || currentJobRef.current?.jobId !== jobId
        || currentJobRef.current?.sessionKey !== sessionKey
        || sessionKeyRef.current !== sessionKey
      ) {
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
      await cancelInterviewerJob(runningJobId)
    } catch {
      // Keep the local state cancelled even if the request completes late.
    }
  }

  const handleReset = () => {
    const session = props.session
    if (!session || runningJobId) {
      return
    }
    sessionKeyRef.current = `${session.sessionKey}-reset-${Date.now()}`
    const nextSession = {
      ...session,
      sessionKey: sessionKeyRef.current
    }
    void kickoffSession(nextSession)
  }

  const title = props.session?.questionTitle ?? '面试官模式'
  const seedFollowUp = props.session?.seedFollowUp ?? ''

  return (
    <OverlayDrawer
      icon={<ShieldAlert size={18} />}
      onClose={props.onClose}
      open={props.open}
      title="面试官模式"
    >
      {props.session ? (
        <div className="control-panel-body interviewer-panel-body">
          <section className="control-card interviewer-context-card">
            <div className="control-card-head">
              <div>
                <strong>{title}</strong>
                <p>固定使用 `gpt-5.4`。这一面板只负责高压追问，不替你作答。</p>
              </div>
              <span className={`console-status-pill ${runningJobId ? 'busy' : 'idle'}`}>
                {runningJobId ? '施压中' : '待追问'}
              </span>
            </div>

            <div className="interviewer-seed-block">
              <span>本轮切入追问</span>
              <strong>{seedFollowUp}</strong>
            </div>

            <div className="interviewer-toolbar">
              <label className="console-mini-select">
                <span>模型</span>
                <div className="fixed-model-pill">gpt-5.4</div>
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

              <button className="console-pill-button" disabled={!runningJobId} onClick={() => void handleCancel()}>
                <Square size={15} />
                停止
              </button>

              <button className="console-pill-button" disabled={Boolean(runningJobId)} onClick={handleReset}>
                <RotateCcw size={15} />
                重开一轮
              </button>
            </div>
          </section>

          <section className="control-card interviewer-chat-card">
            <div className="interviewer-message-list">
              {messages.map((message) => (
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
                        <div className="console-assistant-card running interviewer-running-card">
                          <span className="console-inline-status">{message.summary ?? '面试官正在收紧问题边界…'}</span>
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
                        <InterviewerReplyCard reply={message.reply} />
                      ) : (
                        <div className={`console-assistant-card ${message.state}`}>
                          <span className="console-inline-status">
                            {message.state === 'cancelled' ? '任务已取消' : message.error ?? '任务失败'}
                          </span>
                        </div>
                      )}
                    </article>
                  )
              ))}
              <div ref={messageEndRef} />
            </div>

            <div className="console-composer-card interviewer-composer-card">
              <label className="console-composer-label" htmlFor="interviewer-input">你的回答</label>
              <textarea
                id="interviewer-input"
                className="console-composer-input"
                placeholder="先像真实面试那样开口作答。答不上来也没关系，面试官模式会继续深挖。"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />

              <div className="console-footer-row">
                <p>
                  当前是高压追问模式。<code>Ctrl/Cmd + Enter</code> 直接发送回答。
                </p>

                <button
                  className="console-send-button"
                  disabled={!input.trim() || Boolean(runningJobId)}
                  onClick={() => void handleSend()}
                >
                  提交回答
                  <SendHorizontal size={17} />
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </OverlayDrawer>
  )
}

function InterviewerReplyCard(props: { reply: InterviewerReply }) {
  return (
    <div className="console-assistant-card interviewer-assistant-card">
      <div className="console-assistant-head">
        <span className={`console-mode-pill interviewer-level ${props.reply.pressure_level}`}>
          {describePressureLevel(props.reply.pressure_level)}
        </span>
        <strong>{props.reply.headline}</strong>
      </div>

      {props.reply.summary && <p className="console-summary">{props.reply.summary}</p>}

      {props.reply.assessment && (
        <div className="interviewer-assessment-box">
          <span>这一轮判断</span>
          <p>{props.reply.assessment}</p>
        </div>
      )}

      <div className="console-markdown interviewer-markdown">
        <ReactMarkdown rehypePlugins={[rehypeKatex]} remarkPlugins={[remarkGfm, remarkMath]}>
          {normalizeMarkdownForRender(props.reply.interviewer_markdown)}
        </ReactMarkdown>
      </div>

      {props.reply.pressure_points.length > 0 && (
        <div className="console-meta-block">
          <span>面试官正在盯的点</span>
          <div className="console-follow-up-row">
            {props.reply.pressure_points.map((item) => (
              <div key={item} className="console-follow-up-chip interviewer-chip">{item}</div>
            ))}
          </div>
        </div>
      )}

      {props.reply.citations.length > 0 && (
        <div className="console-meta-block">
          <span>施压依据</span>
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
          <span>下一步可能继续卡你</span>
          <div className="console-follow-up-row">
            {props.reply.follow_ups.map((item) => (
              <div key={item} className="console-follow-up-chip interviewer-chip">{item}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function buildConversationTurns(messages: InterviewerMessage[]): Array<{ content: string; role: 'assistant' | 'user' }> {
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
      content: message.reply.interviewer_markdown.trim(),
      role: 'assistant'
    })
  }

  return turns
}

function describePressureLevel(level: InterviewerReply['pressure_level']) {
  if (level === 'cornering') {
    return '压墙追问'
  }
  if (level === 'pressure') {
    return '高压深挖'
  }
  return '开场施压'
}
