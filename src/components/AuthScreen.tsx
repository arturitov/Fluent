import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { APP_TAGLINE } from '../config'
import { tokenize, chunk, durationFor, Chunk } from '../lib/tokenize'

const DEMO_TEXT =
  'This is what four hundred and fifty words per minute feels like. Your eyes never move. Each word arrives already in focus, aligned on the one letter your brain reads fastest. Nothing to scroll, nothing to lose your place in. Save an article, a paper, a book — and finish it in half the time.'

/** A live RSVP demo running on the sign-in screen: the product, before signup. */
function RsvpDemo() {
  const chunks = useRef<Chunk[]>(chunk(tokenize(DEMO_TEXT), 1)).current
  const [i, setI] = useState(0)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const c = chunks[i]
    if (!c) return
    const ms = durationFor(c.weight, c.tokens.length, 450, 0.6)
    timer.current = window.setTimeout(() => setI((n) => (n + 1) % chunks.length), ms)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [i, chunks])

  const c = chunks[i]
  if (!c) return null
  return (
    <div className="auth-demo" aria-hidden="true">
      <div className="auth-demo-stage">
        <span className="auth-demo-guide top" />
        <div className="auth-demo-word">
          <span className="pre">{c.text.slice(0, c.orp)}</span>
          <span className="orp">{c.text[c.orp] ?? ''}</span>
          <span className="post">{c.text.slice(c.orp + 1)}</span>
        </div>
        <span className="auth-demo-guide bottom" />
      </div>
      <div className="auth-demo-label">live demo · 450 wpm</div>
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNote(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session) return // signed in immediately
        setNote('Check your inbox — we sent you a confirmation link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      setError(
        /invalid api key|failed to fetch|networkerror/i.test(msg)
          ? "Can't reach Fluent's servers right now. Check your connection and try again."
          : /invalid login/i.test(msg)
            ? 'That email and password combination doesn\'t match an account.'
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
        <div className="auth-logo">
          Flu<span className="orp">e</span>nt
        </div>
        <div className="auth-tagline">{APP_TAGLINE}</div>
        <RsvpDemo />
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
          <button className="btn primary" type="submit" disabled={busy} style={{ padding: '13px', fontSize: 15 }}>
            {busy ? 'One moment…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <div className="auth-switch">
          {mode === 'signin' ? 'New here?' : 'Already have an account?'}
          <button
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setError(null)
              setNote(null)
            }}
          >
            {mode === 'signin' ? 'Create an account' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}
