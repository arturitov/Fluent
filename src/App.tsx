import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, User } from './lib/supabase'
import { flushPending, clearLocalCache } from './lib/db'
import { isLocalMode, setMode } from './lib/mode'
import AuthScreen from './components/AuthScreen'
import Library from './components/Library'
import Reader from './components/Reader'
import StatsPage from './components/StatsPage'
import SettingsModal from './components/SettingsModal'
import CommandBar from './components/CommandBar'
import { ToastProvider } from './components/Toast'

export type Route = { name: 'library' } | { name: 'read'; id: string } | { name: 'stats' }

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h.startsWith('read/')) return { name: 'read', id: h.slice(5) }
  if (h === 'stats') return { name: 'stats' }
  return { name: 'library' }
}

export function navigate(route: Route) {
  const h = route.name === 'read' ? `#/read/${route.id}` : route.name === 'stats' ? '#/stats' : '#/'
  if (window.location.hash !== h) window.location.hash = h
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [localMode, setLocalMode] = useState(isLocalMode())
  const [route, setRoute] = useState<Route>(parseHash())
  const [showSettings, setShowSettings] = useState(false)
  const [showCmd, setShowCmd] = useState(false)
  const [libraryKey, setLibraryKey] = useState(0) // bump to refresh library

  useEffect(() => {
    if (localMode) {
      setAuthReady(true)
      return
    }
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setUser(data.session?.user ?? null)
        setAuthReady(true)
      })
      .catch(() => setAuthReady(true))
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [localMode])

  useEffect(() => {
    const onHash = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // flush queued offline writes when we come back online (cloud mode only)
  useEffect(() => {
    if (localMode) return
    const flush = () => flushPending()
    window.addEventListener('online', flush)
    if (user) flushPending()
    return () => window.removeEventListener('online', flush)
  }, [user, localMode])

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowCmd((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const signOut = useCallback(async () => {
    if (isLocalMode()) {
      // "Sign out" of device mode = go back to the account screen; the
      // on-device library stays put for when they return.
      setMode('cloud')
      setLocalMode(false)
      navigate({ name: 'library' })
      return
    }
    await supabase.auth.signOut()
    clearLocalCache()
    navigate({ name: 'library' })
  }, [])

  const enterLocalMode = useCallback(() => {
    setMode('local')
    setLocalMode(true)
    navigate({ name: 'library' })
  }, [])

  const refreshLibrary = useCallback(() => setLibraryKey((k) => k + 1), [])

  const signedIn = localMode || !!user

  const content = useMemo(() => {
    if (!authReady)
      return (
        <div className="auth-screen">
          <div className="spinner" />
        </div>
      )
    if (!signedIn) return <AuthScreen onUseLocal={enterLocalMode} />
    if (route.name === 'read')
      return <Reader docId={route.id} onExit={() => { refreshLibrary(); navigate({ name: 'library' }) }} />
    if (route.name === 'stats') return <StatsPage onBack={() => navigate({ name: 'library' })} />
    return (
      <Library
        key={libraryKey}
        user={user}
        onOpenSettings={() => setShowSettings(true)}
        onOpenStats={() => navigate({ name: 'stats' })}
        onOpenCmd={() => setShowCmd(true)}
        onSignOut={signOut}
      />
    )
  }, [authReady, signedIn, user, route, libraryKey, signOut, refreshLibrary, enterLocalMode])

  return (
    <ToastProvider>
      {content}
      {showSettings && signedIn && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onSignOut={signOut}
          userEmail={user?.email ?? null}
          onModeSwitched={() => {
            setShowSettings(false)
            setLocalMode(isLocalMode())
            setUser(null)
            refreshLibrary()
            navigate({ name: 'library' })
          }}
        />
      )}
      {showCmd && signedIn && (
        <CommandBar
          onClose={() => setShowCmd(false)}
          onOpenSettings={() => {
            setShowCmd(false)
            setShowSettings(true)
          }}
        />
      )}
    </ToastProvider>
  )
}
