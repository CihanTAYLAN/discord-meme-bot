import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureJsonArrayFile } from '../lib/file-system.js'
import type { Logger } from '../lib/logger.js'
import type {
  BulkSoundPatch,
  SoundRecord,
  SoundsListFacets,
  SoundsListResponse,
  SoundsQuery,
  SoundUpdateInput,
} from '../types/models.js'

const normalize = (value: string) => value.toLocaleLowerCase('tr-TR')

const toUniqueSorted = (values: string[]) =>
  [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'tr'),
  )

const matchesFullText = (record: SoundRecord, query: string) => {
  const haystack = normalize(
    [
      record.fileName,
      record.summary,
      record.transcript,
      record.category,
      record.mood,
      record.primaryContext,
      record.primaryTone,
      ...record.labels,
      ...record.topicHints,
      ...record.audioCues,
    ].join(' '),
  )

  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((part) => haystack.includes(part))
}

const sortRecords = (
  records: SoundRecord[],
  sortBy: SoundsQuery['sortBy'],
): SoundRecord[] =>
  [...records].sort((left, right) => {
    switch (sortBy) {
      case 'createdAt:asc':
        return left.createdAt.localeCompare(right.createdAt)
      case 'duration:asc':
        return left.durationSeconds - right.durationSeconds
      case 'duration:desc':
        return right.durationSeconds - left.durationSeconds
      case 'fileName:asc':
        return left.fileName.localeCompare(right.fileName, 'tr')
      default:
        return right.createdAt.localeCompare(left.createdAt)
    }
  })

const defaultQuery: SoundsQuery = {
  page: 1,
  pageSize: 12,
  sortBy: 'createdAt:desc',
}

