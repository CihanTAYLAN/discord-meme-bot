import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { createStoredFileName, ensureDirectory } from '../lib/file-system.js'
import type { AnalysisDraftStore } from '../services/analysis-draft-store.js'
import type { AudioPipelineService } from '../services/audio-pipeline-service.js'

interface SoundsRouteDependencies {
  draftStore: AnalysisDraftStore
  pipelineService: AudioPipelineService
  soundsDirectory: string
}

const supportedMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
])

const maxUploadBytes = 20 * 1024 * 1024

const updateSchema = z
  .object({
    audioCues: z.array(z.string().min(1)).max(8).optional(),
    category: z.string().min(1).max(80).optional(),
    labels: z.array(z.string().min(1).max(80)).max(12).optional(),
    mood: z.string().min(1).max(80).optional(),
    primaryContext: z.string().min(1).max(140).optional(),
    primaryTone: z.string().min(1).max(140).optional(),
    summary: z.string().min(1).max(280).optional(),
    topicHints: z.array(z.string().min(1).max(80)).max(8).optional(),
    transcript: z.string().min(1).max(5000).optional(),
  })
  .strict()

const bulkUpdateSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
    patch: updateSchema,
  })
  .strict()

const bulkDeleteSchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1),
  })
  .strict()

const listQuerySchema = z.object({
  categories: z.array(z.string()).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  labels: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  maxDurationSeconds: z.coerce.number().optional(),
  minDurationSeconds: z.coerce.number().optional(),
  moods: z.array(z.string()).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
  query: z.string().optional(),
  sortBy: z
    .enum([
      'createdAt:asc',
      'createdAt:desc',
      'duration:asc',
      'duration:desc',
      'fileName:asc',
    ])
    .default('createdAt:desc'),
})

const contentTypeByExtension: Record<string, string> = {
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
}

const toArray = (value: unknown): string[] | undefined => {
  if (typeof value === 'undefined') {
    return undefined
  }

  const values = Array.isArray(value) ? value : [value]
  const expanded = values.flatMap((entry) =>
    String(entry)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean),
  )

  return expanded.length > 0 ? expanded : undefined
}

const readListQuery = (input: Record<string, unknown>) =>
  listQuerySchema.parse({
    categories: toArray(input.categories),
    dateFrom: typeof input.dateFrom === 'string' ? input.dateFrom : undefined,
    dateTo: typeof input.dateTo === 'string' ? input.dateTo : undefined,
    labels: toArray(input.labels),
    languages: toArray(input.languages),
    maxDurationSeconds: input.maxDurationSeconds,
    minDurationSeconds: input.minDurationSeconds,
    moods: toArray(input.moods),
    page: input.page,
    pageSize: input.pageSize,
    query: typeof input.query === 'string' ? input.query : undefined,
    sortBy: input.sortBy,
  })

const sendAudioFile = async (reply: FastifyReply, filePath: string) => {
  const extension = path.extname(filePath).toLocaleLowerCase('en-US')
  const contentType =
    contentTypeByExtension[extension] ?? 'application/octet-stream'

  reply.header('Cache-Control', 'public, max-age=300')
  reply.type(contentType)
  return reply.send(fs.createReadStream(filePath))
}

