import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Doc, DocStatus } from '../lib/types'
import { listDocs, saveDoc, updateDoc, deleteDoc, listPositions } from '../lib/db'
import { extractFromUrl } from '../lib/extract/url'
import { extractFromFile, extractFromPaste } from '../lib/extract/files'
import { SAMPLE_DOC } from '../lib/sample'
import { readingTime, fmtNumber } from '../lib/stats'
import { loadSettings } from '../lib/settings'
import { navigate } from '../App'
import { useToast } from './Toast'
import ImportModal from './ImportModal'
import { User } from '../lib/supabase'
import {
  IconSearch, IconLink, IconFile, IconText, IconChart, IconGear, IconDots, IconCheck,
  IconBook, IconTrash, IconArchive, IconLogout, IconPlus,
} from './icons'

const FILTERS: { key: 'all' | DocStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'reading', label: 'Reading' },
  { key: 'finished', label: 'Finished' },
  { key: 'archived', label: 'Archived' },
]

const SOURCE_LABEL: Record<string, string> = {
  url: 'Article', pdf: 'PDF', epub: 'Book', docx: 'Document', txt: 'Text', md: 'Markdown',
  paste: 'Pasted', manual: 'Note', sample: 'Guide',
}

interface Props {
  user: User
  onOpenSettings: () => void
  onOpenStats: () => void
  onOpenCmd: () => void
  onSignOut: () => void
}

