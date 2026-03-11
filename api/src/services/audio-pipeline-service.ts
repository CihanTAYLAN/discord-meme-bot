import fs from 'node:fs/promises'
import type { Logger } from '../lib/logger.js'
import type {
  BulkSoundPatch,
  ContextAnalysis,
  PlaybackQueryResponse,
  SegmentRequestMeta,
  SegmentResponse,
  SoundDraft,
  SoundDraftConfirmationInput,
  SoundRecord,
  SoundsListResponse,
  SoundsQuery,
  SoundUpdateInput,
} from '../types/models.js'
import type { AnalysisDraftStore } from './analysis-draft-store.js'
import {
  buildContextRepresentation,
  type ContextAnalyzer,
} from './context-analyzer.js'
import type { EmbeddingService } from './embedding-service.js'
import type { FileSoundCatalog } from './file-sound-catalog.js'
import type { PythonWhisperWorker } from './python-whisper-worker.js'
import type { SemanticPendingStore } from './semantic-pending-store.js'
import type { VectorDbService } from './vector-db.js'

const applyEditablePatch = <
  T extends {
    audioCues: string[]
    category: string
    labels: string[]
    mood: string
    primaryContext: string
    primaryTone: string
    summary: string
    topicHints: string[]
    transcript: string
  },
>(
  entity: T,
  patch: SoundUpdateInput,
): T => ({
  ...entity,
  ...patch,
  audioCues: patch.audioCues ? [...patch.audioCues] : entity.audioCues,
  labels: patch.labels ? [...patch.labels] : entity.labels,
  topicHints: patch.topicHints ? [...patch.topicHints] : entity.topicHints,
})

const toAnalysisFromEntity = (
  entity: Pick<
    SoundRecord | SoundDraft,
    | 'audioCues'
    | 'category'
    | 'labels'
    | 'metadata'
    | 'mood'
    | 'primaryContext'
    | 'primaryTone'
    | 'summary'
    | 'topicHints'
    | 'transcript'
  >,
): ContextAnalysis => ({
  audioCues: [...entity.audioCues],
  category: entity.category,
  labels: [...entity.labels],
  metadata: entity.metadata,
  mood: entity.mood,
  primaryContext: entity.primaryContext,
  primaryTone: entity.primaryTone,
  representation: buildContextRepresentation(entity),
  summary: entity.summary,
  topicHints: [...entity.topicHints],
})

const createTextQueryTranscription = (query: string) => {
  const text = query.replace(/\s+/g, ' ').trim()
  const tokenCount = text.split(/\s+/).filter(Boolean).length
  const durationSeconds = Math.max(1.2, Math.min(8, tokenCount / 2.4))
  const hasExclamation = text.includes('!')
  const hasQuestion = text.includes('?')

  return {
    audioMetrics: {
      averageEnergy: hasExclamation ? 0.08 : 0.05,
      dynamicRange: hasExclamation ? 0.18 : 0.1,
      peakEnergy: hasExclamation ? 0.68 : 0.42,
      silenceRatio: hasQuestion ? 0.24 : 0.16,
      speechBursts: hasQuestion ? 2 : 1,
      voicedRatio: 0.9,
      zeroCrossingRate: 0.08,
    },
    durationSeconds,
    language: 'und',
    segments: [
      {
        end: durationSeconds,
        start: 0,
        text,
      },
    ],
    text,
  }
}

export class AudioPipelineService {
  constructor(
    private readonly whisperWorker: PythonWhisperWorker,
    private readonly contextAnalyzer: ContextAnalyzer,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorDb: VectorDbService,
    private readonly catalog: FileSoundCatalog,
    private readonly draftStore: AnalysisDraftStore,
    private readonly pendingStore: SemanticPendingStore,
    private readonly similarityThreshold: number,
    private readonly chromaResultsLimit: number,
    private readonly logger: Logger,
  ) {}

  async listSounds(query: Partial<SoundsQuery>): Promise<SoundsListResponse> {
    return this.catalog.list(query)
  }

  async listDrafts(): Promise<SoundDraft[]> {
    return this.draftStore.list()
  }

  async getDraftById(id: string): Promise<SoundDraft | null> {
    return this.draftStore.findById(id)
  }

  async getSoundById(id: string): Promise<SoundRecord | null> {
    return this.catalog.findById(id)
  }

  async handleTextPlaybackQuery(query: string): Promise<PlaybackQueryResponse> {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim()

    if (!normalizedQuery) {
      return {
        labels: ['boş sorgu'],
        similarity: null,
        status: 'no_match',
        summary: 'Boş sorgu için eşleşme aranmadı.',
        transcript: '',
      }
    }

    const transcription = createTextQueryTranscription(normalizedQuery)
    const analysis = await this.contextAnalyzer.analyze(
      transcription,
      transcription.durationSeconds * 1000,
    )
    const embedding = await this.embeddingService.embedText(
      analysis.representation,
    )
    const match = await this.findBestMatch(embedding, analysis)

    if (!match) {
      return {
        labels: analysis.labels,
        similarity: null,
        status: 'no_match',
        summary: analysis.summary,
        transcript: normalizedQuery,
      }
    }

    return {
      labels: analysis.labels,
      match,
      status: 'matched',
      summary: analysis.summary,
      transcript: normalizedQuery,
    }
  }

