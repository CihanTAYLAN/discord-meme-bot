import clsx from 'clsx'
import { soundsApi } from '@/lib/api-client'
import type { SoundRecord } from '@/lib/types'

interface SoundsTableProps {
  selectedIds: string[]
  records: SoundRecord[]
  viewMode: 'grid' | 'list'
  onEdit: (record: SoundRecord) => void
  onToggleSelect: (recordId: string) => void
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const formatDuration = (durationSeconds: number) =>
  `${Math.floor(durationSeconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.round(durationSeconds % 60)
    .toString()
    .padStart(2, '0')}`

const buildCaptionTrack = (transcript: string) =>
  `data:text/vtt;charset=utf-8,${encodeURIComponent(
    `WEBVTT\n\n00:00.000 --> 59:59.000\n${transcript || 'Audio preview'}`,
  )}`

export const SoundsTable = ({
  selectedIds,
  records,
  viewMode,
  onEdit,
  onToggleSelect,
}: SoundsTableProps) => {
  if (records.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-6 py-12 text-center text-sm text-[color:var(--text-soft)]">
        No indexed sounds match the current filters. Try clearing the filter
        panel or confirm a new upload draft.
      </div>
    )
  }

  return (
    <div
      className={clsx(
        viewMode === 'grid'
          ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'
          : 'space-y-4',
      )}
    >
      {records.map((record) => {
        const isSelected = selectedIds.includes(record.id)

        return (
          <article
            key={record.id}
            className={clsx(
              'rounded-[28px] border p-5 transition hover:-translate-y-0.5',
              isSelected
                ? 'border-cyan-300/50 bg-cyan-300/10'
                : 'border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)]',
              viewMode === 'list'
                ? 'grid gap-4 lg:grid-cols-[1.2fr,0.9fr]'
                : '',
            )}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold text-[color:var(--text-strong)]">
                    {record.fileName}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--text-muted)]">
                    <span>{record.language.toUpperCase()}</span>
                    <span>•</span>
                    <span>{formatDuration(record.durationSeconds)}</span>
                    <span>•</span>
                    <span>{formatDate(record.createdAt)}</span>
                  </div>
                </div>
                <input
                  checked={isSelected}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                  type="checkbox"
                  onChange={() => onToggleSelect(record.id)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  record.category,
                  record.mood,
                  record.metadata?.deliveryStyle,
                ].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-3 py-1 text-xs text-[color:var(--text-soft)]"
                  >
                    {chip}
                  </span>
                ))}
              </div>

              <p className="text-sm leading-6 text-[color:var(--text-soft)]">
                {record.summary}
              </p>

              <div>
                <div className="text-sm font-medium text-[color:var(--text-strong)]">
                  {record.primaryTone}
                </div>
                <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {record.primaryContext}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {record.labels.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-50"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-between gap-4">
              <audio
                className="w-full"
                controls
                preload="none"
                src={soundsApi.audioUrl(record.id)}
              >
                <track
                  default
                  kind="captions"
                  label="Transcript"
                  src={buildCaptionTrack(record.transcript)}
                  srcLang={record.language}
                />
              </audio>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    Topic hints
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--text-soft)]">
                    {record.topicHints?.join(', ') || 'None'}
                  </div>
                </div>
                <div className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                    Audio cues
                  </div>
                  <div className="mt-2 text-sm text-[color:var(--text-soft)]">
                    {record.audioCues?.join(', ') || 'None'}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex items-center rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-200"
                  type="button"
                  onClick={() => onEdit(record)}
                >
                  Edit attributes
                </button>
                <div className="text-xs text-[color:var(--text-muted)]">
                  {Math.round(record.fileSizeBytes / 1024)} KB
                </div>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}
