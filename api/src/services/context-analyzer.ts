import type {
  ContextAnalysis,
  SoundEditableFields,
  SoundMetadataBuckets,
  TranscriptionResult,
  TranscriptionSegment,
} from '../types/models.js'
import { cosineSimilarity, type EmbeddingService } from './embedding-service.js'

const stopWords = new Set([
  'ama',
  'artık',
  'aslında',
  'beni',
  'bile',
  'bir',
  'biraz',
  'bize',
  'bu',
  'çok',
  'çünkü',
  'da',
  'daha',
  'de',
  'diye',
  'gibi',
  'göre',
  'hani',
  'hem',
  'hep',
  'için',
  'ile',
  'işte',
  'kadar',
  'kez',
  'mı',
  'mi',
  'mu',
  'mü',
  'nasıl',
  'neden',
  'olan',
  'olarak',
  'olanı',
  'oldu',
  'oluyor',
  'onu',
  'öyle',
  'şey',
  'tam',
  've',
  'veya',
  'ya',
  'yani',
  'you',
  'for',
  'from',
  'have',
  'just',
  'like',
  'that',
  'the',
  'this',
  'with',
])

const terminalPunctuationPattern = /[.!?…]$/

interface PhraseCandidate {
  lexicalScore: number
  phrase: string
}

const tokenize = (value: string): string[] =>
  value
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s!?]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

const sentenceSplit = (value: string): string[] =>
  value
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

const unique = <T>(values: T[]): T[] => [...new Set(values)]

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const titleCaseFirst = (value: string) =>
  value.length > 0
    ? `${value[0]?.toLocaleUpperCase('tr-TR')}${value.slice(1)}`
    : value

const compactPhrase = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/\s([!?.,…])/g, '$1')
    .trim()

const toCountMap = (tokens: string[]) => {
  const counts = new Map<string, number>()

  for (const token of tokens) {
    if (token.length < 3 || stopWords.has(token)) {
      continue
    }

    counts.set(token, (counts.get(token) ?? 0) + 1)
  }

  return counts
}

const buildNGramCandidates = (tokens: string[]): PhraseCandidate[] => {
  const filteredTokens = tokens.filter(
    (token) => token.length >= 3 && !stopWords.has(token),
  )
  const scored = new Map<string, number>()

  for (const size of [3, 2, 1]) {
    for (let index = 0; index <= filteredTokens.length - size; index += 1) {
      const chunk = filteredTokens.slice(index, index + size)
      const phrase = compactPhrase(chunk.join(' '))

      if (!phrase || phrase.length < 4) {
        continue
      }

      const distinctCount = new Set(chunk).size
      const lexicalScore = size * 0.22 + distinctCount * 0.08
      scored.set(phrase, Math.max(scored.get(phrase) ?? 0, lexicalScore))
    }
  }

  return [...scored.entries()].map(([phrase, lexicalScore]) => ({
    lexicalScore,
    phrase,
  }))
}

const buildSegmentCandidates = (
  segments: TranscriptionSegment[],
): PhraseCandidate[] =>
  segments
    .map((segment) => compactPhrase(segment.text))
    .filter((segmentText) => tokenize(segmentText).length >= 2)
    .slice(0, 8)
    .map((phrase) => ({
      lexicalScore: Math.min(0.6, tokenize(phrase).length * 0.12),
      phrase,
    }))

const buildCandidatePhrases = (transcription: TranscriptionResult) => {
  const tokens = tokenize(transcription.text)
  const candidates = new Map<string, PhraseCandidate>()

  for (const candidate of [
    ...buildNGramCandidates(tokens),
    ...buildSegmentCandidates(transcription.segments),
  ]) {
    const existing = candidates.get(candidate.phrase)

    if (!existing || existing.lexicalScore < candidate.lexicalScore) {
      candidates.set(candidate.phrase, candidate)
    }
  }

  return [...candidates.values()]
    .sort((left, right) => right.lexicalScore - left.lexicalScore)
    .slice(0, 18)
}

