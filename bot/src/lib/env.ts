import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFilePath = fileURLToPath(import.meta.url)
const currentDirectory = path.dirname(currentFilePath)
const projectRoot = path.resolve(currentDirectory, '../../..')
const envFilePath = path.join(projectRoot, '.env')

if (fs.existsSync(envFilePath)) {
  const contents = fs.readFileSync(envFilePath, 'utf8')

  for (const line of contents.split('\n')) {
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

const readNumber = (key: string, fallback: number): number => {
  const rawValue = process.env[key]

  if (!rawValue) {
    return fallback
  }

  const parsedValue = Number(rawValue)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

const readBoolean = (key: string, fallback: boolean): boolean => {
  const rawValue = process.env[key]

  if (!rawValue) {
    return fallback
  }

  const normalized = rawValue.trim().toLowerCase()

  if (normalized === 'true') {
    return true
  }

  if (normalized === 'false') {
    return false
  }

  return fallback
}

const readString = (key: string, fallback = ''): string =>
  process.env[key]?.trim() || fallback

export interface BotConfig {
  apiBaseUrl: string
  clientId: string
  commandGuildId?: string
  commandsGlobal: boolean
  daveEncryption: boolean
  enableTextCommands: boolean
  maxSegmentGraceMs: number
  maxSegmentMs: number
  minSegmentMs: number
  projectRoot: string
  silenceMs: number
  token: string
}

export const loadBotConfig = (): BotConfig => ({
  apiBaseUrl: readString('DISCORD_API_BASE_URL', 'http://localhost:4000'),
  clientId: readString('DISCORD_CLIENT_ID'),
  commandGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
  commandsGlobal: readString('DISCORD_COMMANDS_GLOBAL', 'false') === 'true',
  daveEncryption: readBoolean('DISCORD_DAVE_ENCRYPTION', true),
  enableTextCommands: readBoolean('DISCORD_ENABLE_TEXT_COMMANDS', false),
  maxSegmentGraceMs: readNumber('SEGMENT_MAX_GRACE_MS', 2500),
  maxSegmentMs: readNumber('SEGMENT_MAX_MS', 20_000),
  minSegmentMs: readNumber('SEGMENT_MIN_MS', 3_000),
  projectRoot,
  silenceMs: readNumber('SEGMENT_SILENCE_MS', 1500),
  token: readString('DISCORD_BOT_TOKEN'),
})