  async handleLiveSegment(
    filePath: string,
    meta: SegmentRequestMeta,
  ): Promise<SegmentResponse> {
    try {
      const transcription = await this.whisperWorker.transcribe(filePath)
      const pendingDecision = this.pendingStore.consume(meta, transcription)

      if (
        pendingDecision.status === 'pending' ||
        !pendingDecision.transcription
      ) {
        return { status: 'pending' }
      }

      const analysis = await this.contextAnalyzer.analyze(
        pendingDecision.transcription,
        Math.max(
          meta.durationMs,
          pendingDecision.transcription.durationSeconds * 1000,
        ),
      )
      const embedding = await this.embeddingService.embedText(
        analysis.representation,
      )
      const match = await this.findBestMatch(embedding, analysis)

      if (!match) {
        return {
          labels: analysis.labels,
          similarity: null,
          status: 'no_match',
          summary: analysis.summary,
          transcript: pendingDecision.transcription.text,
        }
      }

      return {
        labels: analysis.labels,
        match,
        status: 'matched',
        summary: analysis.summary,
        transcript: pendingDecision.transcription.text,
      }
    } catch (error) {
      this.logger.error('Failed to process live segment', error, meta)
      throw error
    } finally {
      await fs.unlink(filePath).catch(() => undefined)
    }
  }

  async createDraft(
    filePath: string,
    fileName: string,
    fileSizeBytes: number,
  ): Promise<SoundDraft> {
    try {
      const transcription = await this.whisperWorker.transcribe(filePath)
      const analysis = await this.contextAnalyzer.analyze(
        transcription,
        transcription.durationSeconds * 1000,
      )

      return this.draftStore.create({
        audioCues: analysis.audioCues,
        category: analysis.category,
        durationSeconds: transcription.durationSeconds,
        fileName,
        filePath,
        fileSizeBytes,
        labels: analysis.labels,
        language: transcription.language,
        metadata: analysis.metadata,
        mood: analysis.mood,
        primaryContext: analysis.primaryContext,
        primaryTone: analysis.primaryTone,
        summary: analysis.summary,
        topicHints: analysis.topicHints,
        transcript: transcription.text,
      })
    } catch (error) {
      this.logger.error('Failed to create upload draft', error, { fileName })
      throw error
    }
  }

  async confirmDraft(
    draftId: string,
    patch: SoundDraftConfirmationInput,
  ): Promise<SoundRecord | null> {
    const draft = await this.draftStore.findById(draftId)

    if (!draft) {
      return null
    }

    const finalDraft = applyEditablePatch(draft, patch)
    const record = await this.catalog.create({
      audioCues: finalDraft.audioCues,
      category: finalDraft.category,
      durationSeconds: finalDraft.durationSeconds,
      fileName: finalDraft.fileName,
      filePath: finalDraft.filePath,
      fileSizeBytes: finalDraft.fileSizeBytes,
      labels: finalDraft.labels,
      language: finalDraft.language,
      metadata: finalDraft.metadata,
      mood: finalDraft.mood,
      primaryContext: finalDraft.primaryContext,
      primaryTone: finalDraft.primaryTone,
      summary: finalDraft.summary,
      topicHints: finalDraft.topicHints,
      transcript: finalDraft.transcript,
    })
    await this.reindexRecord(record)
    await this.draftStore.delete(draftId)
    return record
  }

  async discardDraft(draftId: string): Promise<boolean> {
    const draft = await this.draftStore.delete(draftId)

    if (!draft) {
      return false
    }

    await fs.unlink(draft.filePath).catch(() => undefined)
    return true
  }

  async updateSound(
    soundId: string,
    patch: SoundUpdateInput,
  ): Promise<SoundRecord | null> {
    const updated = await this.catalog.update(soundId, patch)

    if (!updated) {
      return null
    }

    await this.reindexRecord(updated)
    return updated
  }

  async bulkUpdateSounds(
    ids: string[],
    patch: BulkSoundPatch,
  ): Promise<SoundRecord[]> {
    const updated = await this.catalog.bulkUpdate(ids, patch)
    await Promise.all(updated.map((record) => this.reindexRecord(record)))
    return updated
  }

  async bulkDeleteSounds(ids: string[]): Promise<number> {
    const removed = await this.catalog.deleteMany(ids)
    await this.vectorDb.delete(removed.map((record) => record.id))
    await Promise.all(
      removed.map((record) =>
        fs.unlink(record.filePath).catch(() => undefined),
      ),
    )
    return removed.length
  }

  private async reindexRecord(record: SoundRecord): Promise<void> {
    const analysis = toAnalysisFromEntity(record)
    const embedding = await this.embeddingService.embedText(
      analysis.representation,
    )
    await this.vectorDb.upsert(record, embedding, analysis)
  }

  private async findBestMatch(embedding: number[], analysis: ContextAnalysis) {
    const filteredMatches = await this.vectorDb.querySimilar(
      embedding,
      analysis,
      this.chromaResultsLimit,
      true,
    )
    const allMatches =
      filteredMatches.length > 0
        ? filteredMatches
        : await this.vectorDb.querySimilar(
            embedding,
            analysis,
            this.chromaResultsLimit,
            false,
          )

    const candidate = allMatches.find(
      (match) => match.similarity >= this.similarityThreshold,
    )

    if (!candidate) {
      return null
    }

    const soundRecord = await this.catalog.findById(candidate.soundId)

    if (!soundRecord) {
      return null
    }

    return {
      fileName: soundRecord.fileName,
      filePath: soundRecord.filePath,
      similarity: candidate.similarity,
      soundId: soundRecord.id,
    }
  }
}
