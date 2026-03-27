import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  FolderInput,
  GitBranch,
  Palette,
  Play,
  RefreshCw,
  Save,
  Settings2,
  Square,
  Wand2,
  X
} from 'lucide-react'

import type {
  AgentJob,
  IndexJobStatus,
  SourcesConfig,
  SourcesSettingsSnapshot,
  UiTypographySettings
} from './types'

type DrawerProps = {
  className?: string
  children: ReactNode
  description?: ReactNode
  headerActions?: ReactNode
  icon?: ReactNode
  onClose: () => void
  open: boolean
  title: string
}

export function SettingsDrawer(props: {
  busy: boolean
  draftConfig: SourcesConfig | null
  indexJob: IndexJobStatus | null
  onClose: () => void
  onDraftChange: (next: SourcesConfig) => void
  onResetDefaults: () => void
  onSave: () => void
  onStartBuild: () => void
  onThemeChange: (themeId: string) => void
  onTypographyChange: (next: UiTypographySettings) => void
  open: boolean
  settings: SourcesSettingsSnapshot | null
  themeId: string
  themes: Array<{
    hint: string
    id: string
    label: string
    swatches: [string, string, string]
  }>
  typography: UiTypographySettings
}) {
  const draft = props.draftConfig

  return (
    <OverlayDrawer icon={<Settings2 size={18} />} onClose={props.onClose} open={props.open} title="设置">
      {!draft || !props.settings ? (
        <div className="control-empty">正在载入来源配置…</div>
      ) : (
        <div className="control-panel-body">
          <section className="control-card">
            <div className="control-card-head">
              <div>
                <strong>来源</strong>
                <p>主线、面经、mywork</p>
              </div>
              <button className="ghost-button" onClick={props.onResetDefaults}>恢复默认</button>
            </div>

            <div className="settings-tip-grid compact">
              <div className="settings-tip-card">
                <strong>Codex</strong>
                <p>先确认本机可用 `codex-cli`。</p>
              </div>
              <div className="settings-tip-card">
                <strong>自动发现</strong>
                <p>{props.settings.discoveredSources.guides.length} 个文档源 · {props.settings.discoveredSources.questionBanks.length} 个题库源</p>
              </div>
            </div>

            <SourceGroupEditor
              items={draft.guides}
              label="主线文档"
              onChange={(items) => props.onDraftChange({ ...draft, guides: items })}
              templateKind="guide"
            />

            <SourceGroupEditor
              items={draft.questionBanks}
              label="面经题库"
              onChange={(items) => props.onDraftChange({ ...draft, questionBanks: items })}
              templateKind="question_bank"
            />

            <WorkSourceEditor
              autoDetectedMyWorkPath={props.settings.autoDetectedMyWorkPath}
              value={draft.myWork}
              onChange={(myWork) => props.onDraftChange({ ...draft, myWork })}
            />

            <div className="settings-actions">
              <button className="ghost-button" disabled={props.busy} onClick={props.onSave}>
                <Save size={16} />
                只保存配置
              </button>
              <button className="primary-button" disabled={props.busy} onClick={props.onStartBuild}>
                <Wand2 size={16} />
                保存并重建索引
              </button>
            </div>
          </section>

          <section className="control-card">
            <div className="control-card-head">
              <div>
                <strong>外观</strong>
                <p>主题和字号只影响当前浏览器。</p>
              </div>
            </div>

            <div className="theme-picker-grid">
              {props.themes.map((theme) => (
                <button
                  key={theme.id}
                  className={`theme-picker-card ${props.themeId === theme.id ? 'active' : ''}`}
                  onClick={() => props.onThemeChange(theme.id)}
                >
                  <div className="theme-picker-head">
                    <div className="theme-picker-label">
                      <Palette size={14} />
                      <strong>{theme.label}</strong>
                    </div>
                    <span>{theme.hint}</span>
                  </div>
                  <div className="theme-swatch-row">
                    {theme.swatches.map((color) => (
                      <span key={`${theme.id}-${color}`} className="theme-swatch-dot" style={{ background: color }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <TypographySlider
              label="正文"
              max={24}
              min={16}
              onChange={(value) => props.onTypographyChange({ ...props.typography, docFontSize: value })}
              step={0.5}
              value={props.typography.docFontSize}
            />
            <TypographySlider
              label="标题倍率"
              max={1.35}
              min={0.92}
              onChange={(value) => props.onTypographyChange({ ...props.typography, docHeadingScale: value })}
              step={0.01}
              value={props.typography.docHeadingScale}
            />
            <TypographySlider
              label="侧边栏"
              max={17}
              min={12}
              onChange={(value) => props.onTypographyChange({ ...props.typography, sidebarFontSize: value })}
              step={0.5}
              value={props.typography.sidebarFontSize}
            />
            <TypographySlider
              label="答案卡片"
              max={20}
              min={13}
              onChange={(value) => props.onTypographyChange({ ...props.typography, answerFontSize: value })}
              step={0.5}
              value={props.typography.answerFontSize}
            />
          </section>

          {props.indexJob && (
            <section className="control-card mixer-card">
              <div className="control-card-head">
                <div>
                  <strong>索引</strong>
                  <p>{props.indexJob.summary}</p>
                </div>
                <span className={`pill ${props.indexJob.status === 'ready' ? 'success' : ''}`}>
                  {describeJobStatus(props.indexJob.status)}
                </span>
              </div>

              <div className="index-progress-shell">
                <div className="index-progress-bar">
                  <div style={{ width: `${Math.round(props.indexJob.progress * 100)}%` }} />
                </div>
                <strong>{Math.round(props.indexJob.progress * 100)}%</strong>
              </div>

              {props.indexJob.configSummary && (
                <div className="settings-meta-grid">
                  <div className="settings-meta-chip">
                    <span>主线</span>
                    <strong>{props.indexJob.configSummary.guideCount}</strong>
                  </div>
                  <div className="settings-meta-chip">
                    <span>题库</span>
                    <strong>{props.indexJob.configSummary.questionBankCount}</strong>
                  </div>
                  <div className="settings-meta-chip wide">
                    <span>mywork</span>
                    <strong>{props.indexJob.configSummary.myWorkSource}</strong>
                  </div>
                </div>
              )}

              <div className="job-log-list">
                {props.indexJob.logs.slice(-10).map((line, index) => (
                  <div key={`${props.indexJob!.id}-${index}`} className="job-log-line">{line}</div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </OverlayDrawer>
  )
}

export function JobsDrawer(props: {
  jobs: AgentJob[]
  onCancel: (jobId: string) => void
  onClose: () => void
  onPromptDraftChange: (value: string) => void
  onRerun: (jobId: string, prompt: string) => void
  onSelectJob: (jobId: string) => void
  open: boolean
  promptDraft: string
  selectedJob: AgentJob | null
}) {
  const running = props.jobs.filter((job) => job.status === 'queued' || job.status === 'running')
  const history = props.jobs.filter((job) => job.status !== 'queued' && job.status !== 'running')

  return (
    <OverlayDrawer icon={<Bot size={18} />} onClose={props.onClose} open={props.open} title="任务">
      <div className="control-panel-body two-column">
        <section className="control-card">
          <div className="control-card-head">
            <div>
              <strong>运行中</strong>
              <p>{running.length} 个任务</p>
            </div>
          </div>

          <div className="agent-job-section">
            <span className="agent-group-title">正在运行</span>
            <div className="agent-job-list">
              {(running.length > 0 ? running : history.slice(0, 8)).map((job) => (
                <button
                  key={job.id}
                  className={`agent-job-card ${props.selectedJob?.id === job.id ? 'active' : ''}`}
                  onClick={() => props.onSelectJob(job.id)}
                >
                  <div className="agent-job-top">
                    <span className={`pill subtle kind-${job.kind}`}>{describeJobKind(job.kind)}</span>
                    <span className={`pill ${job.status === 'ready' ? 'success' : ''}`}>{describeJobStatus(job.status)}</span>
                  </div>
                  <strong>{readJobTitle(job)}</strong>
                  <p>{job.summary ?? readJobSummary(job)}</p>
                  <small>{job.stage ?? 'queued'}</small>
                </button>
              ))}
            </div>
          </div>

          {history.length > 0 && (
            <div className="agent-job-section">
              <span className="agent-group-title">最近完成</span>
              <div className="agent-job-list compact">
                {history.slice(0, 10).map((job) => (
                  <button
                    key={job.id}
                    className={`agent-job-card compact ${props.selectedJob?.id === job.id ? 'active' : ''}`}
                    onClick={() => props.onSelectJob(job.id)}
                  >
                    <div className="agent-job-top">
                      <span className={`pill subtle kind-${job.kind}`}>{describeJobKind(job.kind)}</span>
                      <span className={`pill ${job.status === 'ready' ? 'success' : ''}`}>{describeJobStatus(job.status)}</span>
                    </div>
                    <strong>{readJobTitle(job)}</strong>
                    <p>{job.summary ?? readJobSummary(job)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="control-card">
          {props.selectedJob ? (
            <>
              <div className="control-card-head">
                <div>
                  <strong>{readJobTitle(props.selectedJob)}</strong>
                  <p>{props.selectedJob.summary ?? readJobSummary(props.selectedJob)}</p>
                </div>
                <div className="job-action-row">
                  {(props.selectedJob.status === 'queued' || props.selectedJob.status === 'running') && (
                    <button className="ghost-button danger-button" onClick={() => props.onCancel(props.selectedJob!.id)}>
                      <Square size={15} />
                      停止
                    </button>
                  )}
                  {props.selectedJob.kind !== 'index' && (
                    <button
                      className="ghost-button"
                      onClick={() => props.onRerun(props.selectedJob!.id, props.promptDraft)}
                    >
                      <RefreshCw size={15} />
                      重跑
                    </button>
                  )}
                </div>
              </div>

              <div className="settings-meta-grid">
                <div className="settings-meta-chip">
                  <span>类型</span>
                  <strong>{describeJobKind(props.selectedJob.kind)}</strong>
                </div>
                {'model' in props.selectedJob && (
                  <div className="settings-meta-chip">
                    <span>模型</span>
                    <strong>{props.selectedJob.model}</strong>
                  </div>
                )}
                {'reasoningEffort' in props.selectedJob && (
                  <div className="settings-meta-chip">
                    <span>effort</span>
                    <strong>{props.selectedJob.reasoningEffort}</strong>
                  </div>
                )}
                <div className="settings-meta-chip">
                  <span>阶段</span>
                  <strong>{props.selectedJob.stage ?? 'queued'}</strong>
                </div>
              </div>

              {'promptPreview' in props.selectedJob ? (
                <div className="prompt-editor-card">
                  <span>Prompt</span>
                  <textarea
                    value={props.promptDraft}
                    onChange={(event) => props.onPromptDraftChange(event.target.value)}
                  />
                </div>
              ) : (
                <div className="control-empty">这个任务类型没有可编辑 prompt。</div>
              )}

              {'liveText' in props.selectedJob && props.selectedJob.liveText && (
                <div className="prompt-editor-card">
                  <span>实时输出</span>
                  <div className="job-live-preview">{props.selectedJob.liveText}</div>
                </div>
              )}

              {'liveLogs' in props.selectedJob && props.selectedJob.liveLogs && props.selectedJob.liveLogs.length > 0 && (
                <div className="job-log-list tall">
                  {props.selectedJob.liveLogs.slice(-24).map((line, index) => (
                    <div key={`${props.selectedJob!.id}-live-log-${index}`} className="job-log-line">{line}</div>
                  ))}
                </div>
              )}

              {'logs' in props.selectedJob && props.selectedJob.logs.length > 0 && (
                <div className="job-log-list tall">
                  {props.selectedJob.logs.slice(-24).map((line, index) => (
                    <div key={`${props.selectedJob!.id}-log-${index}`} className="job-log-line">{line}</div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="control-empty">从左侧选一个任务，就可以看当前阶段、编辑 prompt、终止或重跑。</div>
          )}
        </section>
      </div>
    </OverlayDrawer>
  )
}

export function FirstRunDialog(props: {
  onOpenSettings: () => void
  onQuickStart: () => void
  onSkip: () => void
  open: boolean
  settings: SourcesSettingsSnapshot | null
}) {
  const config = props.settings?.config
  return (
    <AnimatePresence initial={false}>
      {props.open && config && (
        <>
          <motion.div className="overlay-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.section
            className="first-run-dialog"
            initial={{ opacity: 0, scale: 0.98, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
          >
            <div className="first-run-hero">
              <div className="first-run-badge">
                <Settings2 size={16} />
                首次使用
              </div>
              <h2>先接主线文档和题库，再把你自己的工作集挂进来</h2>
              <p>OfferPotato 面向任意领域面试。开始前请先确认本机可用 `codex` / `codex-cli`。默认会直接使用仓库内公开资料，你也可以换成自己的本地目录或 Git 仓库。</p>
            </div>

            <div className="settings-meta-grid">
              <div className="settings-meta-chip">
                <span>主线文档</span>
                <strong>{config.guides.length}</strong>
              </div>
              <div className="settings-meta-chip">
                <span>面经题库</span>
                <strong>{config.questionBanks.length}</strong>
              </div>
              <div className="settings-meta-chip wide">
                <span>mywork</span>
                <strong>{config.myWork.path ?? config.myWork.url ?? config.myWork.id}</strong>
              </div>
            </div>

            <div className="first-run-checklist">
              <div className="settings-tip-card">
                <strong>你需要准备</strong>
                <p>1. `codex` / `codex-cli` 2. 你的工作集目录 3. 至少一套主线文档或默认公开文档源。</p>
              </div>
              <div className="settings-tip-card">
                <strong>默认公开源</strong>
                <p>仓库内 `sources/documents` 和 `sources/question-banks` 会自动识别，开箱即用；之后也能继续扩展成任何领域的文档与题库。</p>
              </div>
            </div>

            <div className="first-run-actions">
              <button className="primary-button" onClick={props.onQuickStart}>
                <Play size={16} />
                一键使用当前默认来源
              </button>
              <button className="ghost-button" onClick={props.onOpenSettings}>
                <FolderInput size={16} />
                先自定义来源
              </button>
              <button className="ghost-button" onClick={props.onSkip}>
                先直接进入
              </button>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  )
}

export function OverlayDrawer(props: DrawerProps) {
  return (
    <AnimatePresence initial={false}>
      {props.open && (
        <>
          <motion.button
            aria-label="Close drawer"
            className="control-drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            onClick={props.onClose}
          />
          <motion.aside
            className={`control-drawer${props.className ? ` ${props.className}` : ''}`}
            initial={{ opacity: 0, x: 34, scale: 0.986 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 28, scale: 0.992 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30, mass: 0.92 }}
          >
            <div className="control-drawer-head">
              <div className="drawer-head-copy">
                <div className="drawer-head-title">
                  {props.icon}
                  <strong>{props.title}</strong>
                </div>
                {props.description ? (
                  <p className="drawer-head-description">{props.description}</p>
                ) : null}
              </div>
              <div className="drawer-head-actions">
                {props.headerActions}
                <button className="ghost-button icon-button" onClick={props.onClose}>
                  <X size={16} />
                </button>
              </div>
            </div>
            {props.children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function SourceGroupEditor(props: {
  items: SourcesConfig['guides'] | SourcesConfig['questionBanks']
  label: string
  onChange: (next: SourcesConfig['guides']) => void
  templateKind: 'guide' | 'question_bank'
}) {
  return (
    <div className="source-group-editor">
      <div className="source-group-head">
        <span>{props.label}</span>
        <button
          className="ghost-button"
          onClick={() => props.onChange([
            ...props.items,
            {
              branch: 'main',
              id: `${props.templateKind}-${props.items.length + 1}`,
              kind: props.templateKind,
              path: '',
              type: 'local'
            }
          ])}
        >
          + 添加
        </button>
      </div>

      <div className="source-entry-list">
        {props.items.map((item, index) => (
          <SourceEntryEditor
            key={`${item.id}-${index}`}
            canRemove={props.items.length > 1 || props.templateKind === 'question_bank'}
            value={item}
            onChange={(next) => {
              const updated = [...props.items]
              updated[index] = next
              props.onChange(updated)
            }}
            onRemove={() => props.onChange(props.items.filter((_, itemIndex) => itemIndex !== index))}
          />
        ))}
      </div>
    </div>
  )
}

function SourceEntryEditor(props: {
  canRemove: boolean
  onChange: (next: SourcesConfig['guides'][number]) => void
  onRemove: () => void
  value: SourcesConfig['guides'][number]
}) {
  const value = props.value
  return (
    <div className="source-entry-card">
      <div className="source-entry-head">
        <input
          className="source-id-input"
          value={value.id}
          onChange={(event) => props.onChange({ ...value, id: event.target.value })}
        />
        <select
          value={value.type}
          onChange={(event) => props.onChange({
            ...value,
            path: event.target.value === 'local' ? value.path ?? '' : undefined,
            type: event.target.value as 'git' | 'local',
            url: event.target.value === 'git' ? value.url ?? '' : undefined
          })}
        >
          <option value="local">本地目录</option>
          <option value="git">Git 仓库</option>
        </select>
        {props.canRemove && (
          <button className="ghost-button danger-button" onClick={props.onRemove}>移除</button>
        )}
      </div>

      {value.type === 'git' ? (
        <label className="field">
          <span><GitBranch size={14} /> Git 地址</span>
          <input value={value.url ?? ''} onChange={(event) => props.onChange({ ...value, url: event.target.value })} />
        </label>
      ) : (
        <label className="field">
          <span><FolderInput size={14} /> 本地目录</span>
          <input value={value.path ?? ''} onChange={(event) => props.onChange({ ...value, path: event.target.value })} />
        </label>
      )}

      {value.type === 'git' && (
        <label className="field">
          <span>分支</span>
          <input value={value.branch ?? 'main'} onChange={(event) => props.onChange({ ...value, branch: event.target.value })} />
        </label>
      )}
    </div>
  )
}

function WorkSourceEditor(props: {
  autoDetectedMyWorkPath: string | null
  onChange: (next: SourcesConfig['myWork']) => void
  value: SourcesConfig['myWork']
}) {
  const value = props.value
  return (
    <div className="source-group-editor">
      <div className="source-group-head">
        <span>个人工作集</span>
        {props.autoDetectedMyWorkPath && (
          <button
            className="ghost-button"
            onClick={() => props.onChange({
              ...value,
              path: props.autoDetectedMyWorkPath ?? value.path
            })}
          >
            使用自动探测路径
          </button>
        )}
      </div>

      <div className="source-entry-card">
        <div className="source-entry-head">
          <input
            className="source-id-input"
            value={value.id}
            onChange={(event) => props.onChange({ ...value, id: event.target.value })}
          />
          <select
            value={value.type}
            onChange={(event) => props.onChange({
              ...value,
              path: event.target.value === 'local' ? value.path ?? '' : undefined,
              type: event.target.value as 'git' | 'local',
              url: event.target.value === 'git' ? value.url ?? '' : undefined
            })}
          >
            <option value="local">本地目录</option>
            <option value="git">Git 仓库</option>
          </select>
        </div>

        {value.type === 'git' ? (
          <label className="field">
            <span><GitBranch size={14} /> Git 地址</span>
            <input value={value.url ?? ''} onChange={(event) => props.onChange({ ...value, url: event.target.value })} />
          </label>
        ) : (
          <label className="field">
            <span><FolderInput size={14} /> mywork 目录</span>
            <input value={value.path ?? ''} onChange={(event) => props.onChange({ ...value, path: event.target.value })} />
          </label>
        )}

        {value.type === 'git' && (
          <label className="field">
            <span>分支</span>
            <input value={value.branch ?? 'main'} onChange={(event) => props.onChange({ ...value, branch: event.target.value })} />
          </label>
        )}

        <label className="field">
          <span>工作 manifest</span>
          <input value={value.manifestPath ?? './config/work-manifest.runtime.json'} onChange={(event) => props.onChange({ ...value, manifestPath: event.target.value })} />
        </label>
      </div>
    </div>
  )
}

function TypographySlider(props: {
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  value: number
}) {
  return (
    <label className="typography-slider">
      <div className="typography-slider-head">
        <span>{props.label}</span>
        <strong>{props.value}</strong>
      </div>
      <input
        max={props.max}
        min={props.min}
        step={props.step}
        type="range"
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </label>
  )
}

function describeJobKind(kind: AgentJob['kind']) {
  if (kind === 'index') {
    return '索引'
  }
  if (kind === 'interviewer') {
    return '面试官'
  }
  if (kind === 'console') {
    return '控制台'
  }
  return '答案'
}

function describeJobStatus(status: AgentJob['status']) {
  if (status === 'running') {
    return '运行中'
  }
  if (status === 'queued') {
    return '排队中'
  }
  if (status === 'ready') {
    return '已完成'
  }
  if (status === 'failed') {
    return '失败'
  }
  return '已取消'
}

function readJobTitle(job: AgentJob) {
  if (job.kind === 'index') {
    return '重建知识索引'
  }
  if (job.kind === 'interviewer') {
    return job.questionText?.trim() || job.seedFollowUp || '压力面'
  }
  if (job.kind === 'console') {
    return job.messagePreview?.trim() || '受管 Codex 会话'
  }
  return job.questionText?.trim() || job.questionId
}

function readJobSummary(job: AgentJob) {
  if (job.kind === 'index') {
    return job.summary
  }
  if (job.kind === 'interviewer') {
    return job.summary ?? job.seedFollowUp ?? '面试官压力面任务'
  }
  if (job.kind === 'console') {
    return job.summary ?? job.messagePreview ?? '受管控制台任务'
  }
  return job.summary ?? job.questionText ?? '个性化答案任务'
}
