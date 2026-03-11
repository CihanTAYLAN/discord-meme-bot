import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { soundsApi } from '@/lib/api-client'
import type { SoundDraft, SoundRecord } from '@/lib/types'

const supportedFormats = ['MP3', 'WAV', 'OGG', 'M4A', 'AAC', 'WEBM']
const supportedExtensions = new Set(
  supportedFormats.map((format) => `.${format.toLowerCase()}`),
)
const maxUploadSizeMb = 20

type UploadPhase =
  | 'idle'
  | 'error'
  | 'processing'
  | 'review'
  | 'success'
  | 'uploading'

interface UploadFormProps {
  drafts: SoundDraft[]
  onConfirmed: (record: SoundRecord) => Promise<void> | void
  onDraftsChanged: () => Promise<void> | void
}

const formatDuration = (durationSeconds: number) =>
  `${Math.floor(durationSeconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.round(durationSeconds % 60)
    .toString()
    .padStart(2, '0')}`

const toEditableState = (draft: SoundDraft) => ({
  audioCues: draft.audioCues.join(', '),
  category: draft.category,
  labels: draft.labels.join(', '),
  mood: draft.mood,
  primaryContext: draft.primaryContext,
  primaryTone: draft.primaryTone,
  summary: draft.summary,
  topicHints: draft.topicHints.join(', '),
  transcript: draft.transcript,
})

const parseCommaInput = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

