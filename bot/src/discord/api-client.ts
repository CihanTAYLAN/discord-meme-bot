import type { FinalizedSegment } from '../audio/speaker-capture-session.js'

export interface SegmentMatch {
  fileName: string
  filePath: string
  similarity: number
  soundId: string
}

export type SegmentApiResponse =
  | { status: 'pending' }
  | {
      labels: string[]
      match: SegmentMatch
      status: 'matched'
      summary: string
      transcript: string
    }
  | {
      labels: string[]
      similarity: null
      status: 'no_match'
      summary: string
      transcript: string
    }

export type PlaybackQueryApiResponse =
  | {
      labels: string[]
      similarity: null
      status: 'no_match'
      summary: string
      transcript: string
    }
  | {
      labels: string[]
      match: SegmentMatch
      status: 'matched'
      summary: string
      transcript: string
    }

interface SubmitSegmentInput {
  audioBuffer: Buffer
  fileName: string
  guildId: string
  segment: FinalizedSegment
  speakerId: string
  speakerName: string
}

export class ApiClient {
  constructor(private readonly baseUrl: string) {}

  async submitPlaybackQuery(query: string): Promise<PlaybackQueryApiResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/playback/query`, {
      body: JSON.stringify({ query }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
    })

    if (!response.ok) {
      const responseText = await response.text().catch(() => '')
      throw new Error(
        responseText ||
          `Playback query request failed with status ${response.status}`,
      )
    }

    return (await response.json()) as PlaybackQueryApiResponse
  }

  async submitSegment(input: SubmitSegmentInput): Promise<SegmentApiResponse> {
    const form = new FormData()
    form.set('guildId', input.guildId)
    form.set('speakerId', input.speakerId)
    form.set('speakerName', input.speakerName)
    form.set('durationMs', String(input.segment.durationMs))
    form.set('tailSilenceMs', String(input.segment.tailSilenceMs))
    form.set('endedBy', input.segment.endedBy)
    const audioBytes = new Uint8Array(input.audioBuffer)
    form.set(
      'audio',
      new Blob([audioBytes], { type: 'audio/wav' }),
      input.fileName,
    )

    const response = await fetch(`${this.baseUrl}/api/v1/segments`, {
      body: form,
      method: 'POST',
    })

    if (!response.ok) {
      const responseText = await response.text().catch(() => '')
      throw new Error(
        responseText ||
          `Segment API request failed with status ${response.status}`,
      )
    }

    return (await response.json()) as SegmentApiResponse
  }
}
