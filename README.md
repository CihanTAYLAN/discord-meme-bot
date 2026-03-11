# Discord Meme Bot Monorepo

Discord voice conversations are captured as semantically meaningful speech slices, transcribed locally with `faster-whisper`, enriched with social/contextual labels, embedded with Transformers.js, matched against a local Chroma collection, and played back as meme audio inside the same voice channel.

`docs/architecture.md` is the primary technical reference for the system. The rest of the `docs/` folder expands setup, API, dashboard, operations, and the audio pipeline.

## What Is Included
- `bot/`: Discord bot with slash commands, voice receive, semantic segment capture, and FIFO playback.
- `api/`: Fastify backend for draft creation, review confirmation, catalog search, bulk curation, live segment analysis, and Chroma queries.
- `dashboard/`: Vite + React admin UI based on the `vite-react-boilerplate` app structure with drag-and-drop upload, AI review, search, filters, editing, and bulk actions.
- `sounds/`: Shared runtime directory for indexed MP3 files.
- `docs/`: Architecture, setup, API contracts, operations, and subsystem notes.

## Quick Start
1. Install Node dependencies:
   ```bash
   yarn install
   ```
2. Install Python dependencies:
   ```bash
   python3 -m pip install -r requirements.txt
   ```
3. Create a root environment file:
   ```bash
   cp .env.example .env
   ```
4. Register slash commands:
   ```bash
   yarn register:commands
   ```
5. Start all services:
   ```bash
   yarn dev
   ```

`yarn dev` now starts Chroma automatically and reuses an already-running local Chroma instance if one is available at `CHROMA_URL`.

Before step 4, complete the Discord application setup in [docs/setup.md#discord-application-setup](/Users/cihantaylan/workspace/opensource/discord-meme-bot/docs/setup.md).

## Runtime Requirements
- Node.js `22.12+` recommended
- Yarn Classic `1.22.x`
- Python `3.9+`
- Local Chroma server reachable at `CHROMA_URL`

## Slash Commands
- `/join [channel]`: joins a voice channel and starts listening.
- `/leave`: disconnects the bot and clears pending playback.

## Text Command
- `meme!play <query>`: finds the closest indexed meme for the given text and plays it in the active voice session.
- If no active session exists, the bot joins the caller's current voice channel first.
- This command is disabled by default. Set `DISCORD_ENABLE_TEXT_COMMANDS=true`, enable `Message Content Intent` in the Discord Developer Portal, and grant `Send Messages` permission in the text channel.
- If `DISCORD_ENABLE_TEXT_COMMANDS=true` but the privileged intent is not enabled in the portal, the bot falls back to slash-command-only mode so `/join` and `/leave` still work.

## Dashboard Flow
1. Upload audio into a draft.
2. Let the API generate transcript, summary, labels, mood, category, and acoustic cues.
3. Review or edit the AI suggestion set.
4. Confirm the draft to write the final vector record.
5. Curate the indexed library with search, filters, inline editing, and bulk actions.

## Environment Notes
- Root `.env` is the single source of truth for API and bot runtime.
- Dashboard runtime config is converted into `dashboard/public/env.js` via `yarn workspace dashboard env:generate`.
- The default embedding model is `Xenova/paraphrase-multilingual-MiniLM-L12-v2`.
- The default Whisper model is `small` on CPU with `int8`.

## Common Commands
```bash
yarn dev
yarn dev:chroma
yarn register:commands
yarn test
yarn typecheck
yarn build
```

## Documentation Map
- [Architecture](./docs/architecture.md)
- [Setup](./docs/setup.md)
- [Bot](./docs/bot.md)
- [API](./docs/api.md)
- [Audio Pipeline](./docs/audio-pipeline.md)
- [Dashboard](./docs/dashboard.md)
- [Operations](./docs/operations.md)

Discord-specific setup details:
- [Discord application setup and permissions](./docs/setup.md#discord-application-setup)
- [Bot permissions, scopes, and intents](./docs/bot.md#permissions-and-intents)

## Troubleshooting
- If the bot joins but does not hear anyone, verify `selfDeaf: false` behavior and Discord voice permissions.
- If the bot logs `Used disallowed intents`, either enable `Message Content Intent` for `meme!play` or leave `DISCORD_ENABLE_TEXT_COMMANDS=false`; slash commands continue to work without it.
- If indexing stalls, confirm the Python worker can import `faster_whisper`.
- If `yarn dev` stops immediately around Chroma startup, check whether another process is already bound to `CHROMA_URL` and whether `GET /api/v2/heartbeat` responds on that address.
- If similarity matching is noisy, raise `SIMILARITY_THRESHOLD` or tighten contextual labels in the API.
- If the dashboard shows stale data, rerun `yarn workspace dashboard env:generate` after changing the root `.env`.
