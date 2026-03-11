import { env, pipeline } from '@huggingface/transformers'
import type { Logger } from '../lib/logger.js'

const createFeatureExtractionPipeline = pipeline as unknown as (
  task: string,
  modelId: string,
) => Promise<
  (input: string, options?: Record<string, unknown>) => Promise<unknown>
>

const normalizeVector = (vector: number[]): number[] => {
  const magnitude = Math.sqrt(
    vector.reduce((accumulator, value) => accumulator + value * value, 0),
  )

  if (magnitude === 0) {
    return vector
  }

  return vector.map((value) => value / magnitude)
}

const toVector = (result: unknown): number[] => {
  if (
    typeof result === 'object' &&
    result !== null &&
    'data' in result &&
    ArrayBuffer.isView((result as { data: unknown }).data)
  ) {
    return Array.from((result as { data: Float32Array }).data)
  }

  if (
    typeof result === 'object' &&
    result !== null &&
    'tolist' in result &&
    typeof (result as { tolist: () => unknown }).tolist === 'function'
  ) {
    const serialized = (result as { tolist: () => unknown }).tolist()

    if (Array.isArray(serialized) && Array.isArray(serialized[0])) {
      return (serialized[0] as number[]).map(Number)
    }

    if (Array.isArray(serialized)) {
      return serialized.map(Number)
    }
  }

  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) {
      return (result[0] as number[]).map(Number)
    }

    return result.map(Number)
  }

  throw new Error('Unsupported embedding output format')
}

export class EmbeddingService {
  private extractorPromise?: Promise<
    (input: string, options?: Record<string, unknown>) => Promise<unknown>
  >

  constructor(
    private readonly modelId: string,
    private readonly cacheDirectory: string,
    private readonly logger: Logger,
  ) {}

  async initialize(): Promise<void> {
    await this.getExtractor()
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embedText(text)))
  }

  async embedText(text: string): Promise<number[]> {
    const extractor = await this.getExtractor()
    const result = await extractor(text, { normalize: true, pooling: 'mean' })
    return normalizeVector(toVector(result))
  }

  private async getExtractor(): Promise<
    (input: string, options?: Record<string, unknown>) => Promise<unknown>
  > {
    if (!this.extractorPromise) {
      this.extractorPromise = this.loadExtractor()
    }

    return this.extractorPromise
  }

  private async loadExtractor(): Promise<
    (input: string, options?: Record<string, unknown>) => Promise<unknown>
  > {
    this.logger.info('Loading embedding model', { modelId: this.modelId })
    env.allowLocalModels = true
    env.allowRemoteModels = true
    env.cacheDir = this.cacheDirectory

    return createFeatureExtractionPipeline('feature-extraction', this.modelId)
  }
}

export const cosineSimilarity = (left: number[], right: number[]): number => {
  const length = Math.min(left.length, right.length)
  let total = 0

  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]

    if (typeof leftValue !== 'number' || typeof rightValue !== 'number') {
      continue
    }

    total += leftValue * rightValue
  }

  return total
}
