import clsx from 'clsx'
import { useEffect, useState } from 'react'
import type { SoundRecord, SoundUpdateInput } from '@/lib/types'

type EditorState = {
  audioCues: string
  category: string
  labels: string
  mood: string
  primaryContext: string
  primaryTone: string
  summary: string
  topicHints: string
  transcript: string
}

interface SoundEditorModalProps {
  description: string
  isOpen: boolean
  initialPatch?: Partial<SoundUpdateInput>
  isSubmitting: boolean
  submitLabel: string
  title: string
  onClose: () => void
  onSubmit: (patch: SoundUpdateInput) => Promise<void> | void
}

const parseCommaInput = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

const valueOrEmpty = (value?: string[] | string) =>
  Array.isArray(value) ? value.join(', ') : (value ?? '')

const fieldDefinitions: Array<{
  isWide?: boolean
  key: keyof EditorState
  label: string
  type: 'input' | 'textarea'
}> = [
  { isWide: true, key: 'summary', label: 'Summary', type: 'textarea' },
  { key: 'labels', label: 'Labels', type: 'input' },
  { key: 'category', label: 'Category', type: 'input' },
  { key: 'mood', label: 'Mood', type: 'input' },
  { key: 'primaryTone', label: 'Primary tone', type: 'input' },
  { key: 'primaryContext', label: 'Primary context', type: 'input' },
  { key: 'audioCues', label: 'Audio cues', type: 'input' },
  { key: 'topicHints', label: 'Topic hints', type: 'input' },
]

export const recordToPatch = (record: SoundRecord): SoundUpdateInput => ({
  audioCues: [...record.audioCues],
  category: record.category,
  labels: [...record.labels],
  mood: record.mood,
  primaryContext: record.primaryContext,
  primaryTone: record.primaryTone,
  summary: record.summary,
  topicHints: [...record.topicHints],
  transcript: record.transcript,
})

export const SoundEditorModal = ({
  description,
  initialPatch,
  isOpen,
  isSubmitting,
  submitLabel,
  title,
  onClose,
  onSubmit,
}: SoundEditorModalProps) => {
  const [formState, setFormState] = useState<EditorState>({
    audioCues: '',
    category: '',
    labels: '',
    mood: '',
    primaryContext: '',
    primaryTone: '',
    summary: '',
    topicHints: '',
    transcript: '',
  })

  useEffect(() => {
    if (!initialPatch) {
      return
    }

    setFormState({
      audioCues: valueOrEmpty(initialPatch.audioCues),
      category: valueOrEmpty(initialPatch.category),
      labels: valueOrEmpty(initialPatch.labels),
      mood: valueOrEmpty(initialPatch.mood),
      primaryContext: valueOrEmpty(initialPatch.primaryContext),
      primaryTone: valueOrEmpty(initialPatch.primaryTone),
      summary: valueOrEmpty(initialPatch.summary),
      topicHints: valueOrEmpty(initialPatch.topicHints),
      transcript: valueOrEmpty(initialPatch.transcript),
    })
  }, [initialPatch])

  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur">
      <div className="soft-scroll max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] p-6 shadow-[0_32px_100px_rgba(15,23,42,0.45)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-[color:var(--text-strong)]">
              {title}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--text-soft)]">
              {description}
            </p>
          </div>
          <button
            className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-2 text-sm text-[color:var(--text-strong)]"
            type="button"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {fieldDefinitions.map((field) => (
            <label
              key={field.key}
              className={clsx('block', field.isWide ? 'md:col-span-2' : '')}
              htmlFor={`sound-editor-${field.key}`}
            >
              <span className="mb-2 block text-sm font-medium text-[color:var(--text-soft)]">
                {field.label}
              </span>
              {field.type === 'textarea' ? (
                <textarea
                  id={`sound-editor-${field.key}`}
                  className="min-h-28 w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none transition focus:border-cyan-300/60"
                  value={formState[field.key]}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                />
              ) : (
                <input
                  id={`sound-editor-${field.key}`}
                  className="w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none transition focus:border-cyan-300/60"
                  value={formState[field.key]}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                />
              )}
            </label>
          ))}

          <label className="block md:col-span-2">
            <span className="mb-2 block text-sm font-medium text-[color:var(--text-soft)]">
              Transcript
            </span>
            <textarea
              className="min-h-36 w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none transition focus:border-cyan-300/60"
              value={formState.transcript}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  transcript: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isSubmitting}
            type="button"
            onClick={() => {
              void onSubmit({
                audioCues: parseCommaInput(formState.audioCues),
                category: formState.category.trim() || undefined,
                labels: parseCommaInput(formState.labels),
                mood: formState.mood.trim() || undefined,
                primaryContext: formState.primaryContext.trim() || undefined,
                primaryTone: formState.primaryTone.trim() || undefined,
                summary: formState.summary.trim() || undefined,
                topicHints: parseCommaInput(formState.topicHints),
                transcript: formState.transcript.trim() || undefined,
              })
            }}
          >
            {isSubmitting ? 'Saving...' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
