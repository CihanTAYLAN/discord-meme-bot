import { describe, expect, it } from 'vitest'
import { AudioPipelineService } from '../services/audio-pipeline-service.js'
import { SemanticPendingStore } from '../services/semantic-pending-store.js'

class FakeWhisperWorker {
  constructor(private readonly text: string) {}

  async transcribe() {
    return {
      audioMetrics: {
        averageEnergy: 0.08,
        dynamicRange: 0.17,
        peakEnergy: 0.6,
        silenceRatio: 0.24,
        speechBursts: 2,
        voicedRatio: 0.76,
        zeroCrossingRate: 0.08,
      },
      durationSeconds: 4,
      language: 'tr',
      segments: [],
      text: this.text,
    }
  }
}

class FakeContextAnalyzer {
  async analyze() {
    return {
      audioCues: ['yüksek enerji'],
      labels: ['geri ödeme odağı', 'yüksek enerjili çıkış'],
      metadata: {
        deliveryStyle: 'explosive',
        energyBucket: 'high',
        interactionMode: 'exclamation',
        paceBucket: 'fast',
        pauseBucket: 'light',
      },
      primaryContext: 'geri ödeme etrafında ani çıkış',
      primaryTone: 'yüksek enerjili patlayıcı yüklenen',
      representation:
        'summary: geri ödeme çıkışı\ndynamic labels: geri ödeme odağı',
      summary: 'geri ödeme çıkışı',
      topicHints: ['geri ödeme'],
    }
  }
}

class FakeEmbeddingService {
  async embedText() {
    return [1, 0, 0]
  }
}

class FakeCatalog {
  async create(input: Record<string, unknown>) {
    return {
      ...input,
      createdAt: new Date().toISOString(),
      id: 'sound-1',
    }
  }

  async findById(id: string) {
    if (id === 'sound-1') {
      return {
        createdAt: new Date().toISOString(),
        fileName: 'sound.mp3',
        filePath: '/tmp/sound.mp3',
        id: 'sound-1',
        labels: ['geri ödeme odağı'],
        language: 'tr',
        primaryContext: 'geri ödeme etrafında ani çıkış',
        primaryTone: 'yüksek enerjili patlayıcı yüklenen',
        summary: 'geri ödeme çıkışı',
        transcript: 'paramı geri istiyorum',
      }
    }

    return null
  }
}

class FakeDraftStore {
  async create() {
    return null
  }

  async delete() {
    return null
  }

  async findById() {
    return null
  }

  async list() {
    return []
  }
}

class FakeVectorDb {
  async querySimilar() {
    return [
      {
        fileName: 'sound.mp3',
        filePath: '/tmp/sound.mp3',
        similarity: 0.91,
        soundId: 'sound-1',
      },
    ]
  }

  async upsert() {}
}

describe('AudioPipelineService', () => {
  it('returns a matched response when a similar meme exists', async () => {
    const service = new AudioPipelineService(
      new FakeWhisperWorker('paramı geri istiyorum!') as never,
      new FakeContextAnalyzer() as never,
      new FakeEmbeddingService() as never,
      new FakeVectorDb() as never,
      new FakeCatalog() as never,
      new FakeDraftStore() as never,
      new SemanticPendingStore(2500, 600),
      0.6,
      3,
      {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
    )

    const response = await service.handleLiveSegment('/tmp/fake.wav', {
      durationMs: 4000,
      endedBy: 'silence',
      guildId: 'guild-1',
      speakerId: 'speaker-1',
      speakerName: 'Alice',
      tailSilenceMs: 1600,
    })

    expect(response.status).toBe('matched')
    if (response.status === 'matched') {
      expect(response.match.soundId).toBe('sound-1')
    }
  })

  it('returns a matched response for direct text playback queries', async () => {
    const service = new AudioPipelineService(
      new FakeWhisperWorker('paramı geri istiyorum!') as never,
      new FakeContextAnalyzer() as never,
      new FakeEmbeddingService() as never,
      new FakeVectorDb() as never,
      new FakeCatalog() as never,
      new FakeDraftStore() as never,
      new SemanticPendingStore(2500, 600),
      0.6,
      3,
      {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
    )

    const response = await service.handleTextPlaybackQuery(
      'parami geri istiyorum',
    )

    expect(response.status).toBe('matched')
    if (response.status === 'matched') {
      expect(response.match.fileName).toBe('sound.mp3')
    }
  })
})
