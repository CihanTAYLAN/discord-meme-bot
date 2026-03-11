import clsx from 'clsx'
import type { SoundsListFacets } from '@/lib/types'

export interface FilterState {
  categories: string[]
  dateFrom: string
  dateTo: string
  labels: string[]
  languages: string[]
  maxDurationSeconds: string
  minDurationSeconds: string
  moods: string[]
}

interface FiltersPanelProps {
  facets: SoundsListFacets
  filters: FilterState
  onChange: (nextFilters: FilterState) => void
  onReset: () => void
}

const toggleValue = (list: string[], value: string) =>
  list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value]

const FilterGroup = ({
  items,
  selectedValues,
  title,
  onToggle,
}: {
  items: string[]
  selectedValues: string[]
  title: string
  onToggle: (value: string) => void
}) => {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            className={clsx(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition',
              selectedValues.includes(item)
                ? 'border-cyan-300/40 bg-cyan-300/12 text-cyan-100'
                : 'border-[color:var(--card-border)] bg-[color:var(--card-bg)] text-[color:var(--text-soft)] hover:bg-[color:var(--card-bg-strong)]',
            )}
            type="button"
            onClick={() => onToggle(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}

export const FiltersPanel = ({
  facets,
  filters,
  onChange,
  onReset,
}: FiltersPanelProps) => (
  <aside className="space-y-5 rounded-[28px] border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] p-5">
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-lg font-semibold text-[color:var(--text-strong)]">
          Filters
        </div>
        <p className="mt-1 text-sm text-[color:var(--text-soft)]">
          Narrow the library by semantics, time range, and duration.
        </p>
      </div>
      <button
        className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]"
        type="button"
        onClick={onReset}
      >
        Reset
      </button>
    </div>

    <FilterGroup
      items={facets.labels}
      selectedValues={filters.labels}
      title="Labels"
      onToggle={(value) => {
        onChange({
          ...filters,
          labels: toggleValue(filters.labels, value),
        })
      }}
    />
    <FilterGroup
      items={facets.categories}
      selectedValues={filters.categories}
      title="Categories"
      onToggle={(value) => {
        onChange({
          ...filters,
          categories: toggleValue(filters.categories, value),
        })
      }}
    />
    <FilterGroup
      items={facets.moods}
      selectedValues={filters.moods}
      title="Moods"
      onToggle={(value) => {
        onChange({
          ...filters,
          moods: toggleValue(filters.moods, value),
        })
      }}
    />
    <FilterGroup
      items={facets.languages}
      selectedValues={filters.languages}
      title="Languages"
      onToggle={(value) => {
        onChange({
          ...filters,
          languages: toggleValue(filters.languages, value),
        })
      }}
    />

    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          Min duration
        </span>
        <input
          className="w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none"
          placeholder="0"
          value={filters.minDurationSeconds}
          onChange={(event) =>
            onChange({
              ...filters,
              minDurationSeconds: event.target.value,
            })
          }
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          Max duration
        </span>
        <input
          className="w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none"
          placeholder="60"
          value={filters.maxDurationSeconds}
          onChange={(event) =>
            onChange({
              ...filters,
              maxDurationSeconds: event.target.value,
            })
          }
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          Date from
        </span>
        <input
          className="w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none"
          type="date"
          value={filters.dateFrom}
          onChange={(event) =>
            onChange({
              ...filters,
              dateFrom: event.target.value,
            })
          }
        />
      </label>
      <label className="block">
        <span className="mb-2 block text-xs uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
          Date to
        </span>
        <input
          className="w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none"
          type="date"
          value={filters.dateTo}
          onChange={(event) =>
            onChange({
              ...filters,
              dateTo: event.target.value,
            })
          }
        />
      </label>
    </div>
  </aside>
)
