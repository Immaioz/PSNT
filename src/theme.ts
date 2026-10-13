import { config, setConfig } from './config'

export function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0f1117' : '#4f46e5')
}

export function initTheme(): void {
  applyTheme(config().theme)
}

export function toggleTheme(): void {
  const next = config().theme === 'dark' ? 'light' : 'dark'
  setConfig({ ...config(), theme: next })
  applyTheme(next)
}
