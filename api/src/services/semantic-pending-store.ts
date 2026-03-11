import type {
  PendingSegmentDecision,
  SegmentRequestMeta,
  TranscriptionResult,
} from '../types/models.js'
import { transcriptLooksComplete } from './context-analyzer.js'

interface PendingEntry {
  expiresAt: number
  transcription: TranscriptionResult
}

export class SemanticPendingStore {
  private readonly pending = new Map<string, PendingEntry>()

  constructor(
    private readonly mergeWindowMs: number,
    private readonly tailSilenceThresholdMs: number,
  ) {}

  consume(
    meta: SegmentRequestMeta,
    transcription: TranscriptionResult,
  ): PendingSegmentDecision {
    const key = `${meta.guildId}:${meta.speakerId}`
    const now = Date.now()
    const existing = this.pending.get(key)

    if (existing && existing.expiresAt < now) {
      this.pending.delete(key)
    }

    const merged = existing
      ? mergeTranscriptions(existing.transcription, transcription)
      : transcription
    const shouldHold =
      !transcriptLooksComplete(merged.text) ||
      meta.endedBy === 'max_duration' ||
      meta.tailSilenceMs < this.tailSilenceThresholdMs

    if (shouldHold) {
      this.pending.set(key, {
        expiresAt: now + this.mergeWindowMs,
        transcription: merged,
      })
      return { status: 'pending' }
    }

    this.pending.delete(key)
    return {
      status: 'final',
      transcription: merged,
    }
  }
}

const mergeTranscriptions = (
  left: TranscriptionResult,
  right: TranscriptionResult,
): TranscriptionResult => ({
  audioMetrics: {
    averageEnergy: weightedAverage(
      left.audioMetrics.averageEnergy,
      left.durationSeconds,
      right.audioMetrics.averageEnergy,
      right.durationSeconds,
    ),
    dynamicRange: Math.max(
      left.audioMetrics.dynamicRange,
      right.audioMetrics.dynamicRange,
    ),
    peakEnergy: Math.max(
      left.audioMetrics.peakEnergy,
      right.audioMetrics.peakEnergy,
    ),
    silenceRatio: weightedAverage(
      left.audioMetrics.silenceRatio,
      left.durationSeconds,
      right.audioMetrics.silenceRatio,
      right.durationSeconds,
    ),
    speechBursts:
      left.audioMetrics.speechBursts + right.audioMetrics.speechBursts,
    voicedRatio: weightedAverage(
      left.audioMetrics.voicedRatio,
      left.durationSeconds,
      right.audioMetrics.voicedRatio,
      right.durationSeconds,
    ),
    zeroCrossingRate: weightedAverage(
      left.audioMetrics.zeroCrossingRate,
      left.durationSeconds,
      right.audioMetrics.zeroCrossingRate,
      right.durationSeconds,
    ),
  },
  durationSeconds: left.durationSeconds + right.durationSeconds,
  language: left.language || right.language,
  segments: [...left.segments, ...right.segments],
  text: [left.text.trim(), right.text.trim()].filter(Boolean).join(' '),
})

const weightedAverage = (
  leftValue: number,
  leftWeight: number,
  rightValue: number,
  rightWeight: number,
) => {
  const totalWeight = leftWeight + rightWeight

  if (totalWeight <= 0) {
    return 0
  }

  return (leftValue * leftWeight + rightValue * rightWeight) / totalWeight
}
