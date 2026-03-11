const runtimeEnv = typeof window === 'undefined' ? {} : (window.__ENV__ ?? {})

export const appEnv = {
  apiBaseUrl: runtimeEnv.API_BASE_URL || 'http://localhost:4000',
  appEnvironment: runtimeEnv.APP_ENV || 'development',
}
