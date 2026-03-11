import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { SWRConfig } from 'swr'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SoundDraft, SoundRecord, SoundsListResponse } from '@/lib/types'
import { SoundsPage } from '../sounds-page'

const renderPage = () =>
  render(
    React.createElement(
      SWRConfig,
      {
        value: {
          dedupingInterval: 0,
          provider: () => new Map(),
          revalidateOnFocus: false,
        },
      },
      React.createElement(SoundsPage),
    ),
  )

const createJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })

const metadata = {
  deliveryStyle: 'explosive',
  energyBucket: 'high',
  interactionMode: 'statement',
  paceBucket: 'steady',
  pauseBucket: 'light',
} as const

const baseSound = {
  audioCues: ['energetic delivery'],
  category: 'reaction',
  createdAt: '2026-03-11T09:00:00.000Z',
  durationSeconds: 6.2,
  fileName: 'meme.mp3',
  filePath: '/sounds/meme.mp3',
  fileSizeBytes: 120_000,
  id: 'a5c763c5-e4e1-4d81-b696-5a9bedfa5440',
  labels: ['şaşkın', 'tepkisel'],
  language: 'tr',
  metadata,
  mood: 'excited',
  primaryContext: 'sudden reaction',
  primaryTone: 'surprised',
  summary: 'şaşkın tepki',
  topicHints: ['unexpected moment'],
  transcript: 'oha bu ne',
  updatedAt: '2026-03-11T09:00:00.000Z',
} satisfies SoundRecord

const draft = { ...baseSound } satisfies SoundDraft
const record = { ...baseSound } satisfies SoundRecord

const emptyResponse: SoundsListResponse = {
  facets: {
    categories: [],
    labels: [],
    languages: [],
    moods: [],
  },
  items: [],
  page: 1,
  pageSize: 9,
  total: 0,
  totalPages: 1,
}

const populatedResponse: SoundsListResponse = {
  facets: {
    categories: ['reaction'],
    labels: ['şaşkın', 'tepkisel'],
    languages: ['tr'],
    moods: ['excited'],
  },
  items: [record],
  page: 1,
  pageSize: 9,
  total: 1,
  totalPages: 1,
}

Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: vi.fn(),
})

Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: vi.fn(),
})

Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('SoundsPage', () => {
  it('uploads a file, reviews the AI draft, and confirms it into the library', async () => {
    let currentDrafts: SoundDraft[] = []
    let isIndexed = false

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string' || input instanceof URL
            ? String(input)
            : input.url
        const url = new URL(requestUrl)
        const method = init?.method ?? 'GET'

        if (url.pathname === '/api/v1/sounds' && method === 'GET') {
          return createJsonResponse(
            isIndexed ? populatedResponse : emptyResponse,
          )
        }

        if (url.pathname === '/api/v1/sounds/drafts' && method === 'GET') {
          return createJsonResponse(currentDrafts)
        }

        if (url.pathname === '/api/v1/sounds/drafts' && method === 'POST') {
          currentDrafts = [draft]
          return createJsonResponse(draft, 201)
        }

        if (
          url.pathname === `/api/v1/sounds/drafts/${draft.id}/confirm` &&
          method === 'POST'
        ) {
          currentDrafts = []
          isIndexed = true
          return createJsonResponse(record, 201)
        }

        if (
          url.pathname === `/api/v1/sounds/drafts/${draft.id}` &&
          method === 'DELETE'
        ) {
          currentDrafts = []
          return createJsonResponse({ deleted: true })
        }

        if (url.pathname.endsWith('/audio') && method === 'GET') {
          return new Response('', { status: 200 })
        }

        throw new Error(`Unexpected request: ${method} ${url.pathname}`)
      },
    )

    vi.stubGlobal('fetch', fetchMock)
    renderPage()

    const input = await screen.findByTestId('upload-input')
    const file = new File(['mp3'], 'meme.mp3', { type: 'audio/mpeg' })

    await userEvent.upload(input, file)
    await userEvent.click(
      screen.getByRole('button', { name: /start ai analysis/i }),
    )

    await screen.findByRole('button', { name: /confirm and index/i })
    expect(
      screen.getByText(
        /review ai-generated suggestions before the vector index/i,
      ),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: /confirm and index/i }),
    )

    await waitFor(() => {
      expect(
        screen.getByText(/new sound indexed and added to the library/i),
      ).toBeInTheDocument()
    })

    expect(
      screen.getByRole('button', { name: /edit attributes/i }),
    ).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()
  })
})
