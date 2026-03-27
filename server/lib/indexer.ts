import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

import { ROOT_DIR, SCRIPTS_DIR } from './constants.js'
import type { OfferPotatoDb } from './db.js'
import {
  ensureRuntimeManifest,
  readSourcesSettingsSnapshot,
  saveRuntimeSourcesConfig,
  type OfferPotatoSourcesConfig
} from './runtimeConfig.js'

const INDEX_PROGRESS_PREFIXES = ['[OfferPotatoProgress]']

type IndexJobStage =
  | 'queued'
  | 'writing_config'
  | 'syncing_sources'
  | 'building_index'
  | 'swapping_database'
  | 'ready'

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
  stage: IndexJobStage
  startedAt: string
  status: 'cancelled' | 'failed' | 'queued' | 'ready' | 'running'
  summary: string
}

type StartIndexOptions = {
  config?: OfferPotatoSourcesConfig
}

export class IndexJobManager {
  private readonly db: OfferPotatoDb
  private readonly jobs = new Map<string, IndexJobStatus>()
  private readonly running = new Map<string, ChildProcess>()

  constructor(db: OfferPotatoDb) {
    this.db = db
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null
  }

  listJobs() {
    return [...this.jobs.values()].sort((left, right) => (
      right.startedAt.localeCompare(left.startedAt)
    ))
  }

