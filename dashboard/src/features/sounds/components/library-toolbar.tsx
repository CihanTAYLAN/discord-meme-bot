import clsx from 'clsx'
import type { SoundsListQuery } from '@/lib/types'

interface LibraryToolbarProps {
  query: string
  resultCount: number
  sortBy: SoundsListQuery['sortBy']
  total: number
  viewMode: 'grid' | 'list'
  onQueryChange: (value: string) => void
  onSortChange: (value: SoundsListQuery['sortBy']) => void
  onViewModeChange: (value: 'grid' | 'list') => void
}

const viewOptions: Array<{ label: string; value: 'grid' | 'list' }> = [
  { label: 'Grid', value: 'grid' },
  { label: 'List', value: 'list' },
]

export const LibraryToolbar = ({
  query,
  resultCount,
  sortBy,
  total,
  viewMode,
  onQueryChange,
  onSortChange,
  onViewModeChange,
}: LibraryToolbarProps) => (
  <div className="flex flex-col gap-4 rounded-[28px] border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-2xl">
        <h3 className="text-lg font-semibold text-[color:var(--text-strong)]">
          Searchable sound library
        </h3>
        <p className="mt-2 text-sm text-[color:var(--text-soft)]">
          Full-text search, metadata filters, inline playback, record editing,
          and bulk actions for the indexed meme library.
        </p>
      </div>
      <div className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-2 text-sm text-[color:var(--text-soft)]">
        {resultCount} visible / {total} total
      </div>
    </div>

    <div className="grid gap-3 lg:grid-cols-[1.6fr,0.7fr,0.55fr]">
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          Search
        </span>
        <input
          className="w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none transition focus:border-cyan-300/60"
          placeholder="Search file name, transcript, labels, category, mood..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          Sort
        </span>
        <select
          className="w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none transition focus:border-cyan-300/60"
          value={sortBy}
          onChange={(event) =>
            onSortChange(event.target.value as SoundsListQuery['sortBy'])
          }
        >
          <option value="createdAt:desc">Newest first</option>
          <option value="createdAt:asc">Oldest first</option>
          <option value="duration:desc">Longest first</option>
          <option value="duration:asc">Shortest first</option>
          <option value="fileName:asc">File name A-Z</option>
        </select>
      </label>

      <div>
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          View
        </span>
        <div className="flex rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] p-1">
          {viewOptions.map((option) => (
            <button
              key={option.value}
              className={clsx(
                'flex-1 rounded-xl px-3 py-2 text-sm font-medium transition',
                viewMode === option.value
                  ? 'bg-cyan-300 text-slate-950'
                  : 'text-[color:var(--text-soft)] hover:bg-white/6',
              )}
              type="button"
              onClick={() => onViewModeChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
)
