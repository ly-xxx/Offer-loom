import path from 'node:path'

import { env, pipeline } from '@xenova/transformers'
import { ProxyAgent, setGlobalDispatcher } from 'undici'

import { DATA_DIR, ensureDir } from './lib.mjs'

const DEFAULT_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
let extractorPromise = null
let proxyConfigured = false

export async function embedTexts(texts, options = {}) {
  if (texts.length === 0) {
    return []
  }
  const extractor = await getExtractor(options.modelId ?? DEFAULT_MODEL)
  const batchSize = options.batchSize ?? 12
  const vectors = []

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize).map((text) => truncateForEmbedding(text))
    const output = await extractor(batch, {
      pooling: 'mean',
      normalize: true
    })
    vectors.push(...toRowVectors(output))
  }

  return vectors
}

export function cosineSimilarity(left, right) {
  if (!left || !right || left.length !== right.length || left.length === 0) {
    return 0
  }

  let sum = 0
  for (let index = 0; index < left.length; index += 1) {
    sum += left[index] * right[index]
  }
  return Number(sum.toFixed(6))
}

export function getEmbeddingModelId() {
  return DEFAULT_MODEL
}

async function getExtractor(modelId) {
  if (!extractorPromise) {
    configureProxyFromEnv()
    env.allowLocalModels = true
    env.allowRemoteModels = true
    env.useBrowserCache = false
    env.cacheDir = path.join(DATA_DIR, 'models')
    await ensureDir(env.cacheDir)
    extractorPromise = pipeline('feature-extraction', modelId)
  }
  return extractorPromise
}

function configureProxyFromEnv() {
  if (proxyConfigured) {
    return
  }
  const proxyUrl = process.env.HTTPS_PROXY
    ?? process.env.https_proxy
    ?? process.env.HTTP_PROXY
    ?? process.env.http_proxy

  if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl))
  }
  proxyConfigured = true
}

function toRowVectors(output) {
  const value = typeof output.tolist === 'function' ? output.tolist() : output
  if (!Array.isArray(value)) {
    return []
  }
  if (Array.isArray(value[0])) {
    return value
  }
  return [value]
}

function truncateForEmbedding(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 2200)
}