const pickSummarySource = (
  transcription: TranscriptionResult,
  topicHints: string[],
  transcriptEmbedding: number[],
  candidateEmbeddings: Map<string, number[]>,
) => {
  const sentenceCandidates = unique([
    ...sentenceSplit(transcription.text),
    ...transcription.segments.map((segment) => compactPhrase(segment.text)),
  ]).filter((candidate) => tokenize(candidate).length >= 3)

  if (sentenceCandidates.length === 0) {
    return compactPhrase(transcription.text).slice(0, 200)
  }

  const scored = sentenceCandidates.map((candidate) => {
    const candidateEmbedding = candidateEmbeddings.get(candidate)
    const semanticScore = candidateEmbedding
      ? cosineSimilarity(transcriptEmbedding, candidateEmbedding)
      : 0
    const topicCoverage = topicHints.reduce((score, topicHint) => {
      return candidate
        .toLocaleLowerCase('tr-TR')
        .includes(topicHint.toLocaleLowerCase('tr-TR'))
        ? score + 0.18
        : score
    }, 0)

    return {
      candidate,
      score: semanticScore * 0.78 + topicCoverage,
    }
  })

  return compactPhrase(
    scored.sort((left, right) => right.score - left.score)[0]?.candidate ??
      sentenceCandidates[0] ??
      compactPhrase(transcription.text),
  ).slice(0, 200)
}

const buildPaceBucket = (wordsPerSecond: number) => {
  if (wordsPerSecond >= 2.9) {
    return 'fast' as const
  }

  if (wordsPerSecond <= 1.45) {
    return 'slow' as const
  }

  return 'steady' as const
}

const buildEnergyBucket = (averageEnergy: number, peakEnergy: number) => {
  if (averageEnergy >= 0.085 || peakEnergy >= 0.72) {
    return 'high' as const
  }

  if (averageEnergy <= 0.035 && peakEnergy <= 0.45) {
    return 'low' as const
  }

  return 'medium' as const
}

const buildPauseBucket = (
  silenceRatio: number,
  averagePauseMs: number,
  speechBursts: number,
) => {
  if (silenceRatio >= 0.5 || averagePauseMs >= 650 || speechBursts >= 6) {
    return 'dense' as const
  }

  if (silenceRatio <= 0.22 && averagePauseMs <= 240) {
    return 'light' as const
  }

  return 'balanced' as const
}

const buildInteractionMode = (transcript: string) => {
  const hasQuestion = transcript.includes('?')
  const hasExclamation = transcript.includes('!')

  if (hasQuestion && hasExclamation) {
    return 'mixed' as const
  }

  if (hasQuestion) {
    return 'question' as const
  }

  if (hasExclamation) {
    return 'exclamation' as const
  }

  return 'statement' as const
}

const buildDeliveryStyle = ({
  dynamicRange,
  energyBucket,
  interactionMode,
  paceBucket,
  pauseBucket,
}: {
  dynamicRange: number
  energyBucket: 'high' | 'low' | 'medium'
  interactionMode: 'exclamation' | 'mixed' | 'question' | 'statement'
  paceBucket: 'fast' | 'slow' | 'steady'
  pauseBucket: 'balanced' | 'dense' | 'light'
}) => {
  if (
    energyBucket === 'high' &&
    (interactionMode === 'exclamation' || dynamicRange >= 0.22)
  ) {
    return 'explosive' as const
  }

  if (
    pauseBucket === 'dense' ||
    (interactionMode === 'question' && paceBucket !== 'slow')
  ) {
    return 'clipped' as const
  }

  if (energyBucket === 'low' && paceBucket === 'slow') {
    return 'swelling' as const
  }

  return 'steady' as const
}

const buildAudioCues = ({
  averagePauseMs,
  deliveryStyle,
  dynamicRange,
  energyBucket,
  interactionMode,
  paceBucket,
  pauseBucket,
  transcript,
}: {
  averagePauseMs: number
  deliveryStyle: 'clipped' | 'explosive' | 'steady' | 'swelling'
  dynamicRange: number
  energyBucket: 'high' | 'low' | 'medium'
  interactionMode: 'exclamation' | 'mixed' | 'question' | 'statement'
  paceBucket: 'fast' | 'slow' | 'steady'
  pauseBucket: 'balanced' | 'dense' | 'light'
  transcript: string
}) => {
  const cues: string[] = []

  if (energyBucket === 'high') {
    cues.push('yüksek enerji')
  } else if (energyBucket === 'low') {
    cues.push('düşük enerji')
  }

  if (paceBucket === 'fast') {
    cues.push('hızlı akış')
  } else if (paceBucket === 'slow') {
    cues.push('ağır tempo')
  }

  if (pauseBucket === 'dense') {
    cues.push('belirgin sessizlik araları')
  } else if (pauseBucket === 'light') {
    cues.push('tek parça akış')
  }

  if (dynamicRange >= 0.2) {
    cues.push('geniş dinamik aralık')
  }

  if (interactionMode === 'question') {
    cues.push('sorgulayan kapanış')
  } else if (interactionMode === 'exclamation') {
    cues.push('vurgu yüklü kapanış')
  } else if (interactionMode === 'mixed') {
    cues.push('karışık tepki tonu')
  }

  if (deliveryStyle === 'clipped' && averagePauseMs >= 500) {
    cues.push('kesik cümle geçişleri')
  }

  if (!terminalPunctuationPattern.test(transcript.trim())) {
    cues.push('açık uçlu kapanış')
  }

  return unique(cues)
}

