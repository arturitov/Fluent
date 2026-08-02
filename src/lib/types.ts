export type SourceType = 'url' | 'pdf' | 'epub' | 'docx' | 'txt' | 'md' | 'paste' | 'manual' | 'sample'
export type DocStatus = 'unread' | 'reading' | 'finished' | 'archived'

export interface Doc {
  id: string
  user_id?: string
  title: string
  author: string | null
  source_type: SourceType
  source_url: string | null
  content: string
  excerpt: string | null
  cover_url: string | null
  favicon_url: string | null
  word_count: number
  status: DocStatus
  tags: string[]
  created_at: string
  updated_at: string
}

export interface Position {
  document_id: string
  word_index: number
  wpm: number
  updated_at?: string
}

export interface ReadingSession {
  id?: string
  document_id: string | null
  wpm: number
  words_read: number
  duration_ms: number
  started_at: string
}

export interface Extracted {
  title: string
  author: string | null
  content: string
  excerpt: string | null
  sourceType: SourceType
  sourceUrl: string | null
  coverUrl: string | null
  faviconUrl: string | null
}

export interface Settings {
  wpm: number
  chunkSize: number // 1..3 words per flash
  adaptivity: number // 0..1 pacing aggressiveness
  ramp: boolean // speed ramping on session start
  theme: 'dark' | 'light' | 'amoled'
  font: 'sans' | 'serif'
  focusLine: 'guides' | 'line' | 'none'
  ttsVoice: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  wpm: 300,
  chunkSize: 1,
  adaptivity: 0.6,
  ramp: false,
  theme: 'dark',
  font: 'sans',
  focusLine: 'guides',
  ttsVoice: null,
}
