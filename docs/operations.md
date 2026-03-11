# Operations

## Important Environment Variables
- `CHROMA_URL`
- `CHROMA_COLLECTION_NAME`
- `SIMILARITY_THRESHOLD`
- `SEGMENT_SILENCE_MS`
- `SEGMENT_MIN_MS`
- `SEGMENT_MAX_MS`
- `SEGMENT_MAX_GRACE_MS`
- `SEMANTIC_MERGE_WINDOW_MS`
- `EMBEDDING_MODEL`
- `WHISPER_MODEL`
- `WHISPER_DEVICE`
- `WHISPER_COMPUTE_TYPE`
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`

## Logs
Both Node services use scope-based console logging with timestamped lines.

Log scopes include:
- `api`
- `embedding`
- `vector-db`
- `catalog`
- `pipeline`
- `whisper-worker`
- `bot`

## Failure Modes
- Chroma unavailable:
  - API startup or query failures
  - dashboard list and confirm actions fail
  - no live matches for the bot
- Whisper worker unavailable:
  - draft creation fails
  - live segment requests fail
- ffmpeg missing:
  - playback queue cannot transcode MP3 files for Discord
- invalid upload:
  - dashboard draft creation fails for unsupported formats or files over `20 MB`

## Tuning Guidance
- Raise `SIMILARITY_THRESHOLD` if memes trigger too often.
- Lower `SEGMENT_SILENCE_MS` if speakers pause briefly and never flush.
- Increase `SEMANTIC_MERGE_WINDOW_MS` if utterances are regularly split too aggressively.
- If contextual matches feel too generic, review `summary`, `labels`, and `topicHints` quality in saved records before changing vector settings.

## Suggested Debug Sequence
1. `GET /health`
2. create one upload draft through the dashboard
3. confirm the reviewed draft
4. confirm `data/sounds.json` was updated
5. confirm Chroma contains the record
6. join a test voice channel and speak a sentence that should resemble the indexed meme
