import { ReadingSession } from './types'

export interface DayStat {
  date: string // YYYY-MM-DD local
  words: number
  minutes: number
  avgWpm: number
}

export interface StatsSummary {
  totalWords: number
  totalMinutes: number
  avgWpm: number
  bestWpm: number
  streak: number
  days: DayStat[]
  /** minutes saved vs reading at 230wpm baseline */
  minutesSaved: number
  wpmTrend: { date: string; wpm: number }[]
}

const BASELINE_WPM = 230

function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function summarize(sessions: ReadingSession[]): StatsSummary {
  const byDay = new Map<string, { words: number; ms: number; wpmSum: number; n: number }>()
  let totalWords = 0
  let totalMs = 0
  let bestWpm = 0
  const wpmTrend: { date: string; wpm: number }[] = []

  for (const s of sessions) {
    const day = localDay(s.started_at)
    const cur = byDay.get(day) ?? { words: 0, ms: 0, wpmSum: 0, n: 0 }
    cur.words += s.words_read
    cur.ms += s.duration_ms
    cur.wpmSum += s.wpm
    cur.n++
    byDay.set(day, cur)
    totalWords += s.words_read
    totalMs += s.duration_ms
    bestWpm = Math.max(bestWpm, s.wpm)
    wpmTrend.push({ date: day, wpm: s.wpm })
  }

  const days: DayStat[] = [...byDay.entries()]
    .map(([date, v]) => ({ date, words: v.words, minutes: v.ms / 60000, avgWpm: v.n ? Math.round(v.wpmSum / v.n) : 0 }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  // streak: consecutive days ending today or yesterday
  let streak = 0
  const daySet = new Set(days.map((d) => d.date))
  const cursor = new Date()
  if (!daySet.has(localDay(cursor.toISOString()))) cursor.setDate(cursor.getDate() - 1)
  while (daySet.has(localDay(cursor.toISOString()))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  const totalMinutes = totalMs / 60000
  const avgWpm = totalMinutes > 0 ? Math.round(totalWords / totalMinutes) : 0
  const baselineMinutes = totalWords / BASELINE_WPM
  return {
    totalWords,
    totalMinutes,
    avgWpm,
    bestWpm,
    streak,
    days,
    minutesSaved: Math.max(0, baselineMinutes - totalMinutes),
    wpmTrend,
  }
}

export function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(Math.round(n))
}

export function readingTime(words: number, wpm: number): string {
  const min = words / wpm
  if (min < 1) return '<1 min'
  if (min < 60) return `${Math.round(min)} min`
  return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`
}
