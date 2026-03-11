import { createRequire } from 'node:module'
import { generateDependencyReport } from '@discordjs/voice'
import { DiscordBotRuntime } from './discord/runtime.js'
import type { BotConfig } from './lib/env.js'
import { loadBotConfig } from './lib/env.js'
import type { Logger } from './lib/logger.js'

const require = createRequire(import.meta.url)

interface DecoderCheckResult {
  errors: Array<{ error: string; moduleName: string }>
  moduleName: '@discordjs/opus' | 'opusscript' | null
}

export interface RuntimeHandle {
  client: {
    destroy: () => void
  }
  start: (token: string) => Promise<void>
}

export type RuntimeFactory = (
  config: BotConfig,
  logger: Logger,
) => RuntimeHandle

const resolveOpusDecoder = (): DecoderCheckResult => {
  const candidates = ['@discordjs/opus', 'opusscript'] as const
  const errors: DecoderCheckResult['errors'] = []

  for (const moduleName of candidates) {
    try {
      require(moduleName)
      return { errors, moduleName }
    } catch (error) {
      errors.push({
        error: error instanceof Error ? error.message : String(error),
        moduleName,
      })
    }
  }

  return {
    errors,
    moduleName: null,
  }
}

const createRuntime = (config: BotConfig, logger: Logger): RuntimeHandle =>
  new DiscordBotRuntime(
    config.apiBaseUrl,
    {
      daveEncryption: config.daveEncryption,
      enableTextCommands: config.enableTextCommands,
      maxSegmentGraceMs: config.maxSegmentGraceMs,
      maxSegmentMs: config.maxSegmentMs,
      minSegmentMs: config.minSegmentMs,
      silenceMs: config.silenceMs,
    },
    logger,
  )

export const isDisallowedIntentsError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes('Used disallowed intents')

export const startBotRuntime = async (
  config: BotConfig,
  logger: Logger,
  runtimeFactory: RuntimeFactory = createRuntime,
): Promise<RuntimeHandle> => {
  const runtime = runtimeFactory(config, logger)

  try {
    await runtime.start(config.token)
    return runtime
  } catch (error) {
    if (!config.enableTextCommands || !isDisallowedIntentsError(error)) {
      throw error
    }

    logger.warn(
      'Message Content Intent is not enabled for this Discord application. Continuing without text commands.',
      {
        configKey: 'DISCORD_ENABLE_TEXT_COMMANDS',
        disabledCommand: 'meme!play',
        fallbackValue: false,
      },
    )

    runtime.client.destroy()

    const fallbackRuntime = runtimeFactory(
      {
        ...config,
        enableTextCommands: false,
      },
      logger,
    )

    await fallbackRuntime.start(config.token)
    return fallbackRuntime
  }
}

export const bootstrap = async (logger: Logger): Promise<void> => {
  const config = loadBotConfig()
  const nodeVersion = process.versions.node
  const nodeMajor = Number(nodeVersion.split('.')[0] ?? '0')

  if (!config.token) {
    throw new Error('DISCORD_BOT_TOKEN is required')
  }

  if (nodeMajor !== 22) {
    logger.warn('Discord voice is most reliable on Node 22.x', {
      detectedNodeVersion: nodeVersion,
      recommendedRange: '22.x',
    })
  }

  if (!config.daveEncryption) {
    logger.warn(
      'DAVE encryption is disabled. Modern Discord voice channels may reject non-E2EE connections.',
      {
        configKey: 'DISCORD_DAVE_ENCRYPTION',
        recommendedValue: true,
      },
    )
  }

  if (!config.enableTextCommands) {
    logger.info(
      'Text command support is disabled. Enable DISCORD_ENABLE_TEXT_COMMANDS=true if you want `meme!play <query>`.',
    )
  }

  if ((process.env.LOG_LEVEL?.toLowerCase() ?? 'info') === 'debug') {
    logger.debug('Discord voice dependency report', generateDependencyReport())
  }

  const decoder = resolveOpusDecoder()

  if (!decoder.moduleName) {
    throw new Error(
      `No usable Opus decoder found. Checked: ${decoder.errors
        .map((entry) => `${entry.moduleName}: ${entry.error}`)
        .join(' | ')}`,
    )
  }

  if (decoder.moduleName !== '@discordjs/opus') {
    logger.warn('Falling back to JS Opus decoder', {
      decoder: decoder.moduleName,
      nativeDecoderError:
        decoder.errors.find((entry) => entry.moduleName === '@discordjs/opus')
          ?.error ?? null,
    })
  }

  await startBotRuntime(config, logger)
}