const buildCategory = (
  topicHints: string[],
  primaryContext: string,
  interactionMode: SoundMetadataBuckets['interactionMode'],
) => {
  const leadTopic = topicHints[0]

  if (!leadTopic) {
    return interactionMode === 'question' ? 'question clip' : 'reaction clip'
  }

  if (interactionMode === 'question') {
    return `${leadTopic} inquiry`
  }

  if (interactionMode === 'exclamation') {
    return `${leadTopic} reaction`
  }

  if (interactionMode === 'mixed') {
    return `${leadTopic} tension`
  }

  const compactContext = primaryContext.split(' ')[0]
  return `${leadTopic} ${compactContext}`.trim()
}

const buildMood = ({
  deliveryStyle,
  energyBucket,
  interactionMode,
  pauseBucket,
}: SoundMetadataBuckets) => {
  if (deliveryStyle === 'explosive') {
    return interactionMode === 'question'
      ? 'agitated disbelief'
      : 'heated reaction'
  }

  if (deliveryStyle === 'clipped') {
    return pauseBucket === 'dense' ? 'strained hesitation' : 'nervy pacing'
  }

  if (energyBucket === 'low') {
    return 'low-pressure drift'
  }

  if (interactionMode === 'question') {
    return 'curious tension'
  }

  return 'steady commentary'
}

export const buildContextRepresentation = (
  input: Pick<
    SoundEditableFields,
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
) =>
  [
    `summary: ${input.summary}`,
    `category: ${input.category}`,
    `mood: ${input.mood}`,
    `primary tone: ${input.primaryTone}`,
    `primary context: ${input.primaryContext}`,
    `dynamic labels: ${input.labels.join(', ') || 'none'}`,
    `topic hints: ${input.topicHints.join(', ') || 'none'}`,
    `delivery style: ${input.metadata.deliveryStyle}`,
    `interaction mode: ${input.metadata.interactionMode}`,
    `pace bucket: ${input.metadata.paceBucket}`,
    `energy bucket: ${input.metadata.energyBucket}`,
    `pause bucket: ${input.metadata.pauseBucket}`,
    `audio cues: ${input.audioCues.join(', ') || 'none'}`,
    `transcript: ${input.transcript}`,
  ].join('\n')

const composePrimaryTone = ({
  deliveryStyle,
  energyBucket,
  interactionMode,
  paceBucket,
}: {
  deliveryStyle: 'clipped' | 'explosive' | 'steady' | 'swelling'
  energyBucket: 'high' | 'low' | 'medium'
  interactionMode: 'exclamation' | 'mixed' | 'question' | 'statement'
  paceBucket: 'fast' | 'slow' | 'steady'
}) => {
  const fragments: string[] = []

  if (energyBucket === 'high') {
    fragments.push('yüksek enerjili')
  } else if (energyBucket === 'low') {
    fragments.push('düşük enerjili')
  } else {
    fragments.push('orta yoğunlukta')
  }

  if (paceBucket === 'fast') {
    fragments.push('hızlı')
  } else if (paceBucket === 'slow') {
    fragments.push('ağır')
  }

  if (deliveryStyle === 'explosive') {
    fragments.push('patlayıcı')
  } else if (deliveryStyle === 'clipped') {
    fragments.push('kesik')
  } else if (deliveryStyle === 'swelling') {
    fragments.push('yayılan')
  } else {
    fragments.push('dengeli')
  }

  if (interactionMode === 'question') {
    fragments.push('sorgulayan')
  } else if (interactionMode === 'exclamation') {
    fragments.push('yüklenen')
  } else if (interactionMode === 'mixed') {
    fragments.push('karışık tepki veren')
  }

  return compactPhrase(fragments.join(' '))
}

