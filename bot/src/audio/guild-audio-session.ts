import type { Readable } from 'node:stream'
import {
  EndBehaviorType,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type VoiceConnection,
  VoiceConnectionStatus,
} from '@discordjs/voice'
import { ChannelType, type Client, type VoiceBasedChannel } from 'discord.js'
import prism from 'prism-media'
import { ApiClient } from '../discord/api-client.js'
import type { Logger } from '../lib/logger.js'
import { PlaybackQueue } from '../playback/playback-queue.js'
import {
  type FinalizedSegment,
  type SpeakerCaptureOptions,
  SpeakerCaptureSession,
} from './speaker-capture-session.js'
import { pcm16StereoToWav } from './wav.js'

const tickIntervalMs = 250
const voiceReadyTimeoutMs = 20_000
const voiceRetryDelayMs = 1_000

export class GuildAudioSession {
  private readonly apiClient: ApiClient
  private readonly connection: VoiceConnection
  private readonly playbackQueue: PlaybackQueue
  private readonly speakerSessions = new Map<string, SpeakerCaptureSession>()
  private readonly subscriptions = new Map<string, Readable>()
  private readonly tickTimer: NodeJS.Timeout

  constructor(
    private readonly client: Client,
    private readonly voiceChannel: VoiceBasedChannel,
    apiBaseUrl: string,
    private readonly captureOptions: SpeakerCaptureOptions,
    daveEncryption: boolean,
    private readonly logger: Logger,
  ) {
    if (voiceChannel.type !== ChannelType.GuildVoice) {
      throw new Error('Only standard guild voice channels are supported')
    }

    this.apiClient = new ApiClient(apiBaseUrl)
    this.connection = joinVoiceChannel({
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      channelId: voiceChannel.id,
      daveEncryption,
      debug: true,
      guildId: voiceChannel.guild.id,
      selfDeaf: false,
      selfMute: false,
    })
    this.connection.on('debug', (message) => {
      this.logger.debug('Voice connection debug', {
        channelId: this.voiceChannel.id,
        guildId: this.voiceChannel.guild.id,
        message,
      })
    })
    this.connection.on('stateChange', (oldState, newState) => {
      this.logger.info('Voice connection state changed', {
        channelId: this.voiceChannel.id,
        from: oldState.status,
        guildId: this.voiceChannel.guild.id,
        to: newState.status,
      })
    })
    this.connection.on('error', (error) => {
      this.logger.error('Voice connection error', error, {
        channelId: this.voiceChannel.id,
        guildId: this.voiceChannel.guild.id,
      })
    })
    this.playbackQueue = new PlaybackQueue(this.connection, this.logger)
    this.tickTimer = setInterval(() => {
      const now = Date.now()
      for (const session of this.speakerSessions.values()) {
        session.tick(now)
      }
    }, tickIntervalMs)
  }

