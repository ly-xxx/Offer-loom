import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Building2,
  CalendarDays,
  ClipboardPaste,
  ImagePlus,
  LoaderCircle,
  ScanText,
  Sparkles,
  UserRoundSearch,
  X
} from 'lucide-react'

import type { InterviewImportPayload } from './types'

type Props = {
  busy: boolean
  onClose: () => void
  onSubmit: (payload: InterviewImportPayload) => Promise<void> | void
  open: boolean
}

type ImportMethod = 'screenshot' | 'text'
type OcrLoggerMessage = {
  progress?: number
  status?: string
}

export function InterviewImportModal(props: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [method, setMethod] = useState<ImportMethod>('text')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [interviewDate, setInterviewDate] = useState('')
  const [content, setContent] = useState('')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [ocrStatus, setOcrStatus] = useState<'failed' | 'idle' | 'running' | 'success'>('idle')
  const [ocrError, setOcrError] = useState('')
  const [ocrProgress, setOcrProgress] = useState(0)

  useEffect(() => {
    if (!props.open) {
      return
    }

    const handlePaste = (event: ClipboardEvent) => {
      if (method !== 'screenshot') {
        return
      }

      const file = readImageFromClipboard(event)
      if (!file) {
        return
      }

      event.preventDefault()
      void loadScreenshot(file)
    }

    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('paste', handlePaste)
    }
  }, [method, props.open])

  const questionCountEstimate = useMemo(() => estimateQuestionCount(content), [content])
  const canSubmit = content.trim().length > 0 && !props.busy && ocrStatus !== 'running'

  const resetState = () => {
    setMethod('text')
    setTitle('')
    setCompany('')
    setRole('')
    setInterviewDate('')
    setContent('')
    setImagePreview(null)
    setImageName('')
    setOcrStatus('idle')
    setOcrError('')
    setOcrProgress(0)
  }

  const loadScreenshot = async (file: File) => {
    const preview = await readFileAsDataUrl(file)
    setImagePreview(preview)
    setImageName(file.name || 'clipboard-image.png')
    await runOcr(preview)
  }

  const runOcr = async (imageDataUrl: string) => {
    setMethod('screenshot')
    setOcrStatus('running')
    setOcrError('')
    setOcrProgress(0.02)

    try {
      const tesseract = await import('tesseract.js')
      const result = await tesseract.recognize(imageDataUrl, 'eng+chi_sim', {
        logger(message: OcrLoggerMessage) {
          if (message.status === 'recognizing text' && typeof message.progress === 'number') {
            setOcrProgress(Math.max(0.04, Math.min(0.98, message.progress)))
          }
        }
      })

      const text = normalizeRecognizedText(result.data.text)
      if (!text) {
        throw new Error('没有从截图里识别出可用文字')
      }

      setContent(text)
      setOcrProgress(1)
      setOcrStatus('success')
    } catch (error) {
      setOcrStatus('failed')
      setOcrError(error instanceof Error ? error.message : String(error))
    }
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      return
    }

    await props.onSubmit({
      company: company.trim() || undefined,
      content: content.trim(),
      importMethod: method,
      interviewDate: interviewDate.trim() || undefined,
      role: role.trim() || undefined,
      title: title.trim() || undefined
    })
    resetState()
  }

  const onImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    await loadScreenshot(file)
  }

  const onDrop = async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (!file || !file.type.startsWith('image/')) {
      return
    }
    await loadScreenshot(file)
  }

  return (
    <AnimatePresence initial={false}>
      {props.open && (
        <>
          <motion.button
            aria-label="关闭面经导入弹窗"
            className="overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (!props.busy) {
                resetState()
                props.onClose()
              }
            }}
          />

          <motion.section
            className="interview-import-modal"
            initial={{ opacity: 0, scale: 0.98, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
          >
            <div className="interview-import-head">
              <div>
                <strong>添加面经</strong>
                <p>贴文本或贴截图，存成可索引的新面经源。</p>
              </div>

              <button
                className="ghost-button icon-button"
                onClick={() => {
                  if (!props.busy) {
                    resetState()
                    props.onClose()
                  }
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="import-method-row">
              <button
                className={`import-method-card ${method === 'text' ? 'active' : ''}`}
                onClick={() => setMethod('text')}
              >
                <ClipboardPaste size={16} />
                <div>
                  <strong>粘贴文本</strong>
                  <span>适合网页、聊天记录、笔记整理</span>
                </div>
              </button>

              <button
                className={`import-method-card ${method === 'screenshot' ? 'active' : ''}`}
                onClick={() => setMethod('screenshot')}
              >
                <ScanText size={16} />
                <div>
                  <strong>截图识别</strong>
                  <span>粘贴截图或拖进图片，自动 OCR</span>
                </div>
              </button>
            </div>

            <div className="import-meta-grid">
              <label className="import-mini-field">
                <span>标题</span>
                <input placeholder="可选，默认会自动取首行" value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>

              <label className="import-mini-field">
                <span><Building2 size={14} /> 公司</span>
                <input placeholder="例如 OpenAI / 字节" value={company} onChange={(event) => setCompany(event.target.value)} />
              </label>

              <label className="import-mini-field">
                <span><UserRoundSearch size={14} /> 岗位</span>
                <input placeholder="例如 LLM Engineer" value={role} onChange={(event) => setRole(event.target.value)} />
              </label>

              <label className="import-mini-field">
                <span><CalendarDays size={14} /> 日期</span>
                <input placeholder="例如 2026-03 / 2026-03-25" value={interviewDate} onChange={(event) => setInterviewDate(event.target.value)} />
              </label>
            </div>

            {method === 'screenshot' && (
              <div className="import-screenshot-panel">
                <button
                  className="screenshot-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => void onDrop(event)}
                >
                  {imagePreview ? (
                    <>
                      <img alt="截图预览" src={imagePreview} />
                      <div className="screenshot-dropzone-copy">
                        <strong>{imageName || '截图预览'}</strong>
                        <span>点按更换图片，或直接重新粘贴新截图</span>
                      </div>
                    </>
                  ) : (
                    <div className="screenshot-dropzone-copy centered">
                      <ImagePlus size={18} />
                      <strong>粘贴截图，或点这里选择图片</strong>
                      <span>支持截图拖入，识别后可继续人工修改</span>
                    </div>
                  )}
                </button>

                <input
                  ref={fileInputRef}
                  accept="image/*"
                  className="hidden-file-input"
                  onChange={(event) => void onImageChange(event)}
                  type="file"
                />

                <div className="ocr-status-row">
                  <div className={`ocr-status-pill ${ocrStatus}`}>
                    {ocrStatus === 'running' && <LoaderCircle size={14} className="spin" />}
                    <span>
                      {ocrStatus === 'idle' && '等待识别'}
                      {ocrStatus === 'running' && `识别中 ${Math.round(ocrProgress * 100)}%`}
                      {ocrStatus === 'success' && '识别完成'}
                      {ocrStatus === 'failed' && '识别失败'}
                    </span>
                  </div>

                  {imagePreview && (
                    <button className="ghost-button compact-retry-button" disabled={ocrStatus === 'running'} onClick={() => void runOcr(imagePreview)}>
                      <Sparkles size={14} />
                      重新识别
                    </button>
                  )}
                </div>

                {ocrError && <div className="import-inline-error">{ocrError}</div>}
              </div>
            )}

            <div className="import-text-shell">
              <div className="import-text-head">
                <strong>{method === 'screenshot' ? '识别结果' : '面经正文'}</strong>
                <span>预计可提取 {questionCountEstimate} 道题</span>
              </div>
              <textarea
                className="import-textarea"
                placeholder={method === 'screenshot' ? 'OCR 结果会落在这里，你可以顺手修正再保存。' : '把整段面经直接贴进来即可，问题和追问可以混在一起。'}
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </div>

            <div className="import-modal-actions">
              <button
                className="ghost-button"
                disabled={props.busy}
                onClick={() => {
                  resetState()
                  props.onClose()
                }}
              >
                取消
              </button>
              <button className="primary-button" disabled={!canSubmit} onClick={() => void handleSubmit()}>
                <Sparkles size={16} />
                {props.busy ? '保存中…' : '保存并更新索引'}
              </button>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}

function readImageFromClipboard(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items ?? [])
  const imageItem = items.find((item) => item.type.startsWith('image/'))
  return imageItem?.getAsFile() ?? null
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.readAsDataURL(file)
  })
}

function normalizeRecognizedText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function estimateQuestionCount(content: string) {
  const lines = content.split(/\r?\n/)
  let count = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    if (/[?？]$/.test(trimmed) || /^(q[:：.]?|问[:：]?|问题[:：]?)/i.test(trimmed)) {
      count += 1
      continue
    }
    if (/^\d+[.)]\s+/.test(trimmed) && /(什么|如何|为什么|区别|原理|场景|挑战|how|why|what|difference|when)/i.test(trimmed)) {
      count += 1
    }
  }

  return Math.max(1, count)
}
