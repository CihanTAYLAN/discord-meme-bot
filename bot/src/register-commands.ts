import { REST, Routes } from 'discord.js'
import { slashCommands } from './discord/runtime.js'
import { loadBotConfig } from './lib/env.js'
import { createLogger } from './lib/logger.js'

const logger = createLogger('register-commands')

const bootstrap = async () => {
  const config = loadBotConfig()

  if (!config.token || !config.clientId) {
    throw new Error('DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID are required')
  }

  const rest = new REST({ version: '10' }).setToken(config.token)
  const route =
    config.commandsGlobal || !config.commandGuildId
      ? Routes.applicationCommands(config.clientId)
      : Routes.applicationGuildCommands(config.clientId, config.commandGuildId)

  await rest.put(route, {
    body: slashCommands.map((command) => command.toJSON()),
  })

  logger.info('Registered slash commands', {
    scope: config.commandsGlobal || !config.commandGuildId ? 'global' : 'guild',
  })
}

void bootstrap()
