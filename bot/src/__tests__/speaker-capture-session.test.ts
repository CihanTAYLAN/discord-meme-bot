import { describe, expect, it, vi } from 'vitest'
import { SpeakerCaptureSession } from '../audio/speaker-capture-session.js'

const bytesPerMillisecond = (48_000 * 2 * 2) / 1000

describe('SpeakerCaptureSession', () => {
  it('finalizes on silence once minimum duration is reached', async () => {
    const onFinalize = vi.fn().mockResolvedValue(undefined)
    const session = new SpeakerCaptureSession(
      {
        maxSegmentGraceMs: 2500,
        maxSegmentMs: 20_000,
        minSegmentMs: 3000,
        silenceMs: 1500,
      },
      {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
      onFinalize,
    )

    session.consumePcmChunk(Buffer.alloc(bytesPerMillisecond * 3200), 1_000)
    session.tick(2_700)
    await Promise.resolve()

    expect(onFinalize).toHaveBeenCalledTimes(1)
    expect(onFinalize.mock.calls[0]?.[0].endedBy).toBe('silence')
  })

  it('finalizes short utterances after extended silence', async () => {
    const onFinalize = vi.fn().mockResolvedValue(undefined)
    const session = new SpeakerCaptureSession(
      {
        maxSegmentGraceMs: 2500,
        maxSegmentMs: 20_000,
        minSegmentMs: 3000,
        silenceMs: 1500,
      },
      {
        debug() {},
        error() {},
        info() {},
        warn() {},
      },
      onFinalize,
    )

    session.consumePcmChunk(Buffer.alloc(bytesPerMillisecond * 1800), 1_000)
    session.tick(4_100)
    await Promise.resolve()

    expect(onFinalize).toHaveBeenCalledTimes(1)
    expect(onFinalize.mock.calls[0]?.[0].endedBy).toBe('stream_end')
  })
})
