# Bot

## Responsibilities
- register slash commands
- join and leave voice channels
- receive per-speaker audio streams
- segment PCM into acoustic chunks
- submit segments to the API
- play returned meme MP3 files in FIFO order

## Slash Commands
- `/join [channel]`
  - if `channel` is omitted, the bot uses the caller's current voice channel
  - only standard guild voice channels are supported
- `/leave`
  - stops the guild queue
  - destroys the voice connection

## Text Commands
- `meme!play <query>`
  - searches indexed meme sounds by semantic similarity using the provided text
  - reuses the active guild voice session if one already exists
  - if there is no active session, the bot joins the caller's current voice channel first
  - the caller must be in the same voice channel as the active session
  - disabled unless `DISCORD_ENABLE_TEXT_COMMANDS=true`

## Permissions And Intents
This bot currently uses:
- Gateway intents:
  - `Guilds`
  - `GuildVoiceStates`
- OAuth scopes:
  - `bot`
  - `applications.commands`

If `DISCORD_ENABLE_TEXT_COMMANDS=true`, the bot also requires:
- `GuildMessages`
- `MessageContent`

If `DISCORD_ENABLE_TEXT_COMMANDS=true` but `MessageContent` is not enabled in the Discord Developer Portal, startup falls back to slash-command-only mode and `meme!play` stays disabled.

### Minimum Bot Permissions
Grant these permissions when inviting the bot:
- `View Channels`
- `Connect`
- `Speak`
- `Send Messages` if you want chat replies for `meme!play`

These are enough for the current implementation because the bot:
- responds only to slash commands
- joins normal voice channels
- plays audio back into the channel

It does not currently require:
- `Manage Channels`
- `Administrator`

### Notes
- `DISCORD_COMMANDS_GLOBAL=false` means slash commands are registered per guild for faster iteration, so `DISCORD_GUILD_ID` must be set.
- Stage channels are not supported in the current implementation.
- If the bot can join but cannot hear or play, first verify channel-level overrides for `View Channel`, `Connect`, and `Speak`.
- If startup logs `Used disallowed intents`, `/join` and `/leave` can still work after fallback, but `meme!play` requires enabling `Message Content Intent`.

## Audio Capture
- Discord Opus packets are decoded to PCM with `prism-media`.
- Capture is keyed by `guildId + speakerId`.
- Each speaker has an isolated `SpeakerCaptureSession`.

## Acoustic Segmentation Rules
- `SEGMENT_SILENCE_MS`: silence needed to close a segment
- `SEGMENT_MIN_MS`: minimum segment duration before silence can close it
- `SEGMENT_MAX_MS`: soft upper duration
- `SEGMENT_MAX_GRACE_MS`: extra time allowed after `SEGMENT_MAX_MS` before force close

## Segment Finalization
The bot finalizes a segment when:
- silence exceeds the configured threshold and the segment is long enough
- the segment runs past max + grace
- the session is manually flushed or disconnected

## Playback
- Each guild has one `PlaybackQueue`.
- Matches are enqueued in arrival order.
- Playback uses `ffmpeg-static` to transcode MP3 into raw PCM for Discord voice output.

## Error Handling
- Segment submission failures are logged and skipped.
- Playback errors stop the current ffmpeg process and move to the next item.
