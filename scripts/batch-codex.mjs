import { spawn } from 'node:child_process'

import { ROOT_DIR } from './lib.mjs'

const args = parseArgs(process.argv.slice(2))

async function main() {
  const translateEnabled = args.translate !== '0'
  const generateEnabled = args.generate === '1' || args.generate === 'true'

  if (translateEnabled) {
    await runNodeScript('scripts/batch-translate-questions.mjs', buildForwardArgs({
      batchSize: args.translateBatchSize ?? args.batchSize,
      concurrency: args.translateConcurrency ?? args.concurrency,
      effort: args.translateEffort ?? args.effort,
      force: args.forceTranslate,
      limit: args.translateLimit ?? args.limit,
      model: args.translateModel ?? args.model
    }))
  }

  if (generateEnabled) {
    await runNodeScript('scripts/batch-generate.mjs', buildForwardArgs({
      concurrency: args.generateConcurrency ?? args.concurrency,
      effort: args.generateEffort ?? args.effort,
      force: args.forceGenerate,
      limit: args.generateLimit ?? args.answerLimit ?? 20,
      model: args.generateModel ?? args.model
    }))
  }
}

function runNodeScript(scriptPath, forwardedArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...forwardedArgs], {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve(null)
        return
      }
      reject(new Error(`${scriptPath} exited with code ${code}`))
    })
  })
}

function buildForwardArgs(record) {
  const args = []
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === false || value === '') {
      continue
    }
    args.push(`--${key}`)
    if (value !== true) {
      args.push(String(value))
    }
  }
  return args
}

function parseArgs(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (!value.startsWith('--')) {
      continue
    }
    const key = value.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = true
      continue
    }
    parsed[key] = next
    index += 1
  }
  return parsed
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
