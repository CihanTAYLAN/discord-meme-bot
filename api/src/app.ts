import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { registerHealthRoute } from './routes/health.js'
import { registerPlaybackQueriesRoutes } from './routes/playback-queries.js'
import { registerSegmentsRoutes } from './routes/segments.js'
import { registerSoundsRoutes } from './routes/sounds.js'
import type { AnalysisDraftStore } from './services/analysis-draft-store.js'
import type { AudioPipelineService } from './services/audio-pipeline-service.js'

export interface AppDependencies {
  corsOrigin: string
  draftStore: AnalysisDraftStore
  pipelineService: AudioPipelineService
  soundsDirectory: string
  tempDirectory: string
}

export const createApp = async (dependencies: AppDependencies) => {
  const app = Fastify({
    logger: true,
  })

  await app.register(cors, {
    origin: dependencies.corsOrigin,
  })
  await app.register(multipart)

  await registerHealthRoute(app)
  await registerPlaybackQueriesRoutes(app, {
    pipelineService: dependencies.pipelineService,
  })
  await registerSoundsRoutes(app, {
    draftStore: dependencies.draftStore,
    pipelineService: dependencies.pipelineService,
    soundsDirectory: dependencies.soundsDirectory,
  })
  await registerSegmentsRoutes(app, {
    pipelineService: dependencies.pipelineService,
    tempDirectory: dependencies.tempDirectory,
  })

  return app
}
