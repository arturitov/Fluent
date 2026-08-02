# Fluent

**Save anything. Read it faster.**

Fluent is a sleek RSVP (Rapid Serial Visual Presentation) speed reader as an installable web app. Paste a link, drop in a PDF/EPUB/DOCX, or paste raw text — then read it word-by-word at 300–1200 wpm with an engine that adapts its pacing to the text.

Live app: **https://arturitov.github.io/Fluent/**

## Features

- **Import anything, client-side** — article URLs (readability extraction with CORS-relay fallbacks), PDF (pdf.js), EPUB, DOCX (mammoth), TXT/Markdown, raw paste, drag & drop anywhere, PWA share-target, and a `?add=<url>` bookmarklet hook.
- **Best-in-class RSVP engine** — ORP (optimal recognition point) letter alignment, adaptive pacing (slows for long/uncommon words, numbers, punctuation; glides through connectives), speed ramping, 1–3 word chunking, context peek (pause → see the paragraph, tap a word to jump), sentence-level rewind/fast-forward.
- **Narration** — text-to-speech with synced word display (Web Speech API).
- **Library** — statuses (unread/reading/finished/archived), search, ⌘K command bar, per-document progress.
- **Stats** — daily words, WPM trend, streaks, time saved vs a 230 wpm baseline.
- **Sync** — Supabase auth + Postgres with Row Level Security; reading position resumes across devices; offline-tolerant with a local cache and pending-write queue.
- **Sleek** — dark / light / AMOLED themes, serif or sans reading font, minimal chrome, keyboard-first.

## Stack

Static React + Vite frontend on **GitHub Pages**; **Supabase** (Auth + Postgres + RLS) as the backend. No servers.

## Setup

1. **Supabase**: create a project, then run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push`). This creates `documents`, `positions`, `reading_sessions`, `highlights` with row-level security.
2. In Auth settings, enable Email provider. (Disable "Confirm email" for instant signups, or keep it on — both work.)
3. Put your project URL + **publishable key** in `src/config.ts` (they are public-safe; RLS protects all data).
4. `npm install && npm run dev`

Deploys to GitHub Pages automatically via Actions on push to `main`.

## Keyboard shortcuts

Space play/pause · ← → jump by sentence · ↑ ↓ speed ±25 · F fullscreen · Esc back · ⌘K command bar · / search

## E2E tests

`node e2e.mjs` runs a full Playwright suite (signup → import URL/PDF/paste → read → resume → stats) against a local `supabase start` stack.
