import React, { useEffect, useRef, useState } from 'react'
import { IconX, IconText, IconFile } from './icons'

interface Props {
  initialTab: 'paste' | 'file'
  onClose: () => void
  onPaste: (text: string, title?: string) => void
  onFiles: (files: File[]) => void
}

export default function ImportModal({ initialTab, onClose, onPaste, onFiles }: Props) {
  const [tab, setTab] = useState<'paste' | 'file'>(initialTab)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [over, setOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Add to library</h2>
          <button className="btn icon ghost" onClick={onClose}>
            <IconX />
          </button>
        </div>
        <div className="modal-tabs">
          <button className={`chip ${tab === 'paste' ? 'active' : ''}`} onClick={() => setTab('paste')}>
            <IconText size={13} /> Paste text
          </button>
          <button className={`chip ${tab === 'file' ? 'active' : ''}`} onClick={() => setTab('file')}>
            <IconFile size={13} /> Upload files
          </button>
        </div>
        {tab === 'paste' ? (
          <div className="modal-body">
            <input
              className="input"
              placeholder="Title (optional — we'll use the first line)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="input"
              placeholder="Paste anything — an article, an email, a chapter…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              style={{ resize: 'vertical', minHeight: 160 }}
              autoFocus
            />
            <button className="btn primary" disabled={text.trim().length < 10} onClick={() => onPaste(text, title || undefined)}>
              Save to library
            </button>
          </div>
        ) : (
          <div className="modal-body">
            <div
              className={`drop-zone ${over ? 'over' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(true)
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setOver(false)
                if (e.dataTransfer.files.length) onFiles(Array.from(e.dataTransfer.files))
              }}
            >
              <strong>Drop files here</strong> or click to browse
              <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--ink-faint)' }}>PDF · EPUB · DOCX · TXT · Markdown</div>
            </div>
            <input
              ref={fileInput}
              type="file"
              hidden
              multiple
              accept=".pdf,.epub,.docx,.txt,.md,.markdown,text/plain"
              onChange={(e) => e.target.files && onFiles(Array.from(e.target.files))}
            />
          </div>
        )}
      </div>
    </div>
  )
}
