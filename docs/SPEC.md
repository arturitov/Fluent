# Product spec: Fluent

**One-line pitch:** *Save anything, read it faster.*

## Vision

The gap between "I found something I want to read" and "I'm reading it" is
full of friction: finding the piece again, getting it onto a device,
scrolling past clutter, losing your place. Fluent closes that gap, then makes
the reading itself faster through RSVP (Rapid Serial Visual Presentation).

Two bets, in order of importance:

1. **Frictionless capture.** Anything you find, anywhere, becomes readable in
   one action.
2. **The best RSVP engine in the category** — not just "words flash", but
   pacing that breathes with the text, and an answer to RSVP's real weakness
   (losing context).

It is a web app / PWA, not a native app: one codebase, instant updates, no
review cycle, usable on any device the moment you open the URL.

## Target users

Students and researchers with dense papers; knowledge workers with a
newsletter and report backlog; read-it-later hoarders with a Pocket or
Instapaper pile they want to actually clear; people deliberately training
reading speed.

## Differentiation vs. Readrrr

| | Readrrr | Fluent |
|---|---|---|
| Platform | Native iOS/Mac/Vision Pro, subscription gate before use | Web/PWA, works anywhere, no install friction |
| Import | PDF-first, manual upload | URL paste, files (PDF/EPUB/DOCX/TXT/MD), drag-and-drop, share sheet, paste |
| Backend | Proprietary | Supabase — open, portable, cheap |
| Hosting | App Store | GitHub Pages + Supabase; no servers |
| Design | Functional | Typography and motion as the differentiator |

## Pillars

### 1 — Import anything

All parsing happens client-side, which keeps cost at zero and means no
document ever passes through a third-party server.

- **URL** — fetch, then Readability extraction. Direct fetch first, then CORS
  relays, then a reader-mode service. If all fail, say so honestly and offer
  paste instead. *(Extraction quality is the riskiest thing in the product —
  bad extraction destroys trust immediately.)*
- **Files** — PDF (pdf.js, with hyphenation and line-joining repair), EPUB
  (spine-ordered, via JSZip), DOCX (mammoth), TXT, Markdown.
- **Paste** — for paywalled or JS-rendered pages, the honest fallback.
- **Drag and drop** anywhere on the library; **PWA share target** so mobile
  sharing works like Pocket; `?url=` / `?add=` for bookmarklets.
- Light organisation only: unread / reading / finished / archived, search.
  Not a PKM tool.

### 2 — The RSVP engine

- **ORP alignment.** The optimal recognition point sits slightly left of a
  word's centre; it is highlighted and held perfectly still, so the eye never
  moves. Position varies by word length.
- **Adaptive pacing.** Longer for long words, numbers, and sentence ends;
  shorter for common connectives; an extra beat at paragraph breaks.
  Aggressiveness is a slider from mechanical to musical.
- **Speed ramping.** Optionally start each session at 65% and ease to target
  over ~75 seconds — trains speed instead of just demanding it.
- **Chunking.** 1–3 words per flash for readers who find single-word too
  choppy, respecting clause boundaries.
- **Context peek.** Pause and the surrounding paragraphs appear with your
  place marked; tap any word to jump there and resume. This is the direct
  answer to RSVP's biggest complaint.
- **Controls.** Space, arrows (sentence and speed), tap, swipe, `F` for
  fullscreen.
- **Narration.** TTS with the word display synced to the spoken word.
- Dark / light / AMOLED themes, sans or serif, adjustable focus marker.

### 3 — Track and improve

Words read, WPM average and best, per-day chart, speed trend, streaks, and
time saved against a 230 wpm baseline. Per-document progress resumes at the
exact word, not the page.

### 4 — Sync and access

Supabase Auth with Row Level Security so a user's library is theirs alone.
Reading position follows across devices. Offline-tolerant: local cache for
reads, a queue for writes that flushes on reconnect. Installable PWA.

### 5 — The interface

Minimal chrome — the reading surface *is* the product. Sub-second loads from
a CDN. ⌘K command bar for jumping to any document or changing speed without
the mouse. Library grid with source, estimated time at your actual speed, and
a progress bar.

## Non-goals

Native apps. Social features and public profiles. Full note-taking or a
linked graph. DRM-protected ebooks.

## Success metrics

Time from signup to first successful import (target: under 60 seconds).
Weekly active readers. Average WPM improvement over 30 days. Import success
rate by source type. Free-to-paid conversion, once there is a paid tier.

## Status

**Shipped:** everything in pillars 1–5 above except the items listed as next.

**Next:**

- Browser extension (one-click send-to-Fluent, right-click read-selection).
- Email-to-app ingestion; RSS/OPML bulk import for Pocket/Instapaper migration.
- Highlights, and comprehension check-ins — light optional quizzes after a
  session, the credible answer to "but do you retain it?"
- OCR for scanned PDFs (currently detected and reported, not processed).
- Weekly digest email.
- Monetisation: generous free tier, Pro for unlimited imports, narration,
  advanced stats, priority OCR. No lifetime tier until retention data exists.

## Known risks

Extraction quality varies wildly by site — paywalls, JS-rendered pages,
anti-scraping — which is why the paste fallback is first-class rather than an
afterthought. RSVP's core skepticism is comprehension loss at speed; context
peek exists to address that credibly, and comprehension check-ins are the
planned proof. iOS Safari limits PWA push and background sync, so those
capabilities should not be promised.
