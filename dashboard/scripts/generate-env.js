import fs from 'node:fs'
import path from 'node:path'

const rootDirectory = path.resolve(import.meta.dirname, '..')
const workspaceEnvFilePath = path.join(rootDirectory, '.env')
const projectEnvFilePath = path.join(rootDirectory, '..', '.env')
const publicDirectory = path.join(rootDirectory, 'public')
const outputFilePath = path.join(publicDirectory, 'env.js')

const defaults = {
  API_BASE_URL: 'http://localhost:4000',
  APP_ENV: 'development',
}

const parseDotEnv = (contents) =>
  contents
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf('=')

      if (separatorIndex === -1) {
        return accumulator
      }

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()
      accumulator[key] = value

      return accumulator
    }, {})

const fileValues = {
  ...(fs.existsSync(projectEnvFilePath)
    ? parseDotEnv(fs.readFileSync(projectEnvFilePath, 'utf8'))
    : {}),
  ...(fs.existsSync(workspaceEnvFilePath)
    ? parseDotEnv(fs.readFileSync(workspaceEnvFilePath, 'utf8'))
    : {}),
}

const runtimeValues = {
  API_BASE_URL:
    process.env.DASHBOARD_API_BASE_URL ??
    process.env.API_BASE_URL ??
    fileValues.DASHBOARD_API_BASE_URL ??
    defaults.API_BASE_URL,
  APP_ENV:
    process.env.DASHBOARD_APP_ENV ??
    process.env.APP_ENV ??
    fileValues.DASHBOARD_APP_ENV ??
    defaults.APP_ENV,
}

fs.mkdirSync(publicDirectory, { recursive: true })
fs.writeFileSync(
  outputFilePath,
  `window.__ENV__ = ${JSON.stringify(runtimeValues, null, 2)};\n`,
)
