import { describe, expect, it } from 'vitest'
import { ContextAnalyzer } from '../services/context-analyzer.js'

class FakeEmbeddingService {
  async embedText(text: string) {
    return this.embedTextSync(text)
  }

  private embedTextSync(text: string) {
    const lowered = text.toLocaleLowerCase('tr-TR')
    const tokens = lowered.split(/\s+/).filter(Boolean)
    return [
      tokens.includes('paramı') || tokens.includes('geri') ? 1 : 0,
      tokens.includes('istiyorum') ? 1 : 0,
      tokens.includes('olmaz') ? 1 : 0,
      lowered.includes('!') ? 1 : 0,
      tokens.length / 20,
    ]
  }
}

describe('ContextAnalyzer', () => {
  it('builds dynamic tags from transcript content and audio profile', async () => {
    const analyzer = new ContextAnalyzer(new FakeEmbeddingService() as never)
    await analyzer.initialize()

    const analysis = await analyzer.analyze(
      {
        audioMetrics: {
          averageEnergy: 0.12,
          dynamicRange: 0.28,
          peakEnergy: 0.83,
          silenceRatio: 0.16,
          speechBursts: 2,
          voicedRatio: 0.84,
          zeroCrossingRate: 0.09,
        },
        durationSeconds: 4,
        language: 'tr',
        segments: [
          {
            end: 1.9,
            start: 0,
            text: 'Paramı geri istiyorum',
          },
          {
            end: 3.8,
            start: 2.1,
            text: 'böyle iş olmaz!',
          },
        ],
        text: 'Paramı geri istiyorum, böyle iş olmaz!',
      },
      4000,
    )

    expect(analysis.topicHints.join(' ')).toContain('geri')
    expect(analysis.primaryContext).toContain('geri')
    expect(analysis.primaryTone).toContain('yüksek enerjili')
    expect(analysis.labels.some((label) => label.includes('geri'))).toBe(true)
    expect(analysis.audioCues).toContain('yüksek enerji')
  })
})
