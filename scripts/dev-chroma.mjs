import { createConnection } from 'node:net'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'

const projectRoot = resolve(import.meta.dirname, '..')
const envFilePath = resolve(projectRoot, '.env')
const dataPath = resolve(projectRoot, 'data', 'chroma')

const readEnvFile = () => {
  try {
    const content = readFileSync(envFilePath, 'utf8')
    const entries = content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=')

        if (separatorIndex < 0) {
          return null
        }

        const key = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1).trim()
        return [key, value]
      })
      .filter((entry) => entry !== null)

    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

const config = readEnvFile()
const chromaUrl = config.CHROMA_URL ?? 'http://127.0.0.1:8000'
const parsedUrl = new URL(chromaUrl)
const host = parsedUrl.hostname
const port = Number(parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 8000))
const heartbeatUrl = new URL('/api/v2/heartbeat', parsedUrl.origin)

const isPortOpen = async () =>
  new Promise((resolvePromise) => {
    const socket = createConnection({ host, port })

    socket.once('connect', () => {
      socket.end()
      resolvePromise(true)
    })
    socket.once('error', () => {
      resolvePromise(false)
    })
  })

const hasChromaHeartbeat = async () => {
  try {
    const response = await fetch(heartbeatUrl, {
      signal: AbortSignal.timeout(2_500),
    })

    return response.ok
  } catch {
    return false
  }
}

if (await hasChromaHeartbeat()) {
  console.log(
    `[dev:chroma] Reusing existing Chroma server at ${parsedUrl.origin}.`,
  )
  process.exit(0)
}

if (await isPortOpen()) {
  console.error(
    `[dev:chroma] ${host}:${port} is already in use, but it did not respond to ${heartbeatUrl.pathname}.`,
  )
  process.exit(1)
}

console.log(
  `[dev:chroma] Starting Chroma server at ${parsedUrl.origin} with data path ${dataPath}.`,
)

const child = spawn(
  'python3',
  [
    '-c',
    'import chromadb.cli.cli as c; c.app()',
    'run',
    '--path',
    dataPath,
    '--host',
    host,
    '--port',
    String(port),
  ],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
)

const stopChild = (signal) => {
  if (!child.killed) {
    child.kill(signal)
  }
}

process.on('SIGINT', () => {
  stopChild('SIGINT')
})

process.on('SIGTERM', () => {
  stopChild('SIGTERM')
})

child.once('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
