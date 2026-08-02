import React, { useEffect, useMemo, useState } from 'react'
import { listSessions } from '../lib/db'
import { summarize, fmtNumber, StatsSummary } from '../lib/stats'
import { IconBack, IconFlame } from './icons'

/** Last N calendar days, oldest first. */
function lastDays(n: number): string[] {
  const out: string[] = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d)
    x.setDate(d.getDate() - i)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`)
  }
  return out
}

function BarChart({ stats }: { stats: StatsSummary }) {
  const [hover, setHover] = useState<number | null>(null)
  const days = lastDays(14)
  const byDate = new Map(stats.days.map((d) => [d.date, d]))
  const values = days.map((d) => byDate.get(d)?.words ?? 0)
  const max = Math.max(1, ...values)
  const W = 560
  const H = 150
  const gap = 6
  const bw = (W - gap * (days.length - 1)) / days.length
  const maxIdx = values.indexOf(Math.max(...values))

  return (
    <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {values.map((v, i) => {
        const h = Math.max(v > 0 ? 4 : 2, (v / max) * H)
        const x = i * (bw + gap)
        const y = H - h
        const isHover = hover === i
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={bw}
              height={h}
              rx={4}
              fill={v > 0 ? 'var(--accent)' : 'var(--border)'}
              opacity={hover === null || isHover ? 1 : 0.45}
              style={{ transition: 'opacity .15s' }}
            />
            {/* generous hit target */}
            <rect
              x={x - gap / 2}
              y={0}
              width={bw + gap}
              height={H + 20}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
            {(isHover || (hover === null && i === maxIdx && v > 0)) && (
              <text x={x + bw / 2} y={y - 7} textAnchor="middle" fontSize={11.5} fill="var(--ink-dim)" fontWeight={600}>
                {fmtNumber(v)}
              </text>
            )}
            {(i === 0 || i === days.length - 1 || isHover) && (
              <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize={10.5} fill="var(--ink-faint)">
                {days[i].slice(5).replace('-', '/')}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function TrendChart({ stats }: { stats: StatsSummary }) {
  const [hover, setHover] = useState<number | null>(null)
  const pts = stats.wpmTrend.slice(-40)
  if (pts.length < 2) return <div className="muted" style={{ fontSize: 13.5, padding: '14px 0' }}>Read a few sessions to see your speed trend.</div>
  const W = 560
  const H = 120
  const min = Math.min(...pts.map((p) => p.wpm))
  const max = Math.max(...pts.map((p) => p.wpm))
  const span = Math.max(20, max - min)
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => H - ((v - min + span * 0.1) / (span * 1.2)) * H
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.wpm).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <rect
            x={x(i) - W / pts.length / 2}
            y={0}
            width={W / pts.length}
            height={H + 20}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
          {(hover === i || (hover === null && i === pts.length - 1)) && (
            <>
              <circle cx={x(i)} cy={y(p.wpm)} r={4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
              <text x={Math.min(W - 20, Math.max(20, x(i)))} y={y(p.wpm) - 11} textAnchor="middle" fontSize={11.5} fill="var(--ink-dim)" fontWeight={600}>
                {p.wpm} wpm
              </text>
            </>
          )}
        </g>
      ))}
    </svg>
  )
}

export default function StatsPage({ onBack }: { onBack: () => void }) {
  const [stats, setStats] = useState<StatsSummary | null>(null)

  useEffect(() => {
    listSessions(90).then((s) => setStats(summarize(s)))
  }, [])

  const tiles = useMemo(() => {
    if (!stats) return []
    return [
      { v: String(stats.streak), unit: stats.streak === 1 ? 'day' : 'days', l: 'Current streak', flame: stats.streak > 1 },
      { v: fmtNumber(stats.totalWords), unit: '', l: 'Words read (90d)' },
      { v: String(stats.avgWpm || '—'), unit: stats.avgWpm ? 'wpm' : '', l: 'Average speed' },
      { v: String(stats.bestWpm || '—'), unit: stats.bestWpm ? 'wpm' : '', l: 'Fastest session' },
      {
        v: stats.minutesSaved >= 60 ? (stats.minutesSaved / 60).toFixed(1) : String(Math.round(stats.minutesSaved)),
        unit: stats.minutesSaved >= 60 ? 'hrs' : 'min',
        l: 'Time saved vs 230 wpm',
      },
    ]
  }, [stats])

  return (
    <div className="shell fade-in">
      <div className="topbar">
        <button className="btn icon ghost" onClick={onBack}>
          <IconBack />
        </button>
        <div className="brand">Stats</div>
        <div className="topbar-spacer" />
      </div>
      {!stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          <div className="stats-grid">
            {tiles.map((t, i) => (
              <div key={i} className="stat-tile card" style={{ animation: `fadeUp .35s var(--ease) ${i * 0.05}s both` }}>
                <div className="v">
                  {t.flame && (
                    <span style={{ color: 'var(--accent)', marginRight: 5, verticalAlign: -2, display: 'inline-block' }}>
                      <IconFlame size={20} />
                    </span>
                  )}
                  {t.v}
                  {t.unit && <span className="unit">{t.unit}</span>}
                </div>
                <div className="l">{t.l}</div>
              </div>
            ))}
          </div>
          <div className="chart-card card">
            <h3>Daily reading</h3>
            <div className="sub">Words read per day, last two weeks</div>
            <BarChart stats={stats} />
          </div>
          <div className="chart-card card">
            <h3>Speed trend</h3>
            <div className="sub">Session speed over your recent reads</div>
            <TrendChart stats={stats} />
          </div>
          {stats.totalWords === 0 && (
            <div className="empty-state">
              <h3>No sessions yet</h3>
              <p>Read something from your library and your stats will start filling in.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
