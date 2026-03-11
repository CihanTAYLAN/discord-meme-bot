import { describe, expect, it, vi } from 'vitest'
import { startBotRuntime } from '../bootstrap.js'
import type { BotConfig } from '../lib/env.js'
import type { Logger } from '../lib/logger.js'

const createConfig = (overrides: Partial<BotConfig> = {}): BotConfig => ({
  apiBaseUrl: 'http://localhost:4000',
  clientId: 'client-id',
  commandGuildId: 'guild-id',
  commandsGlobal: false,
  daveEncryption: true,
  enableTextCommands: true,
  maxSegmentGraceMs: 2500,
  maxSegmentMs: 20_000,
  minSegmentMs: 3000,
  projectRoot: '/tmp/project',
  silenceMs: 1500,
  token: 'token',
  ...overrides,
})

const createLogger = (): Logger => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
})

describe('startBotRuntime', () => {
  it('retries without text commands when Discord rejects privileged intents', async () => {
    const logger = createLogger()
    const firstRuntime = {
      client: {
        destroy: vi.fn(),
      },
      start: vi.fn().mockRejectedValue(new Error('Used disallowed intents')),
    }
    const secondRuntime = {
      client: {
        destroy: vi.fn(),
      },
      start: vi.fn().mockResolvedValue(undefined),
    }
    const runtimeFactory = vi
      .fn()
      .mockReturnValueOnce(firstRuntime)
      .mockReturnValueOnce(secondRuntime)

    await startBotRuntime(createConfig(), logger, runtimeFactory)

    expect(firstRuntime.start).toHaveBeenCalledWith('token')
    expect(firstRuntime.client.destroy).toHaveBeenCalledTimes(1)
    expect(secondRuntime.start).toHaveBeenCalledWith('token')
    expect(runtimeFactory).toHaveBeenCalledTimes(2)
    expect(runtimeFactory.mock.calls[1]?.[0].enableTextCommands).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith(
      'Message Content Intent is not enabled for this Discord application. Continuing without text commands.',
      {
        configKey: 'DISCORD_ENABLE_TEXT_COMMANDS',
        disabledCommand: 'meme!play',
        fallbackValue: false,
      },
    )
  })

  it('does not retry when text commands are already disabled', async () => {
    const logger = createLogger()
    const runtime = {
      client: {
        destroy: vi.fn(),
      },
      start: vi.fn().mockRejectedValue(new Error('Used disallowed intents')),
    }
    const runtimeFactory = vi.fn().mockReturnValue(runtime)

    await expect(
      startBotRuntime(
        createConfig({
          enableTextCommands: false,
        }),
        logger,
        runtimeFactory,
      ),
    ).rejects.toThrow('Used disallowed intents')

    expect(runtime.client.destroy).not.toHaveBeenCalled()
    expect(runtimeFactory).toHaveBeenCalledTimes(1)
  })
})
