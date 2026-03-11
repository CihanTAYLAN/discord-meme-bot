import type { EmbeddingFunction, EmbeddingFunctionSpace } from 'chromadb'
import {
  ChromaClient,
  knownEmbeddingFunctions,
  registerEmbeddingFunction,
} from 'chromadb'
import type { Logger } from '../lib/logger.js'
import type {
  ContextAnalysis,
  SimilarSoundMatch,
  SoundRecord,
} from '../types/models.js'

interface ChromaQueryResponse {
  distances?: number[][]
  ids?: string[][]
  metadatas?: Array<Array<Record<string, unknown>>>
}

class ManualEmbeddingFunction implements EmbeddingFunction {
  static buildFromConfig(): ManualEmbeddingFunction {
    return new ManualEmbeddingFunction()
  }

  name = 'manual-embeddings'

  defaultSpace(): EmbeddingFunctionSpace {
    return 'cosine'
  }

  async generate(): Promise<number[][]> {
    throw new Error(
      'Manual embeddings are required. Provide embeddings explicitly to Chroma operations.',
    )
  }

  getConfig(): Record<string, never> {
    return {}
  }

  supportedSpaces(): EmbeddingFunctionSpace[] {
    return ['cosine']
  }
}

if (!knownEmbeddingFunctions.has('manual-embeddings')) {
  registerEmbeddingFunction('manual-embeddings', ManualEmbeddingFunction)
}

const manualEmbeddingFunction = new ManualEmbeddingFunction()

export class VectorDbService {
  private readonly client: ChromaClient
  private readonly chromaUrl: string
  private collectionPromise?: Promise<
    Awaited<ReturnType<ChromaClient['getOrCreateCollection']>>
  >

  constructor(
    chromaUrl: string,
    private readonly collectionName: string,
    private readonly logger: Logger,
  ) {
    this.chromaUrl = chromaUrl

    const parsedUrl = new URL(chromaUrl)
    const fallbackPort = parsedUrl.protocol === 'https:' ? 443 : 8000

    this.client = new ChromaClient({
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port || fallbackPort),
      ssl: parsedUrl.protocol === 'https:',
    })
  }

  async initialize(): Promise<void> {
    const startedAt = Date.now()
    const timeoutMs = 60_000
    const retryDelayMs = 2_000

    while (Date.now() - startedAt < timeoutMs) {
      try {
        await this.getCollection()
        return
      } catch (error) {
        this.collectionPromise = undefined
        this.logger.warn('Chroma is not ready yet, retrying', {
          error: error instanceof Error ? error.message : String(error),
          retryDelayMs,
        })
        await new Promise((resolve) => {
          setTimeout(resolve, retryDelayMs)
        })
      }
    }

    throw new Error(
      `Could not connect to Chroma at ${this.chromaUrl} within ${timeoutMs}ms`,
    )
  }

  buildWhereClause(
    metadata: ContextAnalysis['metadata'],
  ): Record<string, unknown> | undefined {
    const activeKeys = [
      metadata.interactionMode !== 'statement'
        ? ['interactionMode', metadata.interactionMode]
        : null,
      metadata.deliveryStyle !== 'steady'
        ? ['deliveryStyle', metadata.deliveryStyle]
        : null,
      metadata.energyBucket !== 'medium'
        ? ['energyBucket', metadata.energyBucket]
        : null,
      metadata.paceBucket !== 'steady'
        ? ['paceBucket', metadata.paceBucket]
        : null,
      metadata.pauseBucket !== 'balanced'
        ? ['pauseBucket', metadata.pauseBucket]
        : null,
    ]
      .filter(
        (
          entry,
        ): entry is [
          keyof ContextAnalysis['metadata'],
          ContextAnalysis['metadata'][keyof ContextAnalysis['metadata']],
        ] => entry !== null,
      )
      .slice(0, 2)

    if (activeKeys.length === 0) {
      return undefined
    }

    if (activeKeys.length === 1) {
      const firstEntry = activeKeys[0]

      if (!firstEntry) {
        return undefined
      }

      const [key, value] = firstEntry

      if (!key || !value) {
        return undefined
      }

      return { [key]: value }
    }

    return {
      $and: activeKeys.map(([key, value]) => ({ [key]: value })),
    }
  }

  async querySimilar(
    embedding: number[],
    analysis: ContextAnalysis,
    limit: number,
    useMetadataFilter: boolean,
  ): Promise<SimilarSoundMatch[]> {
    const collection = await this.getCollection()
    const where = useMetadataFilter
      ? this.buildWhereClause(analysis.metadata)
      : undefined
    const queryResult = (await collection.query({
      include: ['distances', 'metadatas'],
      nResults: limit,
      queryEmbeddings: [embedding],
      where: where as never,
    })) as ChromaQueryResponse
    const ids = queryResult.ids?.[0] ?? []
    const distances = queryResult.distances?.[0] ?? []
    const metadatas = queryResult.metadatas?.[0] ?? []

    return ids.map((id, index) => {
      const metadata = metadatas[index] ?? {}
      const distance = distances[index] ?? 1
      return {
        fileName: String(metadata.fileName ?? ''),
        filePath: String(metadata.filePath ?? ''),
        similarity: normalizeSimilarity(distance),
        soundId: String(metadata.soundId ?? id),
      }
    })
  }

  async upsert(
    soundRecord: SoundRecord,
    embedding: number[],
    analysis: ContextAnalysis,
  ): Promise<void> {
    const collection = await this.getCollection()

    await collection.upsert({
      documents: [analysis.representation],
      embeddings: [embedding],
      ids: [soundRecord.id],
      metadatas: [
        {
          createdAt: soundRecord.createdAt,
          fileName: soundRecord.fileName,
          filePath: soundRecord.filePath,
          deliveryStyle: analysis.metadata.deliveryStyle,
          energyBucket: analysis.metadata.energyBucket,
          interactionMode: analysis.metadata.interactionMode,
          language: soundRecord.language,
          paceBucket: analysis.metadata.paceBucket,
          pauseBucket: analysis.metadata.pauseBucket,
          primaryContext: soundRecord.primaryContext,
          primaryTone: soundRecord.primaryTone,
          soundId: soundRecord.id,
          summary: soundRecord.summary,
        },
      ],
    })

    this.logger.info('Upserted sound into Chroma', {
      fileName: soundRecord.fileName,
      id: soundRecord.id,
    })
  }

  async delete(soundIds: string[]): Promise<void> {
    if (soundIds.length === 0) {
      return
    }

    const collection = await this.getCollection()
    await collection.delete({
      ids: soundIds,
    })
    this.logger.info('Deleted sounds from Chroma', {
      count: soundIds.length,
    })
  }

  private async getCollection() {
    if (!this.collectionPromise) {
      this.collectionPromise = this.client.getOrCreateCollection({
        embeddingFunction: manualEmbeddingFunction,
        metadata: {
          'hnsw:space': 'cosine',
        },
        name: this.collectionName,
      })
    }

    return this.collectionPromise
  }
}

export const normalizeSimilarity = (distance: number): number =>
  Math.max(0, Math.min(1, 1 - distance))
