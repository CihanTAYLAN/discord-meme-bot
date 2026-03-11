# Dashboard

## Goal
The dashboard is the operational surface for the meme sound library. It is designed for fast ingestion, AI-assisted review, search, editing, and cleanup without requiring auth in v1.

## Structure
The app keeps the same top-level shape as the Vite boilerplate:
- `src/app`
- `src/routes`
- `src/features`
- `src/components`
- `src/lib`
- `src/store`

## Main Experience
The default route is split into two product areas:
- `Upload + AI Review`: drag-and-drop ingestion with progress feedback and editable AI suggestions
- `Searchable sound library`: paginated grid/list view with filters, inline playback, editing, and bulk actions

## Upload Flow
1. The user drops or selects an audio file.
2. The client validates extension and the `20 MB` limit before upload.
3. The dashboard uploads the file to `POST /api/v1/sounds/drafts`.
4. The API stores the file, transcribes it, computes acoustic metrics, builds semantic metadata, and returns a `SoundDraft`.
5. The user reviews and edits:
   - `summary`
   - `labels`
   - `category`
   - `mood`
   - `primaryTone`
   - `primaryContext`
   - `topicHints`
   - `audioCues`
   - `transcript`
6. Approval writes the final vector record through `POST /api/v1/sounds/drafts/:id/confirm`.
7. Rejection deletes the draft through `DELETE /api/v1/sounds/drafts/:id`.

## Library Features
- full-text search over file name, transcript, labels, category, and mood
- filters for labels, categories, moods, languages, date range, and duration
- paginated results with grid and list modes
- inline audio playback on each card
- modal editing for individual records
- bulk selection
- bulk metadata patch
- bulk delete
- empty, loading, success, and error states
- dark mode and responsive layout

## Runtime Config
The app reads runtime values from `window.__ENV__`.

Generated fields:
- `API_BASE_URL`
- `APP_ENV`

The file is created by:
```bash
yarn workspace dashboard env:generate
```

## Testing
The dashboard test covers the real review flow:
- load initial library state
- upload a draft
- show AI review UI
- confirm the draft
- assert the indexed sound appears in the library
