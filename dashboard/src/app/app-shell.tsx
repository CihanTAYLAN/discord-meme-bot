import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { appEnv } from '@/lib/env'
import { defaultDashboardState } from '@/store/dashboard-store'

type ThemeMode = 'dark' | 'light'

const themeKey = 'discord-meme-bot-theme'

export const AppShell = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'dark'
    }

    const storedTheme = window.localStorage.getItem(themeKey)
    return storedTheme === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(themeKey, theme)
  }, [theme])

  return (
    <div className="min-h-screen bg-[var(--page-bg)] text-[color:var(--text-strong)] transition-colors duration-300">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="hero-orb absolute left-[-8rem] top-[-4rem] h-64 w-64 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="hero-orb absolute right-[-6rem] top-24 h-72 w-72 rounded-full bg-amber-200/20 blur-3xl" />
        <div className="hero-grid absolute inset-0 opacity-60" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <header className="mb-8 overflow-hidden rounded-[32px] border border-[color:var(--card-border)] bg-[linear-gradient(135deg,var(--hero-a),var(--hero-b))] px-5 py-6 shadow-[0_24px_90px_rgba(15,23,42,0.18)] backdrop-blur sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 text-xs uppercase tracking-[0.42em] text-[color:var(--text-muted)]">
                ai audio operations console
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
                {defaultDashboardState.title}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-[color:var(--text-soft)] sm:text-base">
                Upload sounds, let the AI draft semantic metadata, review the
                proposed attributes, and manage the live Discord meme library
                with searchable, editable records.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="rounded-2xl border border-[color:var(--card-border)] bg-[color:var(--card-bg-strong)] px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <div className="font-medium text-[color:var(--text-strong)]">
                  Runtime
                </div>
                <div className="text-[color:var(--text-soft)]">
                  {appEnv.appEnvironment} · {appEnv.apiBaseUrl}
                </div>
              </div>
              <button
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--card-border)] bg-[color:var(--card-bg)] px-4 py-2 text-sm font-medium text-[color:var(--text-strong)] transition hover:-translate-y-0.5 hover:bg-[color:var(--card-bg-strong)]"
                type="button"
                onClick={() => {
                  setTheme((currentTheme) =>
                    currentTheme === 'dark' ? 'light' : 'dark',
                  )
                }}
              >
                {theme === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
