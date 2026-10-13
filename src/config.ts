export interface AppConfig {
  apiUrl: string
  assetBase: string
  theme: 'light' | 'dark'
}

const API_KEY = 'psnt.apiUrl'
const ASSET_KEY = 'psnt.assetBase'
const THEME_KEY = 'psnt.theme'

const DEFAULTS: AppConfig = {
  apiUrl: (import.meta.env.VITE_API_URL || '').trim(),
  assetBase: import.meta.env.VITE_ASSET_BASE || 'exercises/',
  theme: 'dark'
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function loadConfig(): AppConfig {
  const theme = read(THEME_KEY)
  return {
    apiUrl: read(API_KEY) ?? DEFAULTS.apiUrl,
    assetBase: read(ASSET_KEY) ?? DEFAULTS.assetBase,
    theme: theme === 'light' || theme === 'dark' ? theme : DEFAULTS.theme
  }
}

export function saveConfig(cfg: Partial<AppConfig>): void {
  if (cfg.apiUrl !== undefined) write(API_KEY, cfg.apiUrl.trim())
  if (cfg.assetBase !== undefined) write(ASSET_KEY, normalizeBase(cfg.assetBase))
  if (cfg.theme !== undefined) write(THEME_KEY, cfg.theme)
}

export function normalizeBase(base: string): string {
  const b = (base || '').trim()
  if (b === '') return DEFAULTS.assetBase
  return b.endsWith('/') ? b : b + '/'
}

let current: AppConfig = loadConfig()

export function config(): AppConfig {
  return current
}

export function setConfig(cfg: AppConfig): void {
  current = cfg
  saveConfig(cfg)
}

export function assetUrl(relative: string | null | undefined): string {
  if (!relative) return ''
  if (/^https?:\/\//i.test(relative)) return relative
  return normalizeBase(current.assetBase) + relative.replace(/^\/+/, '')
}
