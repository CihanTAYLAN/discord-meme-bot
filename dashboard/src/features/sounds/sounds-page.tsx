import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react'
import useSWR from 'swr'
import { SectionCard } from '@/components/section-card'
import { soundsApi } from '@/lib/api-client'
import type {
  SoundRecord,
  SoundsListQuery,
  SoundUpdateInput,
} from '@/lib/types'
import { type FilterState, FiltersPanel } from './components/filters-panel'
import { LibraryToolbar } from './components/library-toolbar'
import {
  recordToPatch,
  SoundEditorModal,
} from './components/sound-editor-modal'
import { SoundsTable } from './components/sounds-table'
import { UploadForm } from './components/upload-form'

const soundsKey = 'sounds-index'
const draftsKey = 'draft-index'
const emptyRecords: SoundRecord[] = []

const defaultFilters: FilterState = {
  categories: [],
  dateFrom: '',
  dateTo: '',
  labels: [],
  languages: [],
  maxDurationSeconds: '',
  minDurationSeconds: '',
  moods: [],
}

const emptyBulkPatch: SoundUpdateInput = {
  audioCues: [],
  category: '',
  labels: [],
  mood: '',
  primaryContext: '',
  primaryTone: '',
  summary: '',
  topicHints: [],
  transcript: '',
}

const buildQuery = (
  filters: FilterState,
  page: number,
  pageSize: number,
  query: string,
  sortBy: SoundsListQuery['sortBy'],
): SoundsListQuery => ({
  categories: filters.categories,
  dateFrom: filters.dateFrom || undefined,
  dateTo: filters.dateTo || undefined,
  labels: filters.labels,
  languages: filters.languages,
  maxDurationSeconds: filters.maxDurationSeconds
    ? Number(filters.maxDurationSeconds)
    : undefined,
  minDurationSeconds: filters.minDurationSeconds
    ? Number(filters.minDurationSeconds)
    : undefined,
  moods: filters.moods,
  page,
  pageSize,
  query: query.trim() || undefined,
  sortBy,
})