  async initialize(): Promise<void> {
    try {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          await entersState(
            this.connection,
            VoiceConnectionStatus.Ready,
            voiceReadyTimeoutMs,
          )
          this.connection.receiver.speaking.on('start', (userId) => {
            void this.startListening(userId)
          })
          this.connection.receiver.speaking.on('end', (userId) => {
            this.speakerSessions
              .get(userId)
              ?.tick(Date.now() + this.captureOptions.silenceMs)
          })
          return
        } catch (error) {
          this.logger.warn('Voice connection did not reach ready state', {
            attempt,
            channelId: this.voiceChannel.id,
            error: error instanceof Error ? error.message : String(error),
            guildId: this.voiceChannel.guild.id,
            status: this.connection.state.status,
          })

          if (attempt >= 2) {
            throw error
          }

          this.connection.rejoin({
            channelId: this.voiceChannel.id,
            selfDeaf: false,
            selfMute: false,
          })
          await new Promise((resolve) => setTimeout(resolve, voiceRetryDelayMs))
        }
      }
    } catch (error) {
      this.destroy()
      throw error
    }
  }

  destroy(): void {
    clearInterval(this.tickTimer)
    for (const session of this.speakerSessions.values()) {
      session.flush('manual')
    }
    for (const stream of this.subscriptions.values()) {
      stream.destroy()
    }
    this.subscriptions.clear()
    this.playbackQueue.stop()
    this.connection.destroy()
  }

  get channelId(): string {
    return this.voiceChannel.id
  }

  get channelName(): string {
    return this.voiceChannel.name
  }

  async playTextQuery(query: string) {
    this.logger.info('Submitting direct playback query', {
      channelId: this.voiceChannel.id,
      guildId: this.voiceChannel.guild.id,
      query,
    })
    const response = await this.apiClient.submitPlaybackQuery(query)

    if (response.status !== 'matched') {
      this.logger.info('No direct playback match found', response)
      return response
    }

    await this.playbackQueue.enqueue(response.match)
    return response
  }

  private getSpeakerSession(userId: string): SpeakerCaptureSession {
    const existing = this.speakerSessions.get(userId)

    if (existing) {
      return existing
    }

    const session = new SpeakerCaptureSession(
      this.captureOptions,
      this.logger,
      async (segment) => {
        await this.handleFinalizedSegment(userId, segment)
      },
    )
    this.speakerSessions.set(userId, session)
    return session
  }

  private async handleFinalizedSegment(
    userId: string,
    segment: FinalizedSegment,
  ): Promise<void> {
    const guildMember = await this.voiceChannel.guild.members
      .fetch(userId)
      .catch(() => null)

    if (!guildMember || guildMember.user.bot) {
      return
    }

    this.logger.info('Submitting finalized segment', {
      durationMs: segment.durationMs,
      endedBy: segment.endedBy,
      speakerId: userId,
      tailSilenceMs: segment.tailSilenceMs,
    })

    const wavBuffer = pcm16StereoToWav(segment.buffer)
    const response = await this.apiClient.submitSegment({
      audioBuffer: wavBuffer,
      fileName: `${this.voiceChannel.guild.id}-${userId}-${Date.now()}.wav`,
      guildId: this.voiceChannel.guild.id,
      segment,
      speakerId: userId,
      speakerName: guildMember.displayName,
    })

    if (response.status !== 'matched') {
      this.logger.info('No meme playback triggered', response)
      return
    }

    await this.playbackQueue.enqueue(response.match)
  }

  private async startListening(userId: string): Promise<void> {
    if (this.subscriptions.has(userId)) {
      return
    }

    const guildMember = await this.voiceChannel.guild.members
      .fetch(userId)
      .catch(() => null)

    if (
      !guildMember ||
      guildMember.user.bot ||
      userId === this.client.user?.id
    ) {
      return
    }

    const opusStream = this.connection.receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterInactivity,
        duration: 100,
      },
    })
    const decoder = new prism.opus.Decoder({
      channels: 2,
      frameSize: 960,
      rate: 48_000,
    })

    this.subscriptions.set(userId, opusStream)
    const captureSession = this.getSpeakerSession(userId)
    let didCleanup = false

    const cleanupSubscription = (
      reason: 'close' | 'decoder_error' | 'end' | 'opus_error',
      error?: unknown,
    ) => {
      if (didCleanup) {
        return
      }

      didCleanup = true
      this.subscriptions.delete(userId)
      opusStream.unpipe(decoder)

      if (error) {
        const message = error instanceof Error ? error.message : String(error)

        if (
          reason === 'decoder_error' &&
          message.toLowerCase().includes('corrupted')
        ) {
          this.logger.warn('Dropped corrupted opus frame', {
            message,
            reason,
            userId,
          })
        } else {
          this.logger.error('Audio receive pipeline error', error, {
            reason,
            userId,
          })
        }
      }

      captureSession.flush('stream_end')
      decoder.destroy()
      opusStream.destroy()
    }

    opusStream.pipe(decoder)
    decoder.on('data', (chunk: Buffer) => {
      captureSession.consumePcmChunk(chunk)
    })
    decoder.once('error', (error) => {
      cleanupSubscription('decoder_error', error)
    })
    opusStream.once('end', () => {
      cleanupSubscription('end')
    })
    opusStream.once('close', () => {
      cleanupSubscription('close')
    })
    opusStream.once('error', (error) => {
      cleanupSubscription('opus_error', error)
    })
  }
}

export const destroyGuildVoiceConnection = (guildId: string) => {
  const connection = getVoiceConnection(guildId)
  connection?.destroy()
}
