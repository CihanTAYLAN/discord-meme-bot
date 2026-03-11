import { createApp } from './app.js'
import { loadApiConfig } from './lib/env.js'
import { ensureDirectory } from './lib/file-system.js'
import { createLogger } from './lib/logger.js'
import { AnalysisDraftStore } from './services/analysis-draft-store.js'
import { AudioPipelineService } from './services/audio-pipeline-service.js'
import { ContextAnalyzer } from './services/context-analyzer.js'
import { EmbeddingService } from './services/embedding-service.js'
import { FileSoundCatalog } from './services/file-sound-catalog.js'
import { PythonWhisperWorker } from './services/python-whisper-worker.js'
import { SemanticPendingStore } from './services/semantic-pending-store.js'
import { VectorDbService } from './services/vector-db.js'

const logger = createLogger('api')

const bootstrap = async () => {
  const config = loadApiConfig()
  await Promise.all([
    ensureDirectory(config.dataDirectory),
    ensureDirectory(config.soundsDirectory),
    ensureDirectory(config.tempDirectory),
    ensureDirectory(config.transformersCacheDirectory),
  ])

  const embeddingService = new EmbeddingService(
    config.embeddingModel,
    config.transformersCacheDirectory,
    createLogger('embedding'),
  )
  await embeddingService.initialize()

  const contextAnalyzer = new ContextAnalyzer(embeddingService)
  await contextAnalyzer.initialize()

  const whisperWorker = new PythonWhisperWorker(
    'python3',
    config.whisperWorkerScriptPath,
    config.whisperModel,
    config.whisperDevice,
    config.whisperComputeType,
    config.whisperBeamSize,
    config.whisperLanguage,
    createLogger('whisper-worker'),
  )
  await whisperWorker.initialize()

  const vectorDb = new VectorDbService(
    config.chromaUrl,
    config.chromaCollectionName,
    createLogger('vector-db'),
  )
  await vectorDb.initialize()

  const catalog = new FileSoundCatalog(
    config.dataDirectory,
    createLogger('catalog'),
  )
  await catalog.initialize()
  const draftStore = new AnalysisDraftStore(
    config.dataDirectory,
    createLogger('draft-store'),
  )
  await draftStore.initialize()

  const pendingStore = new SemanticPendingStore(
    config.semanticMergeWindowMs,
    config.semanticPendingTailSilenceMs,
  )
  const pipelineService = new AudioPipelineService(
    whisperWorker,
    contextAnalyzer,
    embeddingService,
    vectorDb,
    catalog,
    draftStore,
    pendingStore,
    config.similarityThreshold,
    config.chromaResultsLimit,
    createLogger('pipeline'),
  )

  const app = await createApp({
    corsOrigin: config.corsOrigin,
    draftStore,
    pipelineService,
    soundsDirectory: config.soundsDirectory,
    tempDirectory: config.tempDirectory,
  })

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down API')
    await whisperWorker.dispose()
    await app.close()
    process.exit(0)
  })

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    })
    logger.info('API server listening', {
      host: config.host,
      port: config.port,
    })
  } catch (error) {
    logger.error('Failed to start API', error, {
      hint: 'Make sure Chroma is running. You can start it with `yarn dev:chroma`.',
    })
    await whisperWorker.dispose()
    process.exit(1)
  }
}

void bootstrap()
