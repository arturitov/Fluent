import { Settings, DEFAULT_SETTINGS } from './types'

const KEY = 'fluent.settings'
type Listener = (s: Settings) => void
const listeners = new Set<Listener>()

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  localStorage.setItem(KEY, JSON.stringify(next))
  listeners.forEach((l) => l(next))
  applyTheme(next)
  return next
}

export function onSettings(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function applyTheme(s: Settings = loadSettings()) {
  document.documentElement.dataset.theme = s.theme
  document.documentElement.dataset.font = s.font
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', s.theme === 'light' ? '#fafaf8' : s.theme === 'amoled' ? '#000000' : '#0b0c10')
}
