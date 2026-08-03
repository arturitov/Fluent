import React, { useEffect, useState } from 'react'
import { loadSettings, saveSettings } from '../lib/settings'
import { Settings } from '../lib/types'
import { isLocalMode, setMode } from '../lib/mode'
import { migrateCloudToLocal, exportLibrary, clearLocalCache } from '../lib/db'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { IconX, IconLogout } from './icons'

interface Props {
  onClose: () => void
  onSignOut: () => void
  userEmail: string | null
  onModeSwitched: () => void
}

export default function SettingsModal({ onClose, onSignOut, userEmail, onModeSwitched }: Props) {
  const [s, setS] = useState<Settings>(loadSettings())
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [busy, setBusy] = useState(false)
  const local = isLocalMode()
  const toast = useToast()

  const switchToLocal = async () => {
    setBusy(true)
    try {
      const n = await migrateCloudToLocal()
      setMode('local')
      await supabase.auth.signOut()
      clearLocalCache()
      toast(`Copied ${n} document${n === 1 ? '' : 's'} to this device`)
      onModeSwitched()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not copy your library', 'error')
    } finally {
      setBusy(false)
    }
  }

  const doExport = async () => {
    setBusy(true)
    try {
      const data = await exportLibrary()
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `fluent-backup-${data.exported_at.slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast(`Backup saved (${data.docs.length} documents)`)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis?.getVoices() ?? [])
    load()
    window.speechSynthesis?.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis?.removeEventListener?.('voiceschanged', load)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const update = (patch: Partial<Settings>) => setS(saveSettings(patch))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="btn icon ghost" onClick={onClose}>
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          <div className="setting-row">
            <div>
              <div className="label">Theme</div>
            </div>
            <div className="seg">
              {(['dark', 'light', 'amoled'] as const).map((t) => (
                <button key={t} className={s.theme === t ? 'active' : ''} onClick={() => update({ theme: t })}>
                  {t === 'amoled' ? 'Black' : t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="label">Reading font</div>
            </div>
            <div className="seg">
              {(['sans', 'serif'] as const).map((f) => (
                <button key={f} className={s.font === f ? 'active' : ''} onClick={() => update({ font: f })}>
                  {f === 'sans' ? 'Sans' : 'Serif'}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="label">Focus marker</div>
              <div className="sub">Visual anchor at the recognition point</div>
            </div>
            <div className="seg">
              {(['guides', 'line', 'none'] as const).map((f) => (
                <button key={f} className={s.focusLine === f ? 'active' : ''} onClick={() => update({ focusLine: f })}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="label">Adaptive pacing</div>
              <div className="sub">Slow for long words &amp; punctuation</div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(s.adaptivity * 100)}
              onChange={(e) => update({ adaptivity: Number(e.target.value) / 100 })}
            />
          </div>
          <div className="setting-row">
            <div>
              <div className="label">Words per flash</div>
              <div className="sub">Chunking — groups feel less choppy</div>
            </div>
            <div className="seg">
              {[1, 2, 3].map((n) => (
                <button key={n} className={s.chunkSize === n ? 'active' : ''} onClick={() => update({ chunkSize: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="label">Speed ramping</div>
              <div className="sub">Start each session slow, accelerate to target</div>
            </div>
            <button className={`switch ${s.ramp ? 'on' : ''}`} onClick={() => update({ ramp: !s.ramp })} aria-label="Speed ramping" />
          </div>
          {voices.length > 0 && (
            <div className="setting-row">
              <div>
                <div className="label">Narration voice</div>
              </div>
              <select
                className="input"
                style={{ width: 180, padding: '8px 10px' }}
                value={s.ttsVoice ?? ''}
                onChange={(e) => update({ ttsVoice: e.target.value || null })}
              >
                <option value="">Default</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name.slice(0, 28)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)' }} />
          <div className="setting-row">
            <div>
              <div className="label">Storage</div>
              <div className="sub">
                {local ? 'This device only — nothing leaves your phone' : `Synced account · ${userEmail ?? ''}`}
              </div>
            </div>
            {!local && (
              <button className="btn" disabled={busy} onClick={switchToLocal}>
                {busy ? 'Copying…' : 'Go device-only'}
              </button>
            )}
          </div>
          <div className="setting-row">
            <div>
              <div className="label">Backup</div>
              <div className="sub">Download your library as a file; restore it via Upload</div>
            </div>
            <button className="btn" disabled={busy} onClick={doExport}>
              Export
            </button>
          </div>
          <button className="btn" onClick={onSignOut} style={{ justifyContent: 'center' }}>
            <IconLogout /> {local ? 'Switch to a synced account' : 'Sign out'}
          </button>
          <div
            className="version-row"
            style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums' }}
          >
            Fluent build {__BUILD_VERSION__}
          </div>
        </div>
      </div>
    </div>
  )
}