export class FileSoundCatalog {
  private readonly filePath: string
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    dataDirectory: string,
    private readonly logger: Logger,
  ) {
    this.filePath = path.join(dataDirectory, 'sounds.json')
  }

  async initialize(): Promise<void> {
    await ensureJsonArrayFile(this.filePath)
  }

  async create(
    input: Omit<SoundRecord, 'createdAt' | 'id' | 'updatedAt'>,
  ): Promise<SoundRecord> {
    const timestamp = new Date().toISOString()
    const record: SoundRecord = {
      ...input,
      createdAt: timestamp,
      id: randomUUID(),
      updatedAt: timestamp,
    }

    await this.runSerialized(async () => {
      const records = await this.readAll()
      records.unshift(record)
      await this.writeAll(records)
    })

    this.logger.info('Persisted sound record', {
      fileName: record.fileName,
      id: record.id,
    })

    return record
  }

  async findById(id: string): Promise<SoundRecord | null> {
    const records = await this.readAll()
    return records.find((record) => record.id === id) ?? null
  }

  async list(query: Partial<SoundsQuery> = {}): Promise<SoundsListResponse> {
    const mergedQuery: SoundsQuery = {
      ...defaultQuery,
      ...query,
      page: Math.max(1, query.page ?? defaultQuery.page),
      pageSize: Math.max(
        1,
        Math.min(48, query.pageSize ?? defaultQuery.pageSize),
      ),
    }
    const records = await this.readAll()
    const queryText = normalize(mergedQuery.query ?? '')
    const filtered = records.filter((record) => {
      if (queryText && !matchesFullText(record, queryText)) {
        return false
      }

      if (
        mergedQuery.labels?.length &&
        !mergedQuery.labels.some((label) => record.labels.includes(label))
      ) {
        return false
      }

      if (
        mergedQuery.categories?.length &&
        !mergedQuery.categories.includes(record.category)
      ) {
        return false
      }

      if (
        mergedQuery.moods?.length &&
        !mergedQuery.moods.includes(record.mood)
      ) {
        return false
      }

      if (
        mergedQuery.languages?.length &&
        !mergedQuery.languages.includes(record.language)
      ) {
        return false
      }

      if (
        typeof mergedQuery.minDurationSeconds === 'number' &&
        record.durationSeconds < mergedQuery.minDurationSeconds
      ) {
        return false
      }

      if (
        typeof mergedQuery.maxDurationSeconds === 'number' &&
        record.durationSeconds > mergedQuery.maxDurationSeconds
      ) {
        return false
      }

      if (
        mergedQuery.dateFrom &&
        record.createdAt < new Date(mergedQuery.dateFrom).toISOString()
      ) {
        return false
      }

      if (
        mergedQuery.dateTo &&
        record.createdAt > new Date(mergedQuery.dateTo).toISOString()
      ) {
        return false
      }

      return true
    })
    const sorted = sortRecords(filtered, mergedQuery.sortBy)
    const total = sorted.length
    const totalPages = Math.max(1, Math.ceil(total / mergedQuery.pageSize))
    const boundedPage = Math.min(mergedQuery.page, totalPages)
    const start = (boundedPage - 1) * mergedQuery.pageSize
    const items = sorted.slice(start, start + mergedQuery.pageSize)

    return {
      facets: this.buildFacets(records),
      items,
      page: boundedPage,
      pageSize: mergedQuery.pageSize,
      total,
      totalPages,
    }
  }

  async update(
    id: string,
    patch: SoundUpdateInput,
  ): Promise<SoundRecord | null> {
    return this.runSerialized(async () => {
      const records = await this.readAll()
      const index = records.findIndex((record) => record.id === id)

      if (index < 0) {
        return null
      }

      const current = records[index]

      if (!current) {
        return null
      }

      const nextRecord: SoundRecord = {
        ...current,
        ...patch,
        labels: patch.labels ? [...patch.labels] : current.labels,
        audioCues: patch.audioCues ? [...patch.audioCues] : current.audioCues,
        topicHints: patch.topicHints
          ? [...patch.topicHints]
          : current.topicHints,
        updatedAt: new Date().toISOString(),
      }

      records[index] = nextRecord
      await this.writeAll(records)
      return nextRecord
    })
  }

  async bulkUpdate(
    ids: string[],
    patch: BulkSoundPatch,
  ): Promise<SoundRecord[]> {
    return this.runSerialized(async () => {
      const records = await this.readAll()
      const updated: SoundRecord[] = []
      const timestamp = new Date().toISOString()

      const nextRecords = records.map((record) => {
        if (!ids.includes(record.id)) {
          return record
        }

        const nextRecord: SoundRecord = {
          ...record,
          ...patch,
          labels: patch.labels ? [...patch.labels] : record.labels,
          audioCues: patch.audioCues ? [...patch.audioCues] : record.audioCues,
          topicHints: patch.topicHints
            ? [...patch.topicHints]
            : record.topicHints,
          updatedAt: timestamp,
        }
        updated.push(nextRecord)
        return nextRecord
      })

      await this.writeAll(nextRecords)
      return updated
    })
  }

  async deleteMany(ids: string[]): Promise<SoundRecord[]> {
    return this.runSerialized(async () => {
      const records = await this.readAll()
      const removed = records.filter((record) => ids.includes(record.id))
      const kept = records.filter((record) => !ids.includes(record.id))

      if (removed.length > 0) {
        await this.writeAll(kept)
      }

      return removed
    })
  }

  private buildFacets(records: SoundRecord[]): SoundsListFacets {
    return {
      categories: toUniqueSorted(records.map((record) => record.category)),
      labels: toUniqueSorted(records.flatMap((record) => record.labels)),
      languages: toUniqueSorted(records.map((record) => record.language)),
      moods: toUniqueSorted(records.map((record) => record.mood)),
    }
  }

  private async readAll(): Promise<SoundRecord[]> {
    await ensureJsonArrayFile(this.filePath)
    const fileContents = await fs.readFile(this.filePath, 'utf8')

    try {
      return JSON.parse(fileContents) as SoundRecord[]
    } catch (error) {
      this.logger.error('Failed to parse sound catalog; resetting file', error)
      await fs.writeFile(this.filePath, '[]\n', 'utf8')
      return []
    }
  }

  private async writeAll(records: SoundRecord[]) {
    await fs.writeFile(this.filePath, JSON.stringify(records, null, 2), 'utf8')
  }

  private async runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const previousTask = this.queue
    let releaseTask = () => {}

    this.queue = new Promise<void>((resolve) => {
      releaseTask = resolve
    })

    await previousTask

    try {
      return await operation()
    } finally {
      releaseTask()
    }
  }
}
