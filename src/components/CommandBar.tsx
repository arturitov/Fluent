import React, { useEffect, useMemo, useRef, useState } from 'react'
import { listDocs } from '../lib/db'
import { Doc } from '../lib/types'
import { saveSettings, loadSettings } from '../lib/settings'
import { navigate } from '../App'
import { IconBook, IconGear, IconChart, IconZap } from './icons'

interface Props {
  onClose: () => void
  onOpenSettings: () => void
}

interface Item {
  id: string
  label: string
  meta?: string
  icon: React.ReactNode
  run: () => void
  section: string
}

export default function CommandBar({ onClose, onOpenSettings }: Props) {
  const [query, setQuery] = useState('')
  const [docs, setDocs] = useState<Doc[]>([])
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listDocs().then(setDocs)
    inputRef.current?.focus()
  }, [])

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      {
        id: 'stats',
        label: 'Open stats',
        icon: <IconChart size={16} />,
        run: () => {
          onClose()
          navigate({ name: 'stats' })
        },
        section: 'Actions',
      },
      {
        id: 'settings',
        label: 'Open settings',
        icon: <IconGear size={16} />,
        run: onOpenSettings,
        section: 'Actions',
      },
      ...[250, 350, 450, 600].map((n) => ({
        id: `wpm${n}`,
        label: `Set speed to ${n} wpm`,
        icon: <IconZap size={16} />,
        run: () => {
          saveSettings({ wpm: n })
          onClose()
        },
        section: 'Actions',
      })),
      {
        id: 'theme',
        label: 'Toggle light / dark',
        icon: <IconGear size={16} />,
        run: () => {
          const cur = loadSettings().theme
          saveSettings({ theme: cur === 'light' ? 'dark' : 'light' })
          onClose()
        },
        section: 'Actions',
      },
    ]
    const docItems: Item[] = docs.map((d) => ({
      id: d.id,
      label: d.title,
      meta: `${Math.round(d.word_count / 100) / 10}k words`,
      icon: <IconBook size={16} />,
      run: () => {
        onClose()
        navigate({ name: 'read', id: d.id })
      },
      section: 'Library',
    }))
    const all = [...docItems, ...actions]
    if (!query.trim()) return all.slice(0, 14)
    const q = query.toLowerCase()
    return all
      .map((item) => {
        const label = item.label.toLowerCase()
        let score = 0
        if (label.startsWith(q)) score = 3
        else if (label.includes(q)) score = 2
        else {
          // fuzzy subsequence
          let i = 0
          for (const ch of label) if (ch === q[i]) i++
          if (i === q.length) score = 1
        }
        return { item, score }
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.item)
      .slice(0, 12)
  }, [docs, query, onClose, onOpenSettings])

  useEffect(() => setSel(0), [query])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(items.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      items[sel]?.run()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  let lastSection = ''

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cmdbar" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="input"
          placeholder="Search your library or type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="cmd-list">
          {items.map((item, i) => {
            const header = item.section !== lastSection ? item.section : null
            lastSection = item.section
            return (
              <React.Fragment key={item.id}>
                {header && <div className="cmd-section">{header}</div>}
                <button className={`cmd-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={item.run}>
                  {item.icon}
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  {item.meta && <span className="meta">{item.meta}</span>}
                </button>
              </React.Fragment>
            )
          })}
          {items.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-faint)', fontSize: 13.5 }}>No matches</div>
          )}
        </div>
      </div>
    </div>
  )
}
