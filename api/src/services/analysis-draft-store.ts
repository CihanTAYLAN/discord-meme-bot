import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureJsonArrayFile } from '../lib/file-system.js'
import type { Logger } from '../lib/logger.js'
import type { SoundDraft } from '../types/models.js'

export class AnalysisDraftStore {
  private readonly filePath: string
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    dataDirectory: string,
    private readonly logger: Logger,
  ) {
    this.filePath = path.join(dataDirectory, 'sound-drafts.json')
  }

  async initialize(): Promise<void> {
    await ensureJsonArrayFile(this.filePath)
  }

  async create(
    input: Omit<SoundDraft, 'createdAt' | 'id' | 'updatedAt'>,
  ): Promise<SoundDraft> {
    const timestamp = new Date().toISOString()
    const draft: SoundDraft = {
      ...input,
      createdAt: timestamp,
      id: randomUUID(),
      updatedAt: timestamp,
    }

    await this.runSerialized(async () => {
      const drafts = await this.readAll()
      drafts.unshift(draft)
      await this.writeAll(drafts)
    })

    this.logger.info('Persisted analysis draft', {
      fileName: draft.fileName,
      id: draft.id,
    })

    return draft
  }

  async findById(id: string): Promise<SoundDraft | null> {
    const drafts = await this.readAll()
    return drafts.find((draft) => draft.id === id) ?? null
  }

  async list(): Promise<SoundDraft[]> {
    const drafts = await this.readAll()
    return [...drafts].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    )
  }

  async delete(id: string): Promise<SoundDraft | null> {
    return this.runSerialized(async () => {
      const drafts = await this.readAll()
      const match = drafts.find((draft) => draft.id === id) ?? null

      if (!match) {
        return null
      }

      await this.writeAll(drafts.filter((draft) => draft.id !== id))
      return match
    })
  }

  private async readAll(): Promise<SoundDraft[]> {
    await ensureJsonArrayFile(this.filePath)
    const fileContents = await fs.readFile(this.filePath, 'utf8')

    try {
      return JSON.parse(fileContents) as SoundDraft[]
    } catch (error) {
      this.logger.error('Failed to parse draft catalog; resetting file', error)
      await fs.writeFile(this.filePath, '[]\n', 'utf8')
      return []
    }
  }

  private async writeAll(records: SoundDraft[]) {
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
