import { appEnv } from './env'
import type {
  BulkUpdateResponse,
  SoundDraft,
  SoundRecord,
  SoundsListQuery,
  SoundsListResponse,
  SoundUpdateInput,
} from './types'

const assertOk = async (response: Response) => {
  if (response.ok) {
    return
  }

  const body = await response.text()
  throw new Error(body || `Request failed with status ${response.status}`)
}

const buildQueryString = (query: Partial<SoundsListQuery>) => {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'undefined' || value === null || value === '') {
      continue
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        params.set(key, value.join(','))
      }
      continue
    }

    params.set(key, String(value))
  }

  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

const postJson = async <TResponse>(
  path: string,
  body: unknown,
  method: 'PATCH' | 'POST' = 'POST',
) => {
  const response = await fetch(`${appEnv.apiBaseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
    method,
  })
  await assertOk(response)
  return (await response.json()) as TResponse
}

export const soundsApi = {
  audioUrl(id: string) {
    return `${appEnv.apiBaseUrl}/api/v1/sounds/${id}/audio`
  },
  async bulkDelete(ids: string[]) {
    return postJson<{ deletedCount: number }>('/api/v1/sounds/bulk-delete', {
      ids,
    })
  },
  async bulkUpdate(ids: string[], patch: SoundUpdateInput) {
    return postJson<BulkUpdateResponse>('/api/v1/sounds/bulk-update', {
      ids,
      patch,
    })
  },
  async confirmDraft(draftId: string, patch: SoundUpdateInput) {
    return postJson<SoundRecord>(
      `/api/v1/sounds/drafts/${draftId}/confirm`,
      patch,
    )
  },
  draftAudioUrl(id: string) {
    return `${appEnv.apiBaseUrl}/api/v1/sounds/drafts/${id}/audio`
  },
  async discardDraft(draftId: string) {
    const response = await fetch(
      `${appEnv.apiBaseUrl}/api/v1/sounds/drafts/${draftId}`,
      {
        method: 'DELETE',
      },
    )
    await assertOk(response)
    return (await response.json()) as { deleted: boolean }
  },
  async listDrafts(): Promise<SoundDraft[]> {
    const response = await fetch(`${appEnv.apiBaseUrl}/api/v1/sounds/drafts`)
    await assertOk(response)
    return (await response.json()) as SoundDraft[]
  },
  async listSounds(
    query: Partial<SoundsListQuery>,
  ): Promise<SoundsListResponse> {
    const response = await fetch(
      `${appEnv.apiBaseUrl}/api/v1/sounds${buildQueryString(query)}`,
    )
    await assertOk(response)
    return (await response.json()) as SoundsListResponse
  },
  async updateSound(id: string, patch: SoundUpdateInput) {
    return postJson<SoundRecord>(`/api/v1/sounds/${id}`, patch, 'PATCH')
  },
  async uploadDraft(file: File): Promise<SoundDraft> {
    const formData = new FormData()
    formData.set('file', file)

    const response = await fetch(`${appEnv.apiBaseUrl}/api/v1/sounds/drafts`, {
      body: formData,
      method: 'POST',
    })
    await assertOk(response)
    return (await response.json()) as SoundDraft
  },
}
