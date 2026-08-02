import React, { useLayoutEffect, useRef } from 'react'

/**
 * Renders a word (or chunk) as ONE natural text run, then shifts it so the
 * centre of the ORP letter sits exactly on the focus marker (the container's
 * horizontal centre).
 *
 * Deliberately NOT a `1fr auto 1fr` grid: WebKit does not re-run grid track
 * sizing when only an item's text content changes, so the middle (letter)
 * column kept the previous word's width — leaving a visible gap after the
 * letter when the previous ORP letter was wide, or overlapping glyphs when it
 * was narrow. Measuring the letter and translating the whole run cannot drift
 * that way, and keeps the word's natural glyph spacing.
 */
export default function OrpWord({ text, orp }: { text: string; orp: number }) {
  const wordRef = useRef<HTMLSpanElement>(null)
  const orpRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const align = () => {
      const word = wordRef.current
      const letter = orpRef.current
      if (!word || !letter) return
      // offsetLeft is relative to the inner span (its offsetParent, being
      // positioned), so this is the letter-centre within the text run.
      const shift = letter.offsetLeft + letter.offsetWidth / 2
      word.style.transform = `translateX(${-shift}px)`
    }
    align()
    // Re-align once the webfont arrives — metrics change under us otherwise.
    let live = true
    document.fonts?.ready?.then(() => live && align())
    return () => {
      live = false
    }
  })

  return (
    <div className="rsvp-word">
      <span className="rsvp-word-inner" ref={wordRef}>
        {text.slice(0, orp)}
        <span className="orp" ref={orpRef}>
          {text[orp] ?? ''}
        </span>
        {text.slice(orp + 1)}
      </span>
    </div>
  )
}