  async start(options: StartIndexOptions) {
    const jobId = `index_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const job: IndexJobStatus = {
      id: jobId,
      kind: 'index',
      logs: [],
      progress: 0,
      stage: 'queued',
      startedAt: new Date().toISOString(),
      status: 'queued',
      summary: '等待开始'
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
    job.finishedAt = new Date().toISOString()
    job.summary = '索引任务已取消'
    this.pushLog(job, '索引任务已取消')

    const child = this.running.get(jobId)
    if (child && child.exitCode === null) {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGKILL')
        }
      }, 1000)
    }

    return job
  }

  private async run(jobId: string, options: StartIndexOptions) {
    const job = this.jobs.get(jobId)
    if (!job) {
      return
    }

    const tempDbPath = path.join(ROOT_DIR, 'data', `${jobId}.db`)
    job.status = 'running'

    try {
      job.stage = 'writing_config'
      job.progress = 0.05
      job.summary = '保存运行时配置'
      if (options.config) {
        await saveRuntimeSourcesConfig(options.config)
      } else {
        await ensureRuntimeManifest()
      }

      const snapshot = await readSourcesSettingsSnapshot()
      job.configSummary = {
        guideCount: snapshot.config.guides.length,
        myWorkSource: snapshot.config.myWork.type === 'git'
          ? snapshot.config.myWork.url ?? snapshot.config.myWork.id
          : snapshot.config.myWork.path ?? snapshot.config.myWork.id,
        questionBankCount: snapshot.config.questionBanks.length
      }

      job.stage = 'syncing_sources'
      job.progress = 0.14
      job.summary = '同步远程仓库与本地来源'
      await this.runNodeScript(jobId, 'bootstrap.mjs', {
        onLine: (line) => {
          this.pushLog(job, line)
          if (/bootstrap complete/i.test(line)) {
            job.progress = Math.max(job.progress, 0.26)
            job.summary = '远程来源同步完成'
          }
        }
      })
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        return
      }

      job.stage = 'building_index'
      job.progress = 0.3
      job.summary = '构建分层检索索引与工作文档链接'
      await fs.rm(tempDbPath, { force: true })
      await this.runNodeScript(jobId, 'build-db.mjs', {
        env: {
          OFFERPOTATO_DB_PATH: tempDbPath,
        },
        onLine: (line) => {
          const progressEvent = parseProgressEvent(line)
          if (progressEvent) {
            job.progress = Number((0.3 + progressEvent.progress * 0.6).toFixed(4))
            job.summary = progressEvent.detail
            this.pushLog(job, `${progressEvent.stage}: ${progressEvent.detail}`)
            return
          }
          this.pushLog(job, line)
        }
      })
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        await fs.rm(tempDbPath, { force: true })
        return
      }

      job.stage = 'swapping_database'
      job.progress = 0.94
      job.summary = '热切换数据库并刷新站点索引'
      await this.swapLiveDatabase(tempDbPath)

      job.stage = 'ready'
      job.progress = 1
      job.status = 'ready'
      job.summary = '索引构建完成，页面数据已切换到最新版本'
      job.finishedAt = new Date().toISOString()
      this.pushLog(job, '数据库热切换完成')
    } catch (error) {
      if (this.jobs.get(jobId)?.status === 'cancelled') {
        await fs.rm(tempDbPath, { force: true }).catch(() => {})
        return
      }
      job.status = 'failed'
      job.finishedAt = new Date().toISOString()
      job.error = error instanceof Error ? error.message : String(error)
      job.summary = '索引构建失败'
      this.pushLog(job, `失败: ${job.error}`)
      await fs.rm(tempDbPath, { force: true }).catch(() => {})
    } finally {
      this.running.delete(jobId)
    }
  }

  private async runNodeScript(
    jobId: string,
    scriptName: string,
    options?: {
      env?: Record<string, string>
      onLine?: (line: string) => void
    }
  ) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('node', [path.join(SCRIPTS_DIR, scriptName)], {
        cwd: ROOT_DIR,
        env: {
          ...process.env,
          ...options?.env
        },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.running.set(jobId, child)

      let stdoutBuffer = ''
      let stderrBuffer = ''
      const flushLines = (buffer: string, consume: (line: string) => void) => {
        const parts = buffer.split(/\r?\n/)
        const rest = parts.pop() ?? ''
        for (const line of parts) {
          const trimmed = line.trim()
          if (trimmed) {
            consume(trimmed)
          }
        }
        return rest
      }

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        stdoutBuffer = flushLines(stdoutBuffer, (line) => options?.onLine?.(line))
      })
      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
        stderrBuffer = flushLines(stderrBuffer, (line) => options?.onLine?.(`stderr: ${line}`))
      })

      child.on('close', (code) => {
        if (stdoutBuffer.trim()) {
          options?.onLine?.(stdoutBuffer.trim())
        }
        if (stderrBuffer.trim()) {
          options?.onLine?.(`stderr: ${stderrBuffer.trim()}`)
        }
        if (code === 0) {
          resolve()
          return
        }
        reject(new Error(`${scriptName} exited with code ${code}`))
      })
      child.on('error', reject)
    })
  }

  private async swapLiveDatabase(tempDbPath: string) {
    const livePath = this.db.getPath()
    const backupPath = `${livePath}.bak-${Date.now()}`
    const hadLiveFile = await fileExists(livePath)

    this.db.close()
    try {
      if (hadLiveFile) {
        await fs.rename(livePath, backupPath)
      }
      await fs.rename(tempDbPath, livePath)
      this.db.reopen(livePath)
      if (hadLiveFile) {
        await fs.rm(backupPath, { force: true })
      }
    } catch (error) {
      if (await fileExists(backupPath) && !(await fileExists(livePath))) {
        await fs.rename(backupPath, livePath)
      }
      this.db.reopen(livePath)
      throw error
    }
  }

  private pushLog(job: IndexJobStatus, line: string) {
    const cleaned = stripIndexProgressPrefix(line).trim()
    if (!cleaned) {
      return
    }
    job.logs = [...job.logs.slice(-79), cleaned]
  }
}

function parseProgressEvent(line: string) {
  const prefix = INDEX_PROGRESS_PREFIXES.find((value) => line.startsWith(value))
  if (!prefix) {
    return null
  }
  try {
    const parsed = JSON.parse(line.slice(prefix.length).trim()) as {
      detail?: string
      progress?: number
      stage?: string
    }
    return {
      detail: parsed.detail ?? '正在构建索引',
      progress: typeof parsed.progress === 'number' ? Math.max(0, Math.min(1, parsed.progress)) : 0,
      stage: parsed.stage ?? 'build'
    }
  } catch {
    return null
  }
}

function stripIndexProgressPrefix(line: string) {
  const prefix = INDEX_PROGRESS_PREFIXES.find((value) => line.startsWith(value))
  return prefix ? line.slice(prefix.length) : line
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}
