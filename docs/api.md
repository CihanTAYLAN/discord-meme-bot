# API

## Health

### `GET /health`
Returns a basic health payload.

Example:
```json
{
  "service": "discord-meme-bot-api",
  "status": "ok",
  "timestamp": "2026-03-11T12:00:00.000Z"
}
```

## Sound Library

### `GET /api/v1/sounds`
Returns a paginated `SoundsListResponse`.

Supported query params:
- `query`
- `page`
- `pageSize`
- `sortBy`
- `labels`
- `categories`
- `moods`
- `languages`
- `dateFrom`
- `dateTo`
- `minDurationSeconds`
- `maxDurationSeconds`

Response shape:
```json
{
  "items": [
    {
      "id": "uuid",
      "fileName": "1710160000-sample.mp3",
      "filePath": "/abs/path/to/sounds/1710160000-sample.mp3",
      "summary": "animated surprised reaction",
      "labels": ["şaşkın", "ani tepki"],
      "category": "reaction",
      "mood": "excited",
      "primaryTone": "surprised",
      "primaryContext": "unexpected moment",
      "audioCues": ["energetic delivery"],
      "topicHints": ["surprise", "reaction"],
      "language": "tr",
      "durationSeconds": 6.2,
      "fileSizeBytes": 120000,
      "metadata": {
        "deliveryStyle": "explosive",
        "energyBucket": "high",
        "interactionMode": "statement",
        "paceBucket": "steady",
        "pauseBucket": "light"
      },
      "createdAt": "2026-03-11T12:00:00.000Z",
      "updatedAt": "2026-03-11T12:00:00.000Z",
      "transcript": "oha bu ne"
    }
  ],
  "page": 1,
  "pageSize": 9,
  "total": 1,
  "totalPages": 1,
  "facets": {
    "labels": ["şaşkın", "ani tepki"],
    "categories": ["reaction"],
    "moods": ["excited"],
    "languages": ["tr"]
  }
}
```

### `PATCH /api/v1/sounds/:id`
Applies an inline metadata update to a confirmed sound record.

### `POST /api/v1/sounds/bulk-update`
Bulk-patches selected sound records.

Request shape:
```json
{
  "ids": ["uuid-1", "uuid-2"],
  "patch": {
    "category": "reaction",
    "labels": ["şaşkın", "ani tepki"]
  }
}
```

### `POST /api/v1/sounds/bulk-delete`
Deletes selected records from both the catalog and Chroma.

Request shape:
```json
{
  "ids": ["uuid-1", "uuid-2"]
}
```

### `GET /api/v1/sounds/:id/audio`
Streams the stored audio file for inline preview.

## Draft Review Flow

### `GET /api/v1/sounds/drafts`
Returns all pending `SoundDraft` objects.

### `POST /api/v1/sounds/drafts`
Multipart upload endpoint for review-first ingestion.

Form fields:
- `file`: required audio file

Accepted formats:
- `mp3`
- `wav`
- `ogg`
- `m4a`
- `aac`
- `webm`

Limit:
- `20 MB`

The API:
- stores the uploaded file under `sounds/`
- runs transcription
- extracts acoustic metrics
- generates semantic metadata
- returns a draft without yet writing the final vector record

### `POST /api/v1/sounds/drafts/:id/confirm`
Confirms a draft and writes the final record to:
- `data/sounds.json`
- Chroma

### `DELETE /api/v1/sounds/drafts/:id`
Removes a pending draft and deletes its staged file.

### `GET /api/v1/sounds/drafts/:id/audio`
Streams the staged draft audio so the dashboard can preview it before confirmation.

## Live Voice Matching

### `POST /api/v1/segments`
Multipart endpoint used by the bot for live voice segments.

Form fields:
- `audio`: required WAV file
- `guildId`
- `speakerId`
- `speakerName`
- `durationMs`
- `tailSilenceMs`
- `endedBy`

Responses:
```json
{ "status": "pending" }
```

```json
{
  "status": "no_match",
  "transcript": "...",
  "summary": "...",
  "labels": ["şaşkın"],
  "similarity": null
}
```

```json
{
  "status": "matched",
  "transcript": "...",
  "summary": "...",
  "labels": ["şaşkın"],
  "match": {
    "soundId": "uuid",
    "fileName": "meme.mp3",
    "filePath": "/abs/path/to/sounds/meme.mp3",
    "similarity": 0.91
  }
}
```

## Internal Services
- `PythonWhisperWorker`
- `EmbeddingService`
- `ContextAnalyzer`
- `AnalysisDraftStore`
- `SemanticPendingStore`
- `VectorDbService`
- `FileSoundCatalog`
- `AudioPipelineService`
