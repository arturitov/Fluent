import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Doc } from '../lib/types'
import { getDoc, getPosition, savePosition, saveSession, updateDoc } from '../lib/db'
import { tokenize, chunk, Chunk } from '../lib/tokenize'
import { loadSettings, saveSettings, onSettings } from '../lib/settings'
import { RsvpEngine } from '../lib/rsvp'
import { useToast } from './Toast'
import OrpWord from './OrpWord'
import {
  IconBack, IconPlay, IconPause, IconPrev, IconNext, IconEye, IconSpeaker, IconLayers, IconCheck,
} from './icons'

interface Props {
  docId: string
  onExit: () => void
}

export default function Reader({ docId, onExit }: Props) {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [settings, setSettings] = useState(loadSettings())
  const [frame, setFrame] = useState<Chunk | null>(null)
  const [playing, setPlaying] = useState(false)
  const [peek, setPeek] = useState(false)
  const [finished, setFinished] = useState(false)
  const [wpm, setWpm] = useState(loadSettings().wpm)
  const [effWpm, setEffWpm] = useState(loadSettings().wpm)
  const [progress, setProgress] = useState(0)
  const [tts, setTts] = useState(false)
  const [hintVisible, setHintVisible] = useState(true)
  const engineRef = useRef<RsvpEngine | null>(null)
  const sessionStart = useRef<string | null>(null)
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null)
  /** Timestamp of the last touch we handled. Browsers fire a synthetic click
   *  after touchend, which would otherwise toggle playback a second time —
   *  a single tap would start and immediately stop the reader. */
  const touchHandledAt = useRef(0)
  const ttsRef = useRef<{ utterance: SpeechSynthesisUtterance | null; baseWord: number }>({ utterance: null, baseWord: 0 })
  const toast = useToast()

  useEffect(() => onSettings(setSettings), [])

  // tokenize
  const tokens = useMemo(() => (doc ? tokenize(doc.content) : []), [doc])
  const chunks = useMemo(() => chunk(tokens, settings.chunkSize), [tokens, settings.chunkSize])

  // word index ↔ chunk index maps
  const chunkForWord = useCallback(
    (wordIdx: number) => {
      let lo = 0, hi = chunks.length - 1, ans = 0
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (chunks[mid].startIndex <= wordIdx) {
          ans = mid
          lo = mid + 1
        } else hi = mid - 1
      }
      return ans
    },
    [chunks],
  )

  // load doc + position
  useEffect(() => {
    let alive = true
    ;(async () => {
      const d = await getDoc(docId)
      if (!alive) return
      if (!d || !d.content) {
        setNotFound(true)
        return
      }
      setDoc(d)
    })()
    return () => {
      alive = false
    }
  }, [docId])

  const persist = useCallback(
    (wordIndex: number, curWpm: number) => {
      savePosition({ document_id: docId, word_index: wordIndex, wpm: curWpm })
    },
    [docId],
  )

  const endSession = useCallback(() => {
    const eng = engineRef.current
    if (!eng || !sessionStart.current) return
    const mins = eng.activeMs / 60000
    if (eng.wordsRead >= 10 && mins > 0.03) {
      saveSession({
        document_id: docId,
        wpm: Math.round(eng.wordsRead / mins),
        words_read: eng.wordsRead,
        duration_ms: eng.activeMs,
        started_at: sessionStart.current,
      })
    }
    sessionStart.current = null
    eng.wordsRead = 0
    eng.activeMs = 0
  }, [docId])

  // build engine when chunks ready
  useEffect(() => {
    if (!doc || !chunks.length) return
    let cancelled = false
    ;(async () => {
      const pos = await getPosition(docId)
      if (cancelled) return
      const savedWpm = pos?.wpm ?? settings.wpm
      const startChunk = pos?.word_index ? chunkForWord(pos.word_index) : 0
      const engine = new RsvpEngine(chunks, startChunk, {
        wpm: savedWpm,
        adaptivity: settings.adaptivity,
        ramp: settings.ramp,
        onFrame: (c, s) => {
          setFrame(c)
          setEffWpm(s.effectiveWpm)
          setProgress(c.startIndex / Math.max(1, tokens.length))
        },
        onPause: (s) => {
          setPlaying(false)
          const cur = chunks[s.index]
          if (cur) persist(cur.startIndex, s.wpm)
        },
        onFinish: (s) => {
          setPlaying(false)
          setFinished(true)
          window.speechSynthesis?.cancel()
          endSession()
          persist(tokens.length, s.wpm)
          updateDoc(docId, { status: 'finished' })
        },
      })
      engineRef.current?.destroy()
      engineRef.current = engine
      setWpm(savedWpm)
      setEffWpm(savedWpm)
      const first = chunks[engine.state.index]
      if (first) {
        setFrame(first)
        setProgress(first.startIndex / Math.max(1, tokens.length))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, chunks])

  // periodic position save while playing
  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      const eng = engineRef.current
      const cur = eng?.current()
      if (eng && cur) persist(cur.startIndex, eng.state.wpm)
    }, 5000)
    return () => clearInterval(t)
  }, [playing, persist])

  // save on unmount
  useEffect(() => {
    return () => {
      const eng = engineRef.current
      const cur = eng?.current()
      if (eng && cur && !finished) persist(cur.startIndex, eng.state.wpm)
      window.speechSynthesis?.cancel()
      endSession()
      eng?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const play = useCallback(() => {
    const eng = engineRef.current
    if (!eng) return
    if (!sessionStart.current) sessionStart.current = new Date().toISOString()
    setPeek(false)
    setFinished(false)
    setHintVisible(false)
    if (doc && doc.status === 'unread') updateDoc(doc.id, { status: 'reading' })
    eng.play()
    setPlaying(true)
  }, [doc])

  const pause = useCallback((showPeek = true) => {
    const eng = engineRef.current
    if (!eng) return
    eng.pause()
    window.speechSynthesis?.cancel()
    if (tts) setTts(false)
    setPlaying(false)
    if (showPeek) setPeek(true)
  }, [tts])

  const toggle = useCallback(() => {
    if (engineRef.current?.state.playing || tts) pause()
    else play()
  }, [play, pause, tts])

  const adjustWpm = useCallback(
    (delta: number) => {
      const eng = engineRef.current
      if (!eng) return
      eng.setWpm(eng.state.wpm + delta)
      setWpm(eng.state.wpm)
      setEffWpm(eng.state.wpm)
      saveSettings({ wpm: eng.state.wpm })
      persist(eng.current()?.startIndex ?? 0, eng.state.wpm)
    },
    [persist],
  )

  const jump = useCallback((dir: -1 | 1) => {
    engineRef.current?.jumpSentence(dir)
    setFinished(false)
  }, [])

  // ---- TTS narration ----
  const startTts = useCallback(() => {
    const eng = engineRef.current
    const synth = window.speechSynthesis
    if (!eng || !synth || !doc) {
      toast('Narration not supported in this browser', 'error')
      return
    }
    pause(false)
    setTts(true)
    setHintVisible(false)
    if (!sessionStart.current) sessionStart.current = new Date().toISOString()
    const startWord = eng.current()?.startIndex ?? 0
    const words = tokens.map((t) => t.text)
    const text = words.slice(startWord).join(' ')
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate = Math.min(2.5, Math.max(0.6, wpm / 195))
    const voice = synth.getVoices().find((v) => v.name === settings.ttsVoice)
    if (voice) utt.voice = voice
    // char offset → word index mapping
    const offsets: number[] = []
    let acc = 0
    for (let i = startWord; i < words.length; i++) {
      offsets.push(acc)
      acc += words[i].length + 1
    }
    utt.onboundary = (e) => {
      if (e.name !== 'word' && e.charLength === undefined) return
      let lo = 0, hi = offsets.length - 1, ans = 0
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (offsets[mid] <= e.charIndex) {
          ans = mid
          lo = mid + 1
        } else hi = mid - 1
      }
      const wordIdx = startWord + ans
      const ci = chunkForWord(wordIdx)
      const eng2 = engineRef.current
      if (eng2) {
        eng2.wordsRead = Math.max(eng2.wordsRead, wordIdx - startWord)
        eng2.seek(ci)
        setProgress(wordIdx / Math.max(1, tokens.length))
      }
    }
    utt.onend = () => {
      setTts(false)
      const eng2 = engineRef.current
      if (eng2 && eng2.state.index >= chunks.length - 1) {
        setFinished(true)
        endSession()
        updateDoc(docId, { status: 'finished' })
      }
    }
    ttsRef.current = { utterance: utt, baseWord: startWord }
    synth.cancel()
    synth.speak(utt)
  }, [doc, tokens, wpm, settings.ttsVoice, chunkForWord, chunks.length, docId, endSession, pause, toast])

  const toggleTts = useCallback(() => {
    if (tts) {
      window.speechSynthesis?.cancel()
      setTts(false)
    } else startTts()
  }, [tts, startTts])

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowLeft') jump(-1)
      else if (e.key === 'ArrowRight') jump(1)
      else if (e.key === 'ArrowUp') {
        e.preventDefault()
        adjustWpm(25)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        adjustWpm(-25)
      } else if (e.key === 'Escape') {
        if (peek) setPeek(false)
        else onExit()
      } else if (e.key.toLowerCase() === 'f') {
        document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, jump, adjustWpm, onExit, peek])

  // touch gestures on stage
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0] ?? e.changedTouches[0]
    if (!t) return
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchStart.current
    if (!s) return
    touchStart.current = null
    touchHandledAt.current = Date.now()
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      jump(dx > 0 ? -1 : 1)
    } else if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.6) {
      adjustWpm(dy < 0 ? 25 : -25)
      toast(`${engineRef.current?.state.wpm} wpm`)
    } else if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && Date.now() - s.t < 400) {
      toggle()
    }
  }

  /** True for the synthetic click a browser fires right after a tap we already
   *  handled. Without this every tap acts twice, and whichever element happens
   *  to sit under the finger when the overlay renders receives a phantom click. */
  const isSyntheticClick = () => Date.now() - touchHandledAt.current < 700

  const onStageClick = () => {
    if (isSyntheticClick()) return
    toggle()
  }

  // context peek paragraphs
  const peekContent = useMemo(() => {
    if (!peek || !frame) return null
    const currentPara = frame.paragraph
    const currentWord = frame.startIndex
    const paras = new Map<number, { idx: number; text: string }[]>()
    tokens.forEach((t, i) => {
      if (t.paragraph < currentPara - 1 || t.paragraph > currentPara + 1) return
      if (!paras.has(t.paragraph)) paras.set(t.paragraph, [])
      paras.get(t.paragraph)!.push({ idx: i, text: t.text })
    })
    return { paras: [...paras.entries()].sort((a, b) => a[0] - b[0]), currentPara, currentWord }
  }, [peek, frame, tokens])

  const wordsLeft = tokens.length - (frame?.startIndex ?? 0)
  const minsLeft = wordsLeft / Math.max(60, effWpm)

  if (notFound)
    return (
      <div className="reader">
        <div className="reader-top">
          <button className="btn icon ghost" onClick={onExit}>
            <IconBack />
          </button>
        </div>
        <div className="reader-stage">
          <div className="muted">This document isn't available offline yet.</div>
        </div>
      </div>
    )

  if (!doc)
    return (
      <div className="reader">
        <div className="reader-stage">
          <div className="spinner" />
        </div>
      </div>
    )

  return (
    <div className="reader" data-font={settings.font}>
      <div className="reader-progress-track">
        <div className="reader-progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="reader-top">
        <button className="btn icon ghost" onClick={onExit} title="Back to library (Esc)">
          <IconBack />
        </button>
        <div className="reader-title">{doc.title}</div>
        <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', minWidth: 76, textAlign: 'right' }}>
          {Math.round(progress * 100)}% · {minsLeft < 1 ? '<1' : Math.round(minsLeft)}m left
        </div>
      </div>

      <div className="reader-stage" onClick={onStageClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {finished ? (
          <FinishCard
            words={tokens.length}
            wpm={effWpm}
            onRestart={(e) => {
              e.stopPropagation()
              engineRef.current?.seek(0)
              setFinished(false)
              persist(0, wpm)
            }}
            onExit={(e) => {
              e.stopPropagation()
              onExit()
            }}
          />
        ) : (
          <div className="rsvp-display">
            {settings.focusLine !== 'none' && <div className={`rsvp-guides ${settings.focusLine}`} />}
            {frame && <OrpWord text={frame.text} orp={frame.orp} />}
          </div>
        )}
        {hintVisible && !playing && !finished && (
          <div className="reader-hint">tap or press space to start · ← → sentence · ↑ ↓ speed</div>
        )}
        {peek && peekContent && (
          <div
            className="peek"
            onClick={(e) => {
              e.stopPropagation()
              // The click that follows the tap which opened this overlay lands
              // here, because the overlay only just rendered. Ignore it, or the
              // peek closes the instant it opens. Real taps bubble to the stage.
              if (isSyntheticClick()) return
              setPeek(false)
              play()
            }}
          >
            <div className="peek-inner">
              {peekContent.paras.map(([pIdx, words]) => (
                <p key={pIdx} className={`peek-para ${pIdx === peekContent.currentPara ? 'current' : ''}`}>
                  {words.map(({ idx, text }) => (
                    <span key={idx}>
                      <span
                        className={`peek-word ${idx === peekContent.currentWord ? 'now' : ''}`}
                        // Keep the tap from bubbling to the stage (which would just
                        // resume), and clear the guard so this word's own click is
                        // recognised as deliberate rather than a leftover synthetic one.
                        onTouchEnd={(e) => {
                          e.stopPropagation()
                          touchHandledAt.current = 0
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isSyntheticClick()) return
                          engineRef.current?.seek(chunkForWord(idx))
                          setPeek(false)
                          play()
                        }}
                      >
                        {text}
                      </span>{' '}
                    </span>
                  ))}
                </p>
              ))}
              <div className="peek-hint">tap a word to jump there · tap anywhere else to continue</div>
            </div>
          </div>
        )}
      </div>

      <div className="reader-controls" onClick={(e) => e.stopPropagation()}>
        <button className="ctrl-btn" onClick={() => adjustWpm(-25)} title="Slower (↓)">
          −
        </button>
        <div className="wpm-box">
          <div className="wpm-value">{playing && settings.ramp ? effWpm : wpm}</div>
          <div className="wpm-label">wpm</div>
        </div>
        <button className="ctrl-btn" onClick={() => adjustWpm(25)} title="Faster (↑)">
          +
        </button>
        <button className="ctrl-btn" onClick={() => jump(-1)} title="Previous sentence (←)">
          <IconPrev />
        </button>
        <button className="ctrl-btn big" onClick={toggle} title="Play / pause (space)">
          {playing || tts ? <IconPause size={24} /> : <IconPlay size={24} />}
        </button>
        <button className="ctrl-btn" onClick={() => jump(1)} title="Next sentence (→)">
          <IconNext />
        </button>
        <button
          className={`ctrl-btn ${peek ? 'active' : ''}`}
          onClick={() => {
            if (playing) pause(true)
            else setPeek((p) => !p)
          }}
          title="Context peek"
        >
          <IconEye />
        </button>
        <button
          className={`ctrl-btn ${settings.chunkSize > 1 ? 'active' : ''}`}
          onClick={() => saveSettings({ chunkSize: settings.chunkSize > 1 ? 1 : 2 })}
          title="Chunking: show word groups"
        >
          <IconLayers />
        </button>
        <button className={`ctrl-btn ${tts ? 'active' : ''}`} onClick={toggleTts} title="Narration (text-to-speech)">
          <IconSpeaker />
        </button>
      </div>
    </div>
  )
}

function FinishCard({
  words,
  wpm,
  onRestart,
  onExit,
}: {
  words: number
  wpm: number
  onRestart: (e: React.MouseEvent) => void
  onExit: (e: React.MouseEvent) => void
}) {
  const minsSaved = Math.max(0, words / 230 - words / Math.max(230, wpm))
  return (
    <div className="finish-card" onClick={(e) => e.stopPropagation()}>
      <div style={{ color: 'var(--good)', marginBottom: 10 }}>
        <IconCheck size={34} />
      </div>
      <h2>Finished</h2>
      <p>Nice work — that's another one off the pile.</p>
      <div className="finish-stats">
        <div className="finish-stat card">
          <div className="v">{words.toLocaleString()}</div>
          <div className="l">words</div>
        </div>
        <div className="finish-stat card">
          <div className="v">{wpm}</div>
          <div className="l">wpm</div>
        </div>
        <div className="finish-stat card">
          <div className="v">{minsSaved < 1 ? '<1' : Math.round(minsSaved)}m</div>
          <div className="l">time saved</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn" onClick={onRestart}>
          Read again
        </button>
        <button className="btn primary" onClick={onExit}>
          Back to library
        </button>
      </div>
    </div>
  )
}
