export type SegmentEndedBy =
  | 'silence'
  | 'max_duration'
  | 'stream_end'
  | 'manual'

export interface SegmentRequestMeta {
  guildId: string
  speakerId: string
  speakerName: string
  durationMs: number
  tailSilenceMs: number
  endedBy: SegmentEndedBy
}

export interface TranscriptionSegment {
  end: number
  start: number
  text: string
}

export interface AudioMetrics {
  averageEnergy: number
  dynamicRange: number
  peakEnergy: number
  silenceRatio: number
  speechBursts: number
  voicedRatio: number
  zeroCrossingRate: number
}

export interface SoundMetadataBuckets {
  deliveryStyle: 'clipped' | 'explosive' | 'steady' | 'swelling'
  energyBucket: 'high' | 'low' | 'medium'
  interactionMode: 'exclamation' | 'mixed' | 'question' | 'statement'
  paceBucket: 'fast' | 'slow' | 'steady'
  pauseBucket: 'balanced' | 'dense' | 'light'
}

export interface TranscriptionResult {
  audioMetrics: AudioMetrics
  durationSeconds: number
  language: string
  segments: TranscriptionSegment[]
  text: string
}

export interface ContextAnalysis {
  audioCues: string[]
  category: string
  labels: string[]
  metadata: SoundMetadataBuckets
  mood: string
  primaryContext: string
  primaryTone: string
  representation: string
  summary: string
  topicHints: string[]
}

export interface SoundEditableFields {
  audioCues: string[]
  category: string
  durationSeconds: number
  fileName: string
  filePath: string
  labels: string[]
  language: string
  metadata: SoundMetadataBuckets
  mood: string
  primaryContext: string
  primaryTone: string
  summary: string
  topicHints: string[]
  transcript: string
}

export interface SoundRecord extends SoundEditableFields {
  createdAt: string
  fileSizeBytes: number
  id: string
  updatedAt: string
}

export interface SoundDraft extends SoundEditableFields {
  createdAt: string
  fileSizeBytes: number
  id: string
  updatedAt: string
}

export interface SoundsQuery {
  categories?: string[]
  dateFrom?: string
  dateTo?: string
  labels?: string[]
  languages?: string[]
  maxDurationSeconds?: number
  minDurationSeconds?: number
  moods?: string[]
  page: number
  pageSize: number
  query?: string
  sortBy:
    | 'createdAt:asc'
    | 'createdAt:desc'
    | 'duration:asc'
    | 'duration:desc'
    | 'fileName:asc'
}

export interface SoundsListFacets {
  categories: string[]
  labels: string[]
  languages: string[]
  moods: string[]
}

export interface SoundsListResponse {
  facets: SoundsListFacets
  items: SoundRecord[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface SimilarSoundMatch {
  fileName: string
  filePath: string
  similarity: number
  soundId: string
}

export type SegmentResponse =
  | { status: 'pending' }
  | {
      labels: string[]
      similarity: null
      status: 'no_match'
      summary: string
      transcript: string
    }
  | {
      labels: string[]
      match: SimilarSoundMatch
      status: 'matched'
      summary: string
      transcript: string
    }

export type PlaybackQueryResponse =
  | {
      labels: string[]
      similarity: null
      status: 'no_match'
      summary: string
      transcript: string
    }
  | {
      labels: string[]
      match: SimilarSoundMatch
      status: 'matched'
      summary: string
      transcript: string
    }

export interface PendingSegmentDecision {
  status: 'final' | 'pending'
  transcription?: TranscriptionResult
}

export interface SoundUpdateInput {
  audioCues?: string[]
  category?: string
  labels?: string[]
  mood?: string
  primaryContext?: string
  primaryTone?: string
  summary?: string
  topicHints?: string[]
  transcript?: string
}

export interface SoundDraftConfirmationInput extends SoundUpdateInput {}

export interface BulkSoundPatch extends SoundUpdateInput {}
