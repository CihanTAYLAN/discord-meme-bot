export interface SoundMetadataBuckets {
  deliveryStyle: 'clipped' | 'explosive' | 'steady' | 'swelling'
  energyBucket: 'high' | 'low' | 'medium'
  interactionMode: 'exclamation' | 'mixed' | 'question' | 'statement'
  paceBucket: 'fast' | 'slow' | 'steady'
  pauseBucket: 'balanced' | 'dense' | 'light'
}

export interface SoundRecord {
  audioCues: string[]
  category: string
  createdAt: string
  durationSeconds: number
  fileName: string
  filePath: string
  fileSizeBytes: number
  id: string
  labels: string[]
  language: string
  metadata: SoundMetadataBuckets
  mood: string
  primaryContext: string
  primaryTone: string
  summary: string
  topicHints: string[]
  transcript: string
  updatedAt: string
}

export interface SoundDraft {
  audioCues: string[]
  category: string
  createdAt: string
  durationSeconds: number
  fileName: string
  filePath: string
  fileSizeBytes: number
  id: string
  labels: string[]
  language: string
  metadata: SoundMetadataBuckets
  mood: string
  primaryContext: string
  primaryTone: string
  summary: string
  topicHints: string[]
  transcript: string
  updatedAt: string
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

export interface SoundsListQuery {
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

export interface BulkUpdateResponse {
  count: number
  items: SoundRecord[]
}
