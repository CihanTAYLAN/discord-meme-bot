import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import readline from 'node:readline'
import type { Logger } from '../lib/logger.js'
import type { TranscriptionResult } from '../types/models.js'

interface WorkerRequest {
  audioPath: string
  beamSize: number
  id: string
  language?: string
  type: 'transcribe'
}

interface WorkerResponse {
  error?: string
  id?: string
  ok?: boolean
  ready?: boolean
  result?: TranscriptionResult
}

export class PythonWhisperWorker {
  private process?: ChildProcessWithoutNullStreams
  private readonly pending = new Map<
    string,
    {
      reject: (error: Error) => void
      resolve: (value: TranscriptionResult) => void
    }
  >()
  private readyPromise?: Promise<void>

  constructor(
    private readonly pythonBinary: string,
    private readonly scriptPath: string,
    private readonly whisperModel: string,
    private readonly whisperDevice: string,
    private readonly whisperComputeType: string,
    private readonly defaultBeamSize: number,
    private readonly defaultLanguage: string | undefined,
    private readonly logger: Logger,
  ) {}

  async initialize(): Promise<void> {
    await this.ensureReady()
  }

  async dispose(): Promise<void> {
    this.process?.kill()
    this.process = undefined
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    await this.ensureReady()
    const processHandle = this.process

    if (!processHandle) {
      throw new Error('Whisper worker process is not available')
    }

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    const payload: WorkerRequest = {
      audioPath,
      beamSize: this.defaultBeamSize,
      id: requestId,
      language: this.defaultLanguage,
      type: 'transcribe',
    }

    return new Promise<TranscriptionResult>((resolve, reject) => {
      this.pending.set(requestId, { reject, resolve })
      processHandle.stdin.write(`${JSON.stringify(payload)}\n`)
    })
  }

  private async ensureReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.startProcess()
    }

    return this.readyPromise
  }

  private async startProcess(): Promise<void> {
    this.logger.info('Starting faster-whisper worker', {
      scriptPath: this.scriptPath,
      whisperModel: this.whisperModel,
    })

    const spawned = spawn(this.pythonBinary, [
      this.scriptPath,
      '--compute-type',
      this.whisperComputeType,
      '--device',
      this.whisperDevice,
      '--model',
      this.whisperModel,
    ])
    this.process = spawned

    const lineReader = readline.createInterface({
      input: spawned.stdout,
    })

    spawned.stderr.on('data', (chunk) => {
      this.logger.warn('Whisper worker stderr', chunk.toString())
    })

    spawned.on('exit', (code, signal) => {
      this.logger.error('Whisper worker exited unexpectedly', { code, signal })
      for (const [requestId, handlers] of this.pending.entries()) {
        handlers.reject(new Error('Whisper worker exited unexpectedly'))
        this.pending.delete(requestId)
      }
      this.readyPromise = undefined
      this.process = undefined
    })

    return new Promise<void>((resolve, reject) => {
      lineReader.on('line', (line) => {
        let response: WorkerResponse

        try {
          response = JSON.parse(line) as WorkerResponse
        } catch (error) {
          this.logger.error('Failed to parse whisper worker response', error)
          return
        }

        if (response.ready) {
          this.logger.info('Whisper worker is ready')
          resolve()
          return
        }

        if (!response.id) {
          return
        }

        const handlers = this.pending.get(response.id)

        if (!handlers) {
          return
        }

        this.pending.delete(response.id)

        if (!response.ok || !response.result) {
          handlers.reject(new Error(response.error ?? 'Unknown whisper error'))
          return
        }

        handlers.resolve(response.result)
      })

      spawned.once('error', (error) => {
        reject(error)
      })
    })
  }
}
