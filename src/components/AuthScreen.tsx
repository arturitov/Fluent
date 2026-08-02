import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_TAGLINE } from '../config'

const DEMO_WORDS = ['Save', 'anything.', 'Read', 'it', 'faster.', '', 'This', 'is', 'how', 'fast', '450', 'wpm', 'feels.', '']

function Wordmark() {
  return (
    <div className="auth-logo">
      Flu<span className="orp">e</span>nt
    </div>
  )
}

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [demoIdx, setDemoIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setDemoIdx((i) => (i + 1) % DEMO_WORDS.length), 133)
    return () => clearInterval(t)
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNote(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) return // signed in immediately (confirmations off)
        setNote('Check your inbox — we sent you a confirmation link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(
        /invalid api key/i.test(msg)
          ? 'Backend configuration issue — the Supabase keys need to be updated. See the project README.'
          : msg,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-orb" />
      <div className="auth-card">
        <Wordmark />
        <div className="auth-tagline">
          {APP_TAGLINE}{' '}
          <span className="auth-demo-word" style={{ color: 'var(--accent)', fontWeight: 650, minWidth: 70, display: 'inline-block' }}>
            {DEMO_WORDS[demoIdx]}
          </span>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <input
            className="input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            className="input"
            type="password"
            placeholder={mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
          {error && <div className="auth-error">{error}</div>}
          {note && <div className="auth-note">{note}</div>}
          <button className="btn primary" type="submit" disabled={busy} style={{ padding: '12px', fontSize: 15 }}>
            {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <div className="auth-switch">
          {mode === 'signin' ? "New here?" : 'Already have an account?'}
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); setNote(null) }}>
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
