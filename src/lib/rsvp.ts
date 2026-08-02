import { Chunk, durationFor } from './tokenize'

export interface EngineState {
  index: number // current chunk index
  playing: boolean
  wpm: number // user-set target wpm
  effectiveWpm: number // after ramp
}

export interface EngineOptions {
  wpm: number
  adaptivity: number
  ramp: boolean
  onFrame: (chunk: Chunk, state: EngineState) => void
  onPause: (state: EngineState) => void
  onFinish: (state: EngineState) => void
}

/** RSVP scheduler. Timer-chain based (setTimeout) with drift correction —
 *  smoother than rAF for variable frame durations, battery-friendlier too. */
export class RsvpEngine {
  private chunks: Chunk[]
  private opts: EngineOptions
  private timer: number | null = null
  private rampStart = 0
  state: EngineState

  // session accounting
  wordsRead = 0
  activeMs = 0
  private lastResume = 0

  constructor(chunks: Chunk[], startIndex: number, opts: EngineOptions) {
    this.chunks = chunks
    this.opts = opts
    this.state = { index: startIndex, playing: false, wpm: opts.wpm, effectiveWpm: opts.wpm }
  }

  get length() {
    return this.chunks.length
  }
  current(): Chunk | null {
    return this.chunks[this.state.index] ?? null
  }

  play() {
    if (this.state.playing || !this.chunks.length) return
    if (this.state.index >= this.chunks.length) this.state.index = 0
    this.state.playing = true
    this.rampStart = performance.now()
    this.lastResume = performance.now()
    this.tick()
  }

  pause() {
    if (!this.state.playing) return
    this.state.playing = false
    if (this.timer !== null) window.clearTimeout(this.timer)
    this.timer = null
    this.activeMs += performance.now() - this.lastResume
    this.opts.onPause({ ...this.state })
  }

  toggle() {
    this.state.playing ? this.pause() : this.play()
  }

  setWpm(wpm: number) {
    this.state.wpm = Math.min(1200, Math.max(60, Math.round(wpm / 5) * 5))
    this.rampStart = performance.now() // reset ramp window on manual change
  }

  seek(index: number) {
    this.state.index = Math.min(this.chunks.length - 1, Math.max(0, index))
    const c = this.current()
    if (c) this.opts.onFrame(c, { ...this.state })
  }

  /** Jump backward/forward by sentence. */
  jumpSentence(dir: -1 | 1) {
    const i = this.state.index
    if (dir === -1) {
      // find start of current sentence; if already at start, previous sentence
      let j = i
      while (j > 0 && !this.chunks[j - 1].sentenceEnd) j--
      if (j === i && j > 0) {
        j--
        while (j > 0 && !this.chunks[j - 1].sentenceEnd) j--
      }
      this.seek(j)
    } else {
      let j = i
      while (j < this.chunks.length - 1 && !this.chunks[j].sentenceEnd) j++
      this.seek(Math.min(this.chunks.length - 1, j + 1))
    }
  }

  private effectiveWpm(): number {
    if (!this.opts.ramp) return this.state.wpm
    // ramp from 65% → 100% of target over 75 seconds, eased
    const t = Math.min(1, (performance.now() - this.rampStart) / 75000)
    const eased = 1 - Math.pow(1 - t, 2)
    return Math.round(this.state.wpm * (0.65 + 0.35 * eased))
  }

  private tick() {
    if (!this.state.playing) return
    const chunk = this.chunks[this.state.index]
    if (!chunk) {
      this.state.playing = false
      this.activeMs += performance.now() - this.lastResume
      this.opts.onFinish({ ...this.state })
      return
    }
    const wpm = this.effectiveWpm()
    this.state.effectiveWpm = wpm
    this.opts.onFrame(chunk, { ...this.state })
    const ms = durationFor(chunk.weight, chunk.tokens.length, wpm, this.opts.adaptivity)
    this.timer = window.setTimeout(() => {
      this.wordsRead += chunk.tokens.length
      this.state.index++
      this.tick()
    }, ms)
  }

  destroy() {
    if (this.timer !== null) window.clearTimeout(this.timer)
    if (this.state.playing) this.activeMs += performance.now() - this.lastResume
    this.state.playing = false
  }
}