const composePrimaryContext = (
  topicHints: string[],
  interactionMode: 'exclamation' | 'mixed' | 'question' | 'statement',
) => {
  const leadTopic = topicHints[0]

  if (!leadTopic) {
    return 'serbest sohbet repliği'
  }

  if (interactionMode === 'question') {
    return `${leadTopic} etrafında sorgulayan replik`
  }

  if (interactionMode === 'exclamation') {
    return `${leadTopic} etrafında ani çıkış`
  }

  if (interactionMode === 'mixed') {
    return `${leadTopic} etrafında dalgalı tepki`
  }

  return `${leadTopic} eksenli anlatım`
}

const composeLabels = ({
  audioCues,
  deliveryStyle,
  interactionMode,
  primaryContext,
  primaryTone,
  topicHints,
}: {
  audioCues: string[]
  deliveryStyle: 'clipped' | 'explosive' | 'steady' | 'swelling'
  interactionMode: 'exclamation' | 'mixed' | 'question' | 'statement'
  primaryContext: string
  primaryTone: string
  topicHints: string[]
}) => {
  const labels = [
    ...topicHints.slice(0, 2).map((topic) => `${topic} odağı`),
    primaryTone,
    primaryContext,
  ]

  if (deliveryStyle === 'explosive') {
    labels.push('ani yüklenme')
  } else if (deliveryStyle === 'clipped') {
    labels.push('kesik ilerleyen akış')
  } else if (deliveryStyle === 'swelling') {
    labels.push('genişleyen anlatım')
  } else {
    labels.push('dengeli akış')
  }

  if (interactionMode === 'question') {
    labels.push('soru gibi kurulan kapanış')
  } else if (interactionMode === 'exclamation') {
    labels.push('vurgu ile kapanan replik')
  } else if (interactionMode === 'mixed') {
    labels.push('kararsız tepki geçişi')
  }

  labels.push(...audioCues.slice(0, 2))

  return unique(labels.filter(Boolean)).slice(0, 6)
}

const calculateAveragePauseMs = (segments: TranscriptionSegment[]) => {
  if (segments.length < 2) {
    return 0
  }

  let totalPauseMs = 0
  let pauseCount = 0

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1]
    const current = segments[index]

    if (!previous || !current) {
      continue
    }

    const pauseMs = Math.max(0, (current.start - previous.end) * 1000)
    totalPauseMs += pauseMs
    pauseCount += 1
  }

  return pauseCount > 0 ? totalPauseMs / pauseCount : 0
}

export class ContextAnalyzer {
  private readonly embeddingCache = new Map<string, Promise<number[]>>()

  constructor(private readonly embeddingService: EmbeddingService) {}

  async initialize(): Promise<void> {
    return Promise.resolve()
  }

  async analyze(
    transcription: TranscriptionResult,
    durationMs: number,
  ): Promise<ContextAnalysis> {
    const cleanedTranscript = compactPhrase(transcription.text)

    if (!cleanedTranscript) {
      return {
        audioCues: ['konuşma çözümlenemedi'],
        category: 'unresolved clip',
        labels: ['boş transkript'],
        metadata: {
          deliveryStyle: 'steady',
          energyBucket: 'low',
          interactionMode: 'statement',
          paceBucket: 'slow',
          pauseBucket: 'dense',
        },
        mood: 'missing speech',
        primaryContext: 'çözümlenmeyen ses parçası',
        primaryTone: 'düşük enerjili boş kayıt',
        representation: buildContextRepresentation({
          audioCues: ['konuşma çözümlenemedi'],
          category: 'unresolved clip',
          labels: ['boş transkript'],
          metadata: {
            deliveryStyle: 'steady',
            energyBucket: 'low',
            interactionMode: 'statement',
            paceBucket: 'slow',
            pauseBucket: 'dense',
          },
          mood: 'missing speech',
          primaryContext: 'çözümlenmeyen ses parçası',
          primaryTone: 'düşük enerjili boş kayıt',
          summary: 'Anlaşılır bir konuşma çıkarılamadı.',
          topicHints: [],
          transcript: 'none',
        }),
        summary: 'Anlaşılır bir konuşma çıkarılamadı.',
        topicHints: [],
      }
    }

    const transcriptEmbedding = await this.getEmbedding(cleanedTranscript)
    const candidatePhrases = buildCandidatePhrases(transcription)
    const candidateEmbeddings = new Map<string, number[]>()

    for (const candidate of candidatePhrases) {
      candidateEmbeddings.set(
        candidate.phrase,
        await this.getEmbedding(candidate.phrase),
      )
    }

    const topicHints = candidatePhrases
      .map((candidate) => {
        const candidateEmbedding = candidateEmbeddings.get(candidate.phrase)
        const semanticScore = candidateEmbedding
          ? cosineSimilarity(transcriptEmbedding, candidateEmbedding)
          : 0

        return {
          phrase: candidate.phrase,
          score: semanticScore * 0.8 + candidate.lexicalScore,
        }
      })
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.phrase)
      .filter((phrase, index, values) => {
        return (
          phrase.length >= 4 &&
          values.findIndex((candidate) => candidate.includes(phrase)) === index
        )
      })
      .slice(0, 3)

