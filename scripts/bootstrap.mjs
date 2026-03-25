import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { promisify } from 'node:util'

import {
  SOURCES_DIR,
  ensureDir,
  nowIso,
  readConfig,
  resolveSourcePath
} from './lib.mjs'

const execFileAsync = promisify(execFile)

async function syncGitSource(source) {
  const targetPath = resolveSourcePath(source)
  try {
    await fs.access(targetPath)
    console.log(`[${nowIso()}] refreshing ${source.id}`)
    await execFileAsync('git', ['-C', targetPath, 'pull', '--ff-only'], { maxBuffer: 8 * 1024 * 1024 })
  } catch {
    console.log(`[${nowIso()}] cloning ${source.id}`)
    await execFileAsync(
      'git',
      ['clone', '--depth', '1', '--branch', source.branch ?? 'main', source.url, targetPath],
      { maxBuffer: 8 * 1024 * 1024 }
    )
  }
}

async function main() {
  await ensureDir(SOURCES_DIR)
  const config = await readConfig()
  const gitSources = [...config.guides, ...config.questionBanks]
  if (config.myWork?.type === 'git') {
    gitSources.push(config.myWork)
  }

  for (const source of gitSources.filter((item) => item.type === 'git')) {
    await syncGitSource(source)
  }

  console.log(`[${nowIso()}] bootstrap complete`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
