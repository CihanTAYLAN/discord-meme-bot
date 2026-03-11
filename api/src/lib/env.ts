import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)
const projectRoot = path.resolve(currentDirectory, '../../..')
const envFilePath = path.join(projectRoot, '.env')

if (fs.existsSync(envFilePath)) {
  const contents = fs.readFileSync(envFilePath, 'utf8')

  for (const line of contents.split('\n')) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

const readNumber = (key: string, fallback: number): number => {
  const rawValue = process.env[key]

  if (!rawValue) {
    return fallback
  }

  const parsedValue = Number(rawValue)

  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

const readString = (key: string, fallback: string): string =>
  process.env[key]?.trim() || fallback

export interface ApiConfig {
  chromaCollectionName: string
  chromaResultsLimit: number
  chromaUrl: string
  corsOrigin: string
  dataDirectory: string
  embeddingModel: string
  host: string
  port: number
  projectRoot: string
  semanticMergeWindowMs: number
  semanticPendingTailSilenceMs: number
  similarityThreshold: number
  soundsDirectory: string
  tempDirectory: string
  transformersCacheDirectory: string
  whisperBeamSize: number
  whisperComputeType: string
  whisperDevice: string
  whisperLanguage?: string
  whisperModel: string
  whisperWorkerScriptPath: string
}

export const loadApiConfig = (): ApiConfig => {
  const configuredCacheDirectory = readString(
    'TRANSFORMERS_CACHE_DIR',
    './data/transformers-cache',
  )

  return {
    chromaCollectionName: readString('CHROMA_COLLECTION_NAME', 'meme_sounds'),
    chromaResultsLimit: readNumber('CHROMA_RESULTS_LIMIT', 5),
    chromaUrl: readString('CHROMA_URL', 'http://localhost:8000'),
    corsOrigin: readString('CORS_ORIGIN', 'http://localhost:5173'),
    dataDirectory: path.join(projectRoot, 'data'),
    embeddingModel: readString(
      'EMBEDDING_MODEL',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    ),
    host: readString('API_HOST', '0.0.0.0'),
    port: readNumber('API_PORT', 4000),
    projectRoot,
    semanticMergeWindowMs: readNumber('SEMANTIC_MERGE_WINDOW_MS', 2500),
    semanticPendingTailSilenceMs: readNumber(
      'SEMANTIC_PENDING_TAIL_SILENCE_MS',
      600,
    ),
    similarityThreshold: readNumber('SIMILARITY_THRESHOLD', 0.58),
    soundsDirectory: path.join(projectRoot, 'sounds'),
    tempDirectory: path.join(projectRoot, 'temp'),
    transformersCacheDirectory: path.resolve(
      projectRoot,
      configuredCacheDirectory,
    ),
    whisperBeamSize: readNumber('WHISPER_BEAM_SIZE', 1),
    whisperComputeType: readString('WHISPER_COMPUTE_TYPE', 'int8'),
    whisperDevice: readString('WHISPER_DEVICE', 'cpu'),
    whisperLanguage: process.env.WHISPER_LANGUAGE?.trim() || undefined,
    whisperModel: readString('WHISPER_MODEL', 'small'),
    whisperWorkerScriptPath: path.join(
      projectRoot,
      'api',
      'python',
      'whisper_worker.py',
    ),
  }
}
