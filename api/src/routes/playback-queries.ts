import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AudioPipelineService } from '../services/audio-pipeline-service.js'

interface PlaybackQueriesRouteDependencies {
  pipelineService: AudioPipelineService
}

const querySchema = z
  .object({
    query: z.string().trim().min(1).max(280),
  })
  .strict()

export const registerPlaybackQueriesRoutes = async (
  app: FastifyInstance,
  dependencies: PlaybackQueriesRouteDependencies,
) => {
  app.post('/api/v1/playback/query', async (request, reply) => {
    try {
      const body = querySchema.parse(request.body ?? {})
      return reply.send(
        await dependencies.pipelineService.handleTextPlaybackQuery(body.query),
      )
    } catch (error) {
      request.log.error(error)
      return reply.code(400).send({ message: 'invalid playback query payload' })
    }
  })
}