export const SoundsPage = () => {
  const [searchInput, setSearchInput] = useState('')
  const deferredQuery = useDeferredValue(searchInput)
  const [filters, setFilters] = useState<FilterState>(defaultFilters)
  const [sortBy, setSortBy] =
    useState<SoundsListQuery['sortBy']>('createdAt:desc')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(9)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editingRecord, setEditingRecord] = useState<SoundRecord | null>(null)
  const [isSavingRecord, setIsSavingRecord] = useState(false)
  const [bulkEditing, setBulkEditing] = useState(false)
  const [isSavingBulk, setIsSavingBulk] = useState(false)
  const [libraryMessage, setLibraryMessage] = useState<string | null>(null)

  const query = useMemo(
    () => buildQuery(filters, page, pageSize, deferredQuery, sortBy),
    [deferredQuery, filters, page, pageSize, sortBy],
  )

  const {
    data: soundsResponse,
    error,
    isLoading,
    mutate,
  } = useSWR(
    `${soundsKey}:${JSON.stringify(query)}`,
    () => soundsApi.listSounds(query),
    {
      revalidateOnFocus: false,
    },
  )
  const { data: drafts = [], mutate: mutateDrafts } = useSWR(
    draftsKey,
    () => soundsApi.listDrafts(),
    {
      revalidateOnFocus: false,
    },
  )

  const records = soundsResponse?.items ?? emptyRecords
  const total = soundsResponse?.total ?? 0
  const totalPages = soundsResponse?.totalPages ?? 1
  const facets = soundsResponse?.facets ?? {
    categories: [],
    labels: [],
    languages: [],
    moods: [],
  }

  useEffect(() => {
    setSelectedIds((currentSelectedIds) => {
      const nextSelectedIds = currentSelectedIds.filter((selectedId) =>
        records.some((record) => record.id === selectedId),
      )

      if (
        nextSelectedIds.length === currentSelectedIds.length &&
        nextSelectedIds.every(
          (selectedId, index) => selectedId === currentSelectedIds[index],
        )
      ) {
        return currentSelectedIds
      }

      return nextSelectedIds
    })
  }, [records])

  const toggleSelectedId = (recordId: string) => {
    setSelectedIds((currentSelectedIds) =>
      currentSelectedIds.includes(recordId)
        ? currentSelectedIds.filter((selectedId) => selectedId !== recordId)
        : [...currentSelectedIds, recordId],
    )
  }

  const allVisibleSelected =
    records.length > 0 &&
    records.every((record) => selectedIds.includes(record.id))

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.05fr,1.35fr]">
        <SectionCard
          description="Drag and drop a sound file, watch the AI analysis flow, then review labels, summary, mood, and category before committing the vector record."
          eyebrow="Studio"
          title="Upload + AI Review"
        >
          <UploadForm
            drafts={drafts}
            onConfirmed={async () => {
              await Promise.all([mutate(), mutateDrafts()])
              setLibraryMessage('New sound indexed and added to the library.')
            }}
            onDraftsChanged={async () => {
              await mutateDrafts()
            }}
          />
        </SectionCard>

        <div className="grid gap-6 sm:grid-cols-3">
          {(
            [
              ['Indexed sounds', String(total), 'Confirmed and searchable'],
              [
                'Pending reviews',
                String(drafts.length),
                'Awaiting user approval',
              ],
              [
                'Visible results',
                String(records.length),
                'Current filter scope',
              ],
            ] as const
          ).map(([label, value, hint]) => (
            <SectionCard
              key={label}
              className="h-full"
              description={hint}
              eyebrow="Snapshot"
              title={<span className="text-3xl font-semibold">{value}</span>}
            >
              <div className="text-sm font-medium text-[color:var(--text-soft)]">
                {label}
              </div>
            </SectionCard>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.78fr,1.45fr]">
        <FiltersPanel
          facets={facets}
          filters={filters}
          onChange={(nextFilters) => {
            startTransition(() => {
              setFilters(nextFilters)
              setPage(1)
            })
          }}
          onReset={() => {
            startTransition(() => {
              setFilters(defaultFilters)
              setSearchInput('')
              setSortBy('createdAt:desc')
              setPage(1)
            })
          }}
        />

        <SectionCard
          description="Explore indexed sounds in grid or list view, preview audio, edit semantic attributes, and perform bulk operations."
          eyebrow="Library"
          title="Search, filter, edit, and curate"
        >
          <div className="space-y-5">
            <LibraryToolbar
              query={searchInput}
              resultCount={records.length}
              sortBy={sortBy}
              total={total}
              viewMode={viewMode}
              onQueryChange={(value) => {
                startTransition(() => {
                  setSearchInput(value)
                  setPage(1)
                })
              }}
              onSortChange={(value) => {
                startTransition(() => {
                  setSortBy(value)
                  setPage(1)
                })
              }}
              onViewModeChange={setViewMode}
            />

            {libraryMessage ? (
              <div className="rounded-[22px] border border-[color:var(--success-border)] bg-[color:var(--success-soft)] px-4 py-3 text-sm text-emerald-50">
                {libraryMessage}
              </div>
            ) : null}

            {selectedIds.length > 0 && (
              <div className="flex flex-col gap-4 rounded-[24px] border border-cyan-300/20 bg-cyan-300/10 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-medium text-cyan-50">
                    {selectedIds.length} sound
                    {selectedIds.length > 1 ? 's' : ''} selected
                  </div>
                  <div className="mt-1 text-sm text-cyan-100/80">
                    Apply bulk metadata changes or remove the selected records
                    from the library.
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-200"
                    type="button"
                    onClick={() => setBulkEditing(true)}
                  >
                    Bulk edit
                  </button>
                  <button
                    className="rounded-full border border-rose-300/30 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:-translate-y-0.5"
                    type="button"
                    onClick={() => {
                      void (async () => {
                        const confirmed = window.confirm(
                          `Delete ${selectedIds.length} selected sound${selectedIds.length > 1 ? 's' : ''}?`,
                        )

                        if (!confirmed) {
                          return
                        }

                        await soundsApi.bulkDelete(selectedIds)
                        setSelectedIds([])
                        setLibraryMessage('Selected sounds were removed.')
                        await mutate()
                      })()
                    }}
                  >
                    Bulk delete
                  </button>
                  <button
                    className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-2 text-sm text-[color:var(--text-strong)]"
                    type="button"
                    onClick={() => {
                      setSelectedIds(
                        allVisibleSelected
                          ? []
                          : records.map((record) => record.id),
                      )
                    }}
                  >
                    {allVisibleSelected
                      ? 'Clear page selection'
                      : 'Select page'}
                  </button>
                </div>
              </div>
            )}

            {error ? (
              <div className="rounded-[24px] border border-[color:var(--danger-border)] bg-[color:var(--danger-soft)] px-4 py-4 text-sm text-rose-100">
                {error instanceof Error
                  ? error.message
                  : 'Failed to load sounds.'}
              </div>
            ) : null}

            {isLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={String(index)}
                    className="processing-stripes h-64 rounded-[28px] border border-[color:var(--card-border)] bg-[color:var(--card-bg)]"
                  />
                ))}
              </div>
            ) : (
              <SoundsTable
                records={records}
                selectedIds={selectedIds}
                viewMode={viewMode}
                onEdit={setEditingRecord}
                onToggleSelect={toggleSelectedId}
              />
            )}

            <div className="flex flex-col gap-4 rounded-[24px] border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-[color:var(--text-soft)]">
                Page {soundsResponse?.page ?? 1} of {totalPages}
              </div>
              <div className="flex gap-3">
                <button
                  className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] px-4 py-2 text-sm text-[color:var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={(soundsResponse?.page ?? 1) <= 1}
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setPage((currentPage) => Math.max(1, currentPage - 1))
                    })
                  }}
                >
                  Previous
                </button>
                <button
                  className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] px-4 py-2 text-sm text-[color:var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={(soundsResponse?.page ?? 1) >= totalPages}
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setPage((currentPage) =>
                        Math.min(totalPages, currentPage + 1),
                      )
                    })
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <SoundEditorModal
        description="Review or update semantic metadata, summary, transcript, and taxonomy fields for this sound record."
        initialPatch={editingRecord ? recordToPatch(editingRecord) : undefined}
        isOpen={Boolean(editingRecord)}
        isSubmitting={isSavingRecord}
        submitLabel="Save changes"
        title={editingRecord ? `Edit ${editingRecord.fileName}` : 'Edit sound'}
        onClose={() => setEditingRecord(null)}
        onSubmit={async (patch) => {
          if (!editingRecord) {
            return
          }

          setIsSavingRecord(true)

          try {
            await soundsApi.updateSound(editingRecord.id, patch)
            setLibraryMessage(`${editingRecord.fileName} updated.`)
            setEditingRecord(null)
            await mutate()
          } finally {
            setIsSavingRecord(false)
          }
        }}
      />

      <SoundEditorModal
        description="Bulk edit selected sounds. Leave fields untouched if you do not want to overwrite them across the selection."
        initialPatch={emptyBulkPatch}
        isOpen={bulkEditing}
        isSubmitting={isSavingBulk}
        submitLabel="Apply bulk changes"
        title="Bulk edit selected sounds"
        onClose={() => setBulkEditing(false)}
        onSubmit={async (patch) => {
          setIsSavingBulk(true)

          try {
            await soundsApi.bulkUpdate(selectedIds, patch)
            setLibraryMessage('Bulk metadata update applied.')
            setBulkEditing(false)
            setSelectedIds([])
            await mutate()
          } finally {
            setIsSavingBulk(false)
          }
        }}
      />
    </div>
  )
}
