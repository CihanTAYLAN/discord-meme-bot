import { describe, expect, it } from 'vitest'
import { SemanticPendingStore } from '../services/semantic-pending-store.js'

describe('SemanticPendingStore', () => {
  it('holds incomplete utterances until a later segment completes them', () => {
    const store = new SemanticPendingStore(2500, 600)

    const firstDecision = store.consume(
      {
        durationMs: 9000,
        endedBy: 'max_duration',
        guildId: 'guild-1',
        speakerId: 'user-1',
        speakerName: 'alice',
        tailSilenceMs: 200,
      },
      {
        audioMetrics: {
          averageEnergy: 0.05,
          dynamicRange: 0.12,
          peakEnergy: 0.42,
          silenceRatio: 0.31,
          speechBursts: 2,
          voicedRatio: 0.69,
          zeroCrossingRate: 0.07,
        },
        durationSeconds: 9,
        language: 'tr',
        segments: [],
        text: 'Bir şey diyecektim ama gerçekten',
      },
    )

    expect(firstDecision.status).toBe('pending')

    const secondDecision = store.consume(
      {
        durationMs: 4000,
        endedBy: 'silence',
        guildId: 'guild-1',
        speakerId: 'user-1',
        speakerName: 'alice',
        tailSilenceMs: 1700,
      },
      {
        audioMetrics: {
          averageEnergy: 0.06,
          dynamicRange: 0.15,
          peakEnergy: 0.48,
          silenceRatio: 0.22,
          speechBursts: 1,
          voicedRatio: 0.78,
          zeroCrossingRate: 0.08,
        },
        durationSeconds: 4,
        language: 'tr',
        segments: [],
        text: 'bunu yapan ekip aşırı komik.',
      },
    )

    expect(secondDecision.status).toBe('final')
    expect(secondDecision.transcription?.text).toContain('aşırı komik')
  })
})
