import { bootstrap, isDisallowedIntentsError } from './bootstrap.js'
import { createLogger } from './lib/logger.js'

const logger = createLogger('bot')
void bootstrap(logger).catch((error) => {
  logger.error('Failed to bootstrap Discord bot', error, {
    hint: isDisallowedIntentsError(error)
      ? 'If you want `meme!play`, enable Message Content Intent in the Discord Developer Portal or set DISCORD_ENABLE_TEXT_COMMANDS=false.'
      : undefined,
  })
  process.exit(1)
})
