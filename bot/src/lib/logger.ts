type LogLevel = 'debug' | 'error' | 'info' | 'warn'

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  error: 40,
  info: 20,
  warn: 30,
}

const configuredLevel = (process.env.LOG_LEVEL?.toLowerCase() ??
  'info') as LogLevel

const shouldLog = (level: LogLevel): boolean =>
  levelPriority[level] >= levelPriority[configuredLevel]

const stringify = (value: unknown) => {
  if (value instanceof Error) {
    return JSON.stringify({
      message: value.message,
      name: value.name,
      stack: value.stack,
    })
  }

  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export interface Logger {
  debug: (...values: unknown[]) => void
  error: (...values: unknown[]) => void
  info: (...values: unknown[]) => void
  warn: (...values: unknown[]) => void
}

export const createLogger = (scope: string): Logger => ({
  debug: (...values) => {
    if (shouldLog('debug')) {
      console.debug(
        new Date().toISOString(),
        '[DEBUG]',
        `[${scope}]`,
        ...values.map(stringify),
      )
    }
  },
  error: (...values) => {
    if (shouldLog('error')) {
      console.error(
        new Date().toISOString(),
        '[ERROR]',
        `[${scope}]`,
        ...values.map(stringify),
      )
    }
  },
  info: (...values) => {
    if (shouldLog('info')) {
      console.info(
        new Date().toISOString(),
        '[INFO]',
        `[${scope}]`,
        ...values.map(stringify),
      )
    }
  },
  warn: (...values) => {
    if (shouldLog('warn')) {
      console.warn(
        new Date().toISOString(),
        '[WARN]',
        `[${scope}]`,
        ...values.map(stringify),
      )
    }
  },
})