    const transcriptTokens = tokenize(cleanedTranscript)
    const transcriptDurationSeconds = Math.max(
      durationMs / 1000,
      transcription.durationSeconds,
      1,
    )
    const wordsPerSecond = transcriptTokens.length / transcriptDurationSeconds
    const averagePauseMs = calculateAveragePauseMs(transcription.segments)
    const averageEnergy = clamp(transcription.audioMetrics.averageEnergy, 0, 1)
    const peakEnergy = clamp(transcription.audioMetrics.peakEnergy, 0, 1)
    const dynamicRange = clamp(transcription.audioMetrics.dynamicRange, 0, 1)
    const energyBucket = buildEnergyBucket(averageEnergy, peakEnergy)
    const paceBucket = buildPaceBucket(wordsPerSecond)
    const interactionMode = buildInteractionMode(cleanedTranscript)
    const pauseBucket = buildPauseBucket(
      transcription.audioMetrics.silenceRatio,
      averagePauseMs,
      transcription.audioMetrics.speechBursts,
    )
    const deliveryStyle = buildDeliveryStyle({
      dynamicRange,
      energyBucket,
      interactionMode,
      paceBucket,
      pauseBucket,
    })
    const audioCues = buildAudioCues({
      averagePauseMs,
      deliveryStyle,
      dynamicRange,
      energyBucket,
      interactionMode,
      paceBucket,
      pauseBucket,
      transcript: cleanedTranscript,
    })
    const primaryTone = composePrimaryTone({
      deliveryStyle,
      energyBucket,
      interactionMode,
      paceBucket,
    })
    const primaryContext = composePrimaryContext(topicHints, interactionMode)
    const metadata: SoundMetadataBuckets = {
      deliveryStyle,
      energyBucket,
      interactionMode,
      paceBucket,
      pauseBucket,
    }
    const category = buildCategory(topicHints, primaryContext, interactionMode)
    const mood = buildMood(metadata)
    const labels = composeLabels({
      audioCues,
      deliveryStyle,
      interactionMode,
      primaryContext,
      primaryTone,
      topicHints,
    })
    const summary = titleCaseFirst(
      pickSummarySource(
        transcription,
        topicHints,
        transcriptEmbedding,
        candidateEmbeddings,
      ),
    )
    const frequentTokens = [...toCountMap(transcriptTokens).entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([token]) => token)
      .slice(0, 3)

    const representation = [
      buildContextRepresentation({
        audioCues,
        category,
        labels,
        metadata,
        mood,
        primaryContext,
        primaryTone,
        summary,
        topicHints,
        transcript: cleanedTranscript,
      }),
      `repeated terms: ${frequentTokens.join(', ') || 'none'}`,
    ].join('\n')

    return {
      audioCues,
      category,
      labels,
      metadata,
      mood,
      primaryContext,
      primaryTone,
      representation,
      summary,
      topicHints,
    }
  }

  private async getEmbedding(text: string) {
    const cached = this.embeddingCache.get(text)

    if (cached) {
      return cached
    }

    const embeddingPromise = this.embeddingService.embedText(text)
    this.embeddingCache.set(text, embeddingPromise)
    return embeddingPromise
  }
}

export const transcriptLooksComplete = (transcript: string): boolean =>
  terminalPunctuationPattern.test(transcript.trim())