export default function Library({ user, onOpenSettings, onOpenStats, onOpenCmd, onSignOut }: Props) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [positions, setPositions] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<'all' | DocStatus>('all')
  const [query, setQuery] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [importing, setImporting] = useState(false)
  const [showImport, setShowImport] = useState<'paste' | 'file' | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const d = await listDocs()
    setDocs(d)
    setPositions(await listPositions())
    return d
  }, [])

  useEffect(() => {
    refresh().then(async (d) => {
      // First run: seed the welcome guide so the empty state is never truly empty
      if (d.length === 0 && !localStorage.getItem('fluent.seeded')) {
        localStorage.setItem('fluent.seeded', '1')
        try {
          await saveDoc(SAMPLE_DOC)
          refresh()
        } catch { /* backend unreachable — fine */ }
      }
    })
  }, [refresh])

  // PWA share-target & bookmarklet: ?url= or ?text=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sharedUrl = params.get('url') || params.get('add')
    const sharedText = params.get('text')
    if (sharedUrl || sharedText) {
      window.history.replaceState({}, '', window.location.pathname + window.location.hash)
      if (sharedUrl) importUrl(sharedUrl)
      else if (sharedText && sharedText.length > 100) importPaste(sharedText, params.get('title') ?? undefined)
      else if (sharedText && /^https?:\/\/\S+$/.test(sharedText.trim())) importUrl(sharedText.trim())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // keyboard: / focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const importUrl = async (url: string) => {
    if (!url.trim()) return
    setImporting(true)
    try {
      const ex = await extractFromUrl(url)
      const doc = await saveDoc(ex)
      setUrlValue('')
      toast(`Saved “${doc.title.slice(0, 48)}${doc.title.length > 48 ? '…' : ''}”`)
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error')
    } finally {
      setImporting(false)
    }
  }

  const importPaste = async (text: string, title?: string) => {
    try {
      const doc = await saveDoc(extractFromPaste(text, title))
      toast(`Saved “${doc.title.slice(0, 48)}”`)
      refresh()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Import failed', 'error')
    }
  }

  const importFiles = async (files: FileList | File[]) => {
    setImporting(true)
    for (const file of Array.from(files)) {
      try {
        toast(`Importing ${file.name}…`)
        const ex = await extractFromFile(file)
        await saveDoc(ex)
        toast(`Saved “${ex.title.slice(0, 48)}”`)
      } catch (e) {
        toast(e instanceof Error ? e.message : `Couldn't import ${file.name}`, 'error')
      }
    }
    setImporting(false)
    refresh()
  }

  // page-wide drag & drop
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault()
        setDragOver(true)
      }
    }
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setDragOver(false)
    }
    const onDrop = (e: DragEvent) => {
      setDragOver(false)
      if (e.dataTransfer?.files.length) {
        e.preventDefault()
        importFiles(e.dataTransfer.files)
      }
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    if (!docs) return []
    let out = docs
    if (filter !== 'all') out = out.filter((d) => d.status === filter)
    else out = out.filter((d) => d.status !== 'archived')
    if (query.trim()) {
      const q = query.toLowerCase()
      out = out.filter(
        (d) => d.title.toLowerCase().includes(q) || (d.author ?? '').toLowerCase().includes(q) || (d.excerpt ?? '').toLowerCase().includes(q),
      )
    }
    return out
  }, [docs, filter, query])

  const setStatus = async (doc: Doc, status: DocStatus) => {
    setMenuFor(null)
    setDocs((ds) => ds?.map((d) => (d.id === doc.id ? { ...d, status } : d)) ?? null)
    await updateDoc(doc.id, { status })
  }

  const remove = async (doc: Doc) => {
    setMenuFor(null)
    setDocs((ds) => ds?.filter((d) => d.id !== doc.id) ?? null)
    await deleteDoc(doc.id)
    toast('Deleted')
  }

  const wpm = loadSettings().wpm

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand" onClick={() => setFilter('all')}>
          Flu<span className="orp">e</span>nt
        </div>
        <div className="topbar-spacer" />
        <div className="searchbox">
          <IconSearch />
          <input
            ref={searchRef}
            className="input"
            placeholder="Search library…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="btn icon ghost" title="Stats" onClick={onOpenStats}>
          <IconChart />
        </button>
        <button className="btn icon ghost" title="Settings" onClick={onOpenSettings}>
          <IconGear />
        </button>
        <button className="btn icon ghost" title="Sign out" onClick={onSignOut}>
          <IconLogout size={18} />
        </button>
      </div>

      <div className="import-bar">
        <input
          className="input"
          placeholder="Paste a link to save an article…"
          value={urlValue}
          onChange={(e) => setUrlValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && importUrl(urlValue)}
          inputMode="url"
        />
        <button className="btn primary" disabled={importing || !urlValue.trim()} onClick={() => importUrl(urlValue)}>
          {importing ? <div className="spinner" style={{ borderTopColor: '#fff', width: 15, height: 15 }} /> : <IconLink />}
          Save
        </button>
        <button className="btn" onClick={() => setShowImport('paste')}>
          <IconText /> Paste text
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()}>
          <IconFile /> Upload
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          multiple
          accept=".pdf,.epub,.docx,.txt,.md,.markdown,text/plain"
          onChange={(e) => e.target.files && importFiles(e.target.files)}
        />
      </div>

      <div className="filter-row">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
        <div className="spacer" />
        <span className="kbd" title="Command bar" style={{ cursor: 'pointer' }} onClick={onOpenCmd}>
          ⌘K
        </span>
      </div>

      {docs === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <h3>{query ? 'Nothing matches that search' : 'Your library is empty'}</h3>
          <p>
            {query
              ? 'Try a different search, or import something new.'
              : 'Paste a link above, drop in a PDF, EPUB or Word doc, or paste raw text — then read it at double speed.'}
          </p>
          {!query && (
            <button className="btn primary" onClick={() => setShowImport('paste')}>
              <IconPlus /> Add your first read
            </button>
          )}
        </div>
      ) : (
        <div className="doc-grid">
          {filtered.map((doc, i) => {
            const progress = doc.word_count > 0 ? Math.min(1, (positions[doc.id] ?? 0) / doc.word_count) : 0
            return (
              <div
                key={doc.id}
                className="doc-card card"
                style={{ animationDelay: `${Math.min(i * 0.03, 0.3)}s` }}
                onClick={() => navigate({ name: 'read', id: doc.id })}
              >
                <div className="doc-card-top">
                  {doc.favicon_url && <img className="doc-favicon" src={doc.favicon_url} alt="" loading="lazy" />}
                  <span className="doc-source">{SOURCE_LABEL[doc.source_type] ?? doc.source_type}</span>
                  {doc.status === 'finished' && (
                    <span style={{ color: 'var(--good)', display: 'inline-flex' }} title="Finished">
                      <IconCheck size={14} />
                    </span>
                  )}
                </div>
                <div className="doc-title">{doc.title}</div>
                <div className="doc-excerpt">{doc.excerpt}</div>
                <div className="doc-meta">
                  {doc.author && <span>{doc.author.slice(0, 26)}</span>}
                  <span>{fmtNumber(doc.word_count)} words</span>
                  <span>{readingTime(doc.word_count, wpm)}</span>
                  {progress > 0.005 && doc.status !== 'finished' && <span>{Math.round(progress * 100)}%</span>}
                </div>
                {progress > 0.005 && doc.status !== 'finished' && (
                  <div className="doc-progress">
                    <div style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
                <button
                  className={`doc-menu-btn ${menuFor === doc.id ? 'open' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuFor(menuFor === doc.id ? null : doc.id)
                  }}
                >
                  <IconDots />
                </button>
                {menuFor === doc.id && (
                  <div className="menu" style={{ top: 40, right: 10 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setStatus(doc, 'unread')}>
                      <IconBook size={15} /> Mark unread
                    </button>
                    <button onClick={() => setStatus(doc, 'finished')}>
                      <IconCheck size={15} /> Mark finished
                    </button>
                    <button onClick={() => setStatus(doc, doc.status === 'archived' ? 'unread' : 'archived')}>
                      <IconArchive size={15} /> {doc.status === 'archived' ? 'Unarchive' : 'Archive'}
                    </button>
                    <hr />
                    <button className="danger" onClick={() => remove(doc)}>
                      <IconTrash size={15} /> Delete
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {menuFor && <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setMenuFor(null)} />}

      {dragOver && (
        <div
          className="modal-backdrop"
          style={{ alignItems: 'center', pointerEvents: 'none', fontSize: 19, fontWeight: 650 }}
        >
          Drop to import
        </div>
      )}

      {showImport && (
        <ImportModal
          initialTab={showImport}
          onClose={() => setShowImport(null)}
          onPaste={(text, title) => {
            setShowImport(null)
            importPaste(text, title)
          }}
          onFiles={(files) => {
            setShowImport(null)
            importFiles(files)
          }}
        />
      )}
    </div>
  )
}
