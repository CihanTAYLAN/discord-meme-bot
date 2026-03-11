import type { Logger } from '../lib/logger.js'

export type SegmentEndedBy =
  | 'manual'
  | 'max_duration'
  | 'silence'
  | 'stream_end'

export interface FinalizedSegment {
  buffer: Buffer
  durationMs: number
  endedBy: SegmentEndedBy
  tailSilenceMs: number
}

export interface SpeakerCaptureOptions {
  maxSegmentGraceMs: number
  maxSegmentMs: number
  minSegmentMs: number
  silenceMs: number
}

const bytesPerMillisecond = (48_000 * 2 * 2) / 1000

export class SpeakerCaptureSession {
  private readonly chunks: Buffer[] = []
  private durationMs = 0
  private finalizeQueue: Promise<void> = Promise.resolve()
  private hasActiveAudio = false
  private lastAudioAt = 0

  constructor(
    private readonly options: SpeakerCaptureOptions,
    private readonly logger: Logger,
    private readonly onFinalize: (segment: FinalizedSegment) => Promise<void>,
  ) {}

  consumePcmChunk(chunk: Buffer, now = Date.now()): void {
    if (!this.hasActiveAudio) {
      this.hasActiveAudio = true
    }

    this.chunks.push(Buffer.from(chunk))
    this.durationMs += chunk.length / bytesPerMillisecond
    this.lastAudioAt = now
  }

  flush(reason: SegmentEndedBy, now = Date.now()): void {
    if (!this.hasActiveAudio || this.durationMs <= 0) {
      return
    }

    if (reason === 'silence' && this.durationMs < this.options.minSegmentMs) {
      return
    }

    this.queueFinalize(reason, now)
  }

  tick(now = Date.now()): void {
    if (!this.hasActiveAudio) {
      return
    }

    const silenceDuration = now - this.lastAudioAt
    const reachedHardLimit =
      this.durationMs >=
      this.options.maxSegmentMs + this.options.maxSegmentGraceMs

    if (reachedHardLimit) {
      this.queueFinalize('max_duration', now)
      return
    }

    if (
      silenceDuration >= this.options.silenceMs &&
      this.durationMs >= this.options.minSegmentMs
    ) {
      this.queueFinalize('silence', now)
      return
    }

    // Short one-shot utterances should still flush after extended silence,
    // otherwise they can remain buffered forever and never reach the API.
    if (silenceDuration >= this.options.silenceMs * 2 && this.durationMs > 0) {
      this.queueFinalize('stream_end', now)
    }
  }

  private queueFinalize(reason: SegmentEndedBy, now: number): void {
    const buffer = Buffer.concat(this.chunks)
    const durationMs = Math.round(this.durationMs)
    const tailSilenceMs = Math.max(0, now - this.lastAudioAt)

    this.chunks.length = 0
    this.durationMs = 0
    this.hasActiveAudio = false
    this.lastAudioAt = 0

    this.finalizeQueue = this.finalizeQueue.then(async () => {
      try {
        await this.onFinalize({
          buffer,
          durationMs,
          endedBy: reason,
          tailSilenceMs,
        })
      } catch (error) {
        this.logger.error('Failed to finalize segment', error)
      }
    })
  }
}