export const registerSoundsRoutes = async (
  app: FastifyInstance,
  dependencies: SoundsRouteDependencies,
) => {
  const { draftStore, pipelineService, soundsDirectory } = dependencies
  await ensureDirectory(soundsDirectory)

  app.get('/api/v1/sounds', async (request, reply) => {
    try {
      const query = readListQuery(request.query as Record<string, unknown>)
      return reply.send(await pipelineService.listSounds(query))
    } catch (error) {
      request.log.error(error)
      return reply.code(400).send({ message: 'invalid sound query parameters' })
    }
  })

  app.get('/api/v1/sounds/drafts', async () => pipelineService.listDrafts())

  app.post('/api/v1/sounds/drafts', async (request, reply) => {
    try {
      const uploadedFile = await request.file({
        limits: {
          fileSize: maxUploadBytes,
        },
      })

      if (!uploadedFile) {
        return reply.code(400).send({ message: 'file is required' })
      }

      const mimeType = uploadedFile.mimetype?.toLocaleLowerCase('en-US')
      const extension = path
        .extname(uploadedFile.filename)
        .toLocaleLowerCase('en-US')

      if (
        !supportedMimeTypes.has(mimeType ?? '') &&
        !['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'].includes(extension)
      ) {
        return reply.code(400).send({
          message:
            'unsupported file format; accepted formats are MP3, WAV, OGG, M4A, AAC, and WEBM',
        })
      }

      const storedFileName = createStoredFileName(uploadedFile.filename)
      const storedFilePath = path.join(soundsDirectory, storedFileName)
      await pipeline(uploadedFile.file, fs.createWriteStream(storedFilePath))

      const fileStats = await fs.promises.stat(storedFilePath)

      if (fileStats.size > maxUploadBytes) {
        await fs.promises.unlink(storedFilePath).catch(() => undefined)
        return reply
          .code(413)
          .send({ message: 'file exceeds the 20 MB upload limit' })
      }

      const draft = await pipelineService.createDraft(
        storedFilePath,
        storedFileName,
        fileStats.size,
      )
      return reply.code(201).send(draft)
    } catch (error) {
      request.log.error(error)
      return reply
        .code(500)
        .send({ message: 'failed to analyze uploaded sound' })
    }
  })

  app.post('/api/v1/sounds/drafts/:id/confirm', async (request, reply) => {
    try {
      const patch = updateSchema.parse(request.body ?? {})
      const record = await pipelineService.confirmDraft(
        String((request.params as { id?: string }).id ?? ''),
        patch,
      )

      if (!record) {
        return reply.code(404).send({ message: 'draft not found' })
      }

      return reply.code(201).send(record)
    } catch (error) {
      request.log.error(error)
      return reply.code(400).send({ message: 'failed to confirm draft' })
    }
  })

  app.delete('/api/v1/sounds/drafts/:id', async (request, reply) => {
    try {
      const draftId = String((request.params as { id?: string }).id ?? '')
      const deleted = await pipelineService.discardDraft(draftId)

      if (!deleted) {
        return reply.code(404).send({ message: 'draft not found' })
      }

      return reply.send({ deleted: true })
    } catch (error) {
      request.log.error(error)
      return reply.code(500).send({ message: 'failed to delete draft' })
    }
  })

  app.get('/api/v1/sounds/drafts/:id/audio', async (request, reply) => {
    const draft = await draftStore.findById(
      String((request.params as { id?: string }).id ?? ''),
    )

    if (!draft) {
      return reply.code(404).send({ message: 'draft not found' })
    }

    return sendAudioFile(reply, draft.filePath)
  })

  app.get('/api/v1/sounds/:id/audio', async (request, reply) => {
    const sound = await pipelineService.getSoundById(
      String((request.params as { id?: string }).id ?? ''),
    )

    if (!sound) {
      return reply.code(404).send({ message: 'sound not found' })
    }

    return sendAudioFile(reply, sound.filePath)
  })

  app.patch('/api/v1/sounds/:id', async (request, reply) => {
    try {
      const patch = updateSchema.parse(request.body ?? {})
      const updated = await pipelineService.updateSound(
        String((request.params as { id?: string }).id ?? ''),
        patch,
      )

      if (!updated) {
        return reply.code(404).send({ message: 'sound not found' })
      }

      return reply.send(updated)
    } catch (error) {
      request.log.error(error)
      return reply.code(400).send({ message: 'failed to update sound' })
    }
  })

  app.post('/api/v1/sounds/bulk-update', async (request, reply) => {
    try {
      const body = bulkUpdateSchema.parse(request.body ?? {})
      const updated = await pipelineService.bulkUpdateSounds(
        body.ids,
        body.patch,
      )
      return reply.send({
        count: updated.length,
        items: updated,
      })
    } catch (error) {
      request.log.error(error)
      return reply.code(400).send({ message: 'failed to bulk update sounds' })
    }
  })

  app.post('/api/v1/sounds/bulk-delete', async (request, reply) => {
    try {
      const body = bulkDeleteSchema.parse(request.body ?? {})
      const deletedCount = await pipelineService.bulkDeleteSounds(body.ids)
      return reply.send({ deletedCount })
    } catch (error) {
      request.log.error(error)
      return reply.code(400).send({ message: 'failed to bulk delete sounds' })
    }
  })
}
