import type { FastifyInstance } from 'fastify'

export const registerHealthRoute = async (app: FastifyInstance) => {
  app.get('/health', async () => ({
    service: 'discord-meme-bot-api',
    status: 'ok',
    timestamp: new Date().toISOString(),
  }))
}
