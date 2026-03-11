import { spawn } from 'node:child_process'
import {
  type AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  StreamType,
  type VoiceConnection,
} from '@discordjs/voice'
import ffmpegPath from 'ffmpeg-static'
import type { Logger } from '../lib/logger.js'

export interface PlaybackMatch {
  fileName: string
  filePath: string
  similarity: number
  soundId: string
}

export class PlaybackQueue {
  private readonly audioPlayer: AudioPlayer
  private currentProcess?: ReturnType<typeof spawn>
  private isProcessing = false
  private readonly queue: PlaybackMatch[] = []

  constructor(
    connection: VoiceConnection,
    private readonly logger: Logger,
  ) {
    this.audioPlayer = createAudioPlayer()
    connection.subscribe(this.audioPlayer)
    this.audioPlayer.on(AudioPlayerStatus.Buffering, () => {
      this.logger.info('Audio player buffering')
    })
    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      this.logger.info('Audio player started playing')
    })
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      this.logger.info('Audio player became idle')
      this.currentProcess?.kill()
      this.currentProcess = undefined
      this.isProcessing = false
      void this.processNext()
    })
    this.audioPlayer.on('error', (error) => {
      this.logger.error('Audio player error', error)
      this.currentProcess?.kill()
      this.currentProcess = undefined
      this.isProcessing = false
      void this.processNext()
    })
  }

  async enqueue(match: PlaybackMatch): Promise<void> {
    this.queue.push(match)
    this.logger.info('Queued meme playback', match)
    await this.processNext()
  }

  stop(): void {
    this.queue.length = 0
    this.currentProcess?.kill()
    this.currentProcess = undefined
    this.audioPlayer.stop(true)
    this.isProcessing = false
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) {
      return
    }

    const nextMatch = this.queue.shift()

    if (!nextMatch) {
      return
    }

    if (typeof ffmpegPath !== 'string') {
      this.logger.error('ffmpeg-static did not resolve a binary path')
      return
    }

    this.isProcessing = true

    const ffmpeg = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      nextMatch.filePath,
      '-f',
      's16le',
      '-ar',
      '48000',
      '-ac',
      '2',
      'pipe:1',
    ])
    this.currentProcess = ffmpeg

    ffmpeg.once('spawn', () => {
      this.logger.info('Spawned ffmpeg for meme playback', {
        fileName: nextMatch.fileName,
        filePath: nextMatch.filePath,
      })
    })
    ffmpeg.once('close', (code, signal) => {
      this.logger.info('ffmpeg playback process closed', {
        code,
        fileName: nextMatch.fileName,
        signal,
      })
    })
    ffmpeg.once('error', (error) => {
      this.logger.error('ffmpeg playback process error', error, {
        fileName: nextMatch.fileName,
      })
    })

    ffmpeg.stderr?.on('data', (chunk: Buffer) => {
      this.logger.warn('ffmpeg playback stderr', chunk.toString())
    })

    if (!ffmpeg.stdout) {
      this.logger.error('ffmpeg did not expose stdout for playback')
      this.isProcessing = false
      return
    }

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
    })
    this.audioPlayer.play(resource)
    await entersState(this.audioPlayer, AudioPlayerStatus.Playing, 5000)
      .then(() => {
        this.logger.info('Playback reached playing state', {
          fileName: nextMatch.fileName,
        })
      })
      .catch((error) => {
        this.logger.error('Playback did not reach playing state', error, {
          fileName: nextMatch.fileName,
        })
        this.audioPlayer.stop(true)
      })
  }
}