type UploadEditorState = {
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

const reviewFieldDefinitions: Array<{
  isWide?: boolean
  key: keyof UploadEditorState
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

const buildCaptionTrack = (transcript: string) =>
  `data:text/vtt;charset=utf-8,${encodeURIComponent(
    `WEBVTT\n\n00:00.000 --> 59:59.000\n${transcript || 'Audio preview'}`,
  )}`

export const UploadForm = ({
  drafts,
  onConfirmed,
  onDraftsChanged,
}: UploadFormProps) => {
  const inputReference = useRef<HTMLInputElement | null>(null)
  const progressTimerReference = useRef<number | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [statusMessage, setStatusMessage] = useState(
    'Drop an audio file to start AI analysis.',
  )
  const [uploadProgress, setUploadProgress] = useState(0)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const [editorState, setEditorState] = useState<UploadEditorState>({
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
  const [submittingDecision, setSubmittingDecision] = useState(false)

  const pendingDrafts = useMemo(
    () =>
      [...drafts].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt),
      ),
    [drafts],
  )
  const activeDraft =
    pendingDrafts.find((draft) => draft.id === activeDraftId) ??
    pendingDrafts[0] ??
    null

  useEffect(() => {
    if (!activeDraft) {
      setActiveDraftId(null)
      if (phase === 'review') {
        setPhase('idle')
        setStatusMessage('Drop an audio file to start AI analysis.')
      }
      return
    }

    setActiveDraftId(activeDraft.id)
    setEditorState(toEditableState(activeDraft))
    if (phase !== 'uploading' && phase !== 'processing') {
      setPhase('review')
      setStatusMessage(
        'AI analysis is ready for review. Edit anything before saving.',
      )
    }
  }, [activeDraft, phase])

  useEffect(() => {
    return () => {
      if (progressTimerReference.current) {
        window.clearInterval(progressTimerReference.current)
      }
    }
  }, [])

  const setFileFromInput = (file: File | null) => {
    if (!file) {
      return
    }

    const extension = file.name
      .slice(file.name.lastIndexOf('.'))
      .toLocaleLowerCase('en-US')

    if (!supportedExtensions.has(extension)) {
      setSelectedFile(null)
      setPhase('error')
      setStatusMessage(
        `Unsupported file format. Accepted formats: ${supportedFormats.join(', ')}.`,
      )
      return
    }

    if (file.size > maxUploadSizeMb * 1024 * 1024) {
      setSelectedFile(null)
      setPhase('error')
      setStatusMessage(`File exceeds the ${maxUploadSizeMb} MB upload limit.`)
      return
    }

    setSelectedFile(file)
    setStatusMessage(
      `${file.name} selected. AI analysis will start after upload.`,
    )
    setPhase('idle')
  }

  const startProgressAnimation = () => {
    if (progressTimerReference.current) {
      window.clearInterval(progressTimerReference.current)
    }

    setUploadProgress(8)
    progressTimerReference.current = window.setInterval(() => {
      setUploadProgress((currentValue) => {
        if (currentValue >= 78) {
          return currentValue
        }

        return currentValue + Math.max(2, Math.round((82 - currentValue) / 6))
      })
    }, 240)
  }

  const stopProgressAnimation = () => {
    if (progressTimerReference.current) {
      window.clearInterval(progressTimerReference.current)
      progressTimerReference.current = null
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      setPhase('error')
      setStatusMessage('Select an audio file first.')
      return
    }

    setPhase('uploading')
    setStatusMessage('Uploading file and preparing AI analysis...')
    startProgressAnimation()

    try {
      const draft = await soundsApi.uploadDraft(selectedFile)
      stopProgressAnimation()
      setUploadProgress(100)
      setActiveDraftId(draft.id)
      setEditorState(toEditableState(draft))
      setPhase('review')
      setStatusMessage(
        'Analysis finished. Review AI suggestions before confirming.',
      )
      await onDraftsChanged()

      if (inputReference.current) {
        inputReference.current.value = ''
      }
      setSelectedFile(null)
    } catch (error) {
      stopProgressAnimation()
      setPhase('error')
      setUploadProgress(0)
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Audio analysis failed unexpectedly.',
      )
    }
  }

  const handleConfirmDraft = async () => {
    if (!activeDraft) {
      return
    }

    setSubmittingDecision(true)
    setStatusMessage('Saving approved metadata and writing vector record...')

    try {
      const record = await soundsApi.confirmDraft(activeDraft.id, {
        audioCues: parseCommaInput(editorState.audioCues),
        category: editorState.category.trim(),
        labels: parseCommaInput(editorState.labels),
        mood: editorState.mood.trim(),
        primaryContext: editorState.primaryContext.trim(),
        primaryTone: editorState.primaryTone.trim(),
        summary: editorState.summary.trim(),
        topicHints: parseCommaInput(editorState.topicHints),
        transcript: editorState.transcript.trim(),
      })
      setPhase('success')
      setStatusMessage(`${record.fileName} indexed successfully.`)
      await onConfirmed(record)
      await onDraftsChanged()
    } catch (error) {
      setPhase('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to confirm draft.',
      )
    } finally {
      setSubmittingDecision(false)
    }
  }

  const handleDiscardDraft = async () => {
    if (!activeDraft) {
      return
    }

    setSubmittingDecision(true)

    try {
      await soundsApi.discardDraft(activeDraft.id)
      setStatusMessage('Draft discarded.')
      await onDraftsChanged()
    } catch (error) {
      setPhase('error')
      setStatusMessage(
        error instanceof Error ? error.message : 'Failed to discard draft.',
      )
    } finally {
      setSubmittingDecision(false)
    }
  }

  return (
    <div className="space-y-6">
      <div
        className={clsx(
          'group relative overflow-hidden rounded-[28px] border border-dashed px-5 py-6 transition sm:px-6',
          dragActive
            ? 'border-cyan-300/70 bg-cyan-300/10 shadow-[0_0_0_6px_rgba(103,232,249,0.08)]'
            : 'border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] hover:border-cyan-300/40 hover:bg-[color:var(--card-bg)]',
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_38%)]" />
        <div className="relative">
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--text-strong)]">
                Drag, drop, review, confirm
              </h3>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-soft)]">
                Upload audio, let the AI suggest semantic metadata, then approve
                or refine the result before it reaches Chroma.
              </p>
            </div>
            <div className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-3 py-2 text-xs font-medium uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
              {supportedFormats.join(' · ')}
            </div>
          </div>

          <input
            ref={inputReference}
            accept=".mp3,.wav,.ogg,.m4a,.aac,.webm,audio/*"
            className="sr-only"
            data-testid="upload-input"
            type="file"
            onChange={(event) => {
              setFileFromInput(event.currentTarget.files?.[0] ?? null)
            }}
          />

          <button
            className="flex w-full flex-col items-start gap-5 rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] px-5 py-6 text-left transition hover:-translate-y-0.5"
            type="button"
            onDragEnter={(event) => {
              event.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              if (
                event.currentTarget.contains(event.relatedTarget as Node | null)
              ) {
                return
              }

              setDragActive(false)
            }}
            onDragOver={(event) => {
              event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              setDragActive(false)
              setFileFromInput(event.dataTransfer.files?.[0] ?? null)
            }}
            onClick={() => inputReference.current?.click()}
          >
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/15 text-2xl text-cyan-100">
                ↑
              </div>
              <div>
                <div className="text-base font-semibold text-[color:var(--text-strong)]">
                  {selectedFile
                    ? selectedFile.name
                    : 'Drop an audio file here or browse from disk'}
                </div>
                <div className="mt-2 text-sm leading-6 text-[color:var(--text-soft)]">
                  Supported: {supportedFormats.join(', ')}. Maximum size:{' '}
                  {maxUploadSizeMb} MB. Files stay in the shared `sounds/`
                  workspace so you can preview and approve them before indexing.
                </div>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-3">
              <span className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
                Drag & drop enabled
              </span>
              <span className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
                AI summary, labels, mood and category
              </span>
              <span className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-3 py-1 text-xs text-[color:var(--text-muted)]">
                Human approval before vector write
              </span>
            </div>
          </button>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex items-center rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                !selectedFile || phase === 'uploading' || phase === 'processing'
              }
              type="button"
              onClick={() => {
                void handleUpload()
              }}
            >
              {phase === 'uploading' || phase === 'processing'
                ? 'Analyzing...'
                : 'Start AI analysis'}
            </button>
            <div className="text-sm text-[color:var(--text-soft)]">
              {statusMessage}
            </div>
          </div>

          {(phase === 'uploading' || phase === 'processing') && (
            <div className="mt-5 rounded-[24px] border border-cyan-300/20 bg-cyan-300/10 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-cyan-50">
                  AI analysis in progress
                </span>
                <span className="text-cyan-100/80">{uploadProgress}%</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/8">
                <div
                  className="processing-stripes h-full rounded-full bg-cyan-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {[
                  'Uploading source audio',
                  'Running speech-to-text and acoustic profiling',
                  'Generating editable semantic metadata',
                ].map((step) => (
                  <div
                    key={step}
                    className="rounded-2xl border border-white/10 bg-white/6 px-3 py-3 text-sm text-cyan-50/90"
                  >
                    {step}
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="mt-5 rounded-[24px] border border-[color:var(--danger-border)] bg-[color:var(--danger-soft)] px-4 py-4 text-sm text-rose-100">
              {statusMessage}
            </div>
          )}
        </div>
      </div>

      {pendingDrafts.length > 0 && (
        <div className="space-y-4 rounded-[28px] border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[color:var(--text-strong)]">
                Pending AI review
              </h3>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">
                Review AI-generated suggestions before the vector index is
                updated.
              </p>
            </div>
            <div className="rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-3 py-1 text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
              {pendingDrafts.length} draft{pendingDrafts.length > 1 ? 's' : ''}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[0.9fr,1.4fr]">
            <div className="soft-scroll max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {pendingDrafts.map((draft) => (
                <button
                  key={draft.id}
                  className={clsx(
                    'w-full rounded-[22px] border px-4 py-4 text-left transition hover:-translate-y-0.5',
                    activeDraft?.id === draft.id
                      ? 'border-cyan-300/50 bg-cyan-300/12'
                      : 'border-[color:var(--card-border)] bg-[color:var(--card-bg)] hover:bg-[color:var(--card-bg-strong)]',
                  )}
                  type="button"
                  onClick={() => {
                    setActiveDraftId(draft.id)
                    setEditorState(toEditableState(draft))
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-[color:var(--text-strong)]">
                        {draft.fileName}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--text-muted)]">
                        {formatDuration(draft.durationSeconds)} {'·'}{' '}
                        {draft.language.toUpperCase()}
                      </div>
                    </div>
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-50">
                      {draft.category}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-[color:var(--text-soft)]">
                    {draft.summary}
                  </p>
                </button>
              ))}
            </div>

            {activeDraft && (
              <div className="space-y-4 rounded-[24px] border border-[color:var(--card-border)] bg-[color:var(--card-bg)] p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <div className="text-xl font-semibold text-[color:var(--text-strong)]">
                      Review AI suggestions
                    </div>
                    <p className="mt-2 text-sm text-[color:var(--text-soft)]">
                      Adjust anything you want before confirming the vector
                      write.
                    </p>
                  </div>
                  <audio
                    className="w-full max-w-sm"
                    controls
                    preload="none"
                    src={soundsApi.draftAudioUrl(activeDraft.id)}
                  >
                    <track
                      default
                      kind="captions"
                      label="Transcript"
                      src={buildCaptionTrack(editorState.transcript)}
                      srcLang={activeDraft.language}
                    />
                  </audio>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Duration', formatDuration(activeDraft.durationSeconds)],
                    ['Suggested mood', activeDraft.mood],
                    ['Delivery', activeDraft.metadata.deliveryStyle],
                    ['Interaction', activeDraft.metadata.interactionMode],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] px-4 py-3"
                    >
                      <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                        {label}
                      </div>
                      <div className="mt-2 text-sm font-medium text-[color:var(--text-strong)]">
                        {value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {reviewFieldDefinitions.map((field) => (
                    <label
                      key={field.key}
                      className={clsx(
                        'block',
                        field.isWide ? 'md:col-span-2' : '',
                      )}
                      htmlFor={`draft-editor-${field.key}`}
                    >
                      <span className="mb-2 block text-sm font-medium text-[color:var(--text-soft)]">
                        {field.label}
                      </span>
                      {field.type === 'textarea' ? (
                        <textarea
                          id={`draft-editor-${field.key}`}
                          className="min-h-28 w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none transition focus:border-cyan-300/60"
                          value={editorState[field.key]}
                          onChange={(event) => {
                            setEditorState((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }}
                        />
                      ) : (
                        <input
                          id={`draft-editor-${field.key}`}
                          className="w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none transition focus:border-cyan-300/60"
                          value={editorState[field.key]}
                          onChange={(event) => {
                            setEditorState((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }}
                        />
                      )}
                    </label>
                  ))}
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-[color:var(--text-soft)]">
                    Transcript
                  </span>
                  <textarea
                    className="min-h-32 w-full rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] px-4 py-3 text-sm text-[color:var(--text-strong)] outline-none transition focus:border-cyan-300/60"
                    value={editorState.transcript}
                    onChange={(event) => {
                      setEditorState((current) => ({
                        ...current,
                        transcript: event.target.value,
                      }))
                    }}
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    className="inline-flex items-center rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={submittingDecision}
                    type="button"
                    onClick={() => {
                      void handleConfirmDraft()
                    }}
                  >
                    {submittingDecision ? 'Saving...' : 'Confirm and index'}
                  </button>
                  <button
                    className="inline-flex items-center rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] px-5 py-3 text-sm font-medium text-[color:var(--text-strong)] transition hover:-translate-y-0.5"
                    disabled={submittingDecision}
                    type="button"
                    onClick={() => {
                      void handleDiscardDraft()
                    }}
                  >
                    Discard draft
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === 'success' && (
        <div className="rounded-[24px] border border-[color:var(--success-border)] bg-[color:var(--success-soft)] px-4 py-4 text-sm text-emerald-50">
          {statusMessage}
        </div>
      )}
    </div>
  )
}
