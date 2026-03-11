# Setup

## Prerequisites
- Node.js `22.12+`
- Yarn `1.22.x`
- Python `3.9+`
- A Discord application with bot token and application ID

## Install
```bash
yarn install
python3 -m pip install -r requirements.txt
cp .env.example .env
```

## Minimum `.env`
```env
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
DISCORD_API_BASE_URL=http://localhost:4000
DISCORD_ENABLE_TEXT_COMMANDS=false

API_PORT=4000
CHROMA_URL=http://localhost:8000
SIMILARITY_THRESHOLD=0.58

EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

## Discord Application Setup
1. Open the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create or select your application.
3. In `General Information`:
   - copy `Application ID` into `DISCORD_CLIENT_ID`
4. In `Bot`:
   - create the bot user if it does not exist
   - reset/copy the bot token into `DISCORD_BOT_TOKEN`
   - enable `Message Content Intent` only if you want to use the `meme!play <query>` text command
5. In Discord client:
   - enable `Developer Mode`
   - right click your target server
   - copy `Server ID` into `DISCORD_GUILD_ID`

### Required `.env` Fields For The Bot
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID` when `DISCORD_COMMANDS_GLOBAL=false`
- `DISCORD_API_BASE_URL`
- `DISCORD_ENABLE_TEXT_COMMANDS=true` only if `meme!play <query>` should be active

If `DISCORD_ENABLE_TEXT_COMMANDS=true` but `Message Content Intent` is still disabled in the Discord Developer Portal, the bot falls back to slash-command-only mode at startup instead of staying offline.

### Invite URL
Use OAuth2 URL Generator in the Developer Portal or build it manually:

```text
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot%20applications.commands&permissions=3146752
```

Recommended scopes:
- `bot`
- `applications.commands`

If you generate the URL from the portal, the required bot permissions are documented in [docs/bot.md](./bot.md#permissions-and-intents).

## Start Order
1. Register Discord slash commands:
   ```bash
   yarn register:commands
   ```
2. Start the full stack:
   ```bash
   yarn dev
   ```

`yarn dev` starts Chroma, API, bot, and dashboard together. If Chroma is already running at `CHROMA_URL`, the launcher reuses it instead of failing.

## Independent Service Startup
- API only:
  ```bash
  yarn dev:api
  ```
- Chroma only:
  ```bash
  yarn dev:chroma
  ```
- Bot only:
  ```bash
  yarn dev:bot
  ```
- Dashboard only:
  ```bash
  yarn dev:dashboard
  ```

## Validation
```bash
yarn typecheck
yarn test
yarn build
```

## First Upload
1. Open the dashboard.
2. Upload an MP3.
3. Confirm the record appears in the indexed table.
4. Join a Discord voice channel and invite the bot with `/join`.
