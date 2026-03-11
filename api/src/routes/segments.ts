import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { FastifyInstance } from 'fastify'
import { createStoredFileName, ensureDirectory } from '../lib/file-system.js'
import type { AudioPipelineService } from '../services/audio-pipeline-service.js'
import type { SegmentRequestMeta } from '../types/models.js'

interface SegmentsRouteDependencies {
  pipelineService: AudioPipelineService
  tempDirectory: string
}

const toNumber = (value: unknown): number => {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

const readMultipartField = (value: unknown): string | undefined => {
  if (!value) {
    return undefined
  }

  if (Array.isArray(value)) {
    return readMultipartField(value[0])
  }

  if (typeof value === 'object' && value !== null && 'value' in value) {
    return String((value as { value?: unknown }).value ?? '')
  }

  return undefined
}

export const registerSegmentsRoutes = async (
  app: FastifyInstance,
  dependencies: SegmentsRouteDependencies,
) => {
  const { pipelineService, tempDirectory } = dependencies
  await ensureDirectory(tempDirectory)

  app.post('/api/v1/segments', async (request, reply) => {
    try {
      const uploadedAudio = await request.file()

      if (!uploadedAudio) {
        return reply.code(400).send({ message: 'audio is required' })
      }

      const storedFileName = createStoredFileName(uploadedAudio.filename)
      const storedFilePath = path.join(tempDirectory, storedFileName)
      await pipeline(uploadedAudio.file, fs.createWriteStream(storedFilePath))

      const fields = uploadedAudio.fields
      const meta: SegmentRequestMeta = {
        durationMs: toNumber(readMultipartField(fields.durationMs)),
        endedBy:
          (readMultipartField(fields.endedBy) as
            | SegmentRequestMeta['endedBy']
            | undefined) ?? 'manual',
        guildId: readMultipartField(fields.guildId) ?? '',
        speakerId: readMultipartField(fields.speakerId) ?? '',
        speakerName: readMultipartField(fields.speakerName) ?? 'unknown',
        tailSilenceMs: toNumber(readMultipartField(fields.tailSilenceMs)),
      }

      if (!meta.guildId || !meta.speakerId) {
        await fs.promises.unlink(storedFilePath).catch(() => undefined)
        return reply.code(400).send({
          message: 'guildId and speakerId are required for segment processing',
        })
      }

      const response = await pipelineService.handleLiveSegment(
        storedFilePath,
        meta,
      )
      return reply.send(response)
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ message: 'failed to process segment' })
    }
  })
}
