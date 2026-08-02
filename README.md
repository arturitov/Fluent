# Fluent 📖

**Save anything. Read it faster.**

An RSVP speed reader as an installable web app. Paste a link, drop in a PDF,
EPUB or Word file, or paste raw text — then read it one word at a time at
300–1200 wpm, with an engine that paces itself to the sentence.

Live: **https://arturitov.github.io/Fluent/**
Full product spec: [docs/SPEC.md](docs/SPEC.md)

## How it works

- **No App Store, no server.** A static React bundle on GitHub Pages talking
  straight to Supabase. Installable from Safari via *Share → Add to Home Screen*.
- **All parsing is client-side** — PDF, EPUB, DOCX and article extraction run
  in the browser, so documents never pass through a third party and the
  hosting bill stays at zero.
- **Data lives in Supabase** (free tier): Postgres for documents, positions,
  sessions and highlights, Auth for login, Row Level Security so a library is
  private to its owner.
- **Works offline** — the app shell is cached, reads come from a local mirror,
  and writes queue up and flush when the connection returns.

## Project layout

```
index.html                  App shell
src/main.tsx                Entry; service-worker registration + auto-reload
src/App.tsx                 Auth gate, hash router, shell
src/config.ts               Supabase URL + publishable key
src/lib/db.ts               Data layer — Supabase + local cache + offline queue
src/lib/tokenize.ts         Text → tokens → chunks; ORP index and pacing weights
src/lib/rsvp.ts             The RSVP engine (timing, ramping, sentence jumps)
src/lib/extract/            URL, PDF, EPUB, DOCX, TXT/MD, paste
src/components/Reader.tsx   The reading surface — gestures, peek, narration
src/components/Library.tsx  Grid, import bar, filters, drag-and-drop
src/styles.css              One stylesheet, CSS custom properties, three themes
public/sw.js                Service worker — offline shell, self-updating
public/manifest.webmanifest PWA manifest incl. share target
supabase/migrations/        Database schema + RLS
.github/workflows/          Pages deploy · database migration
```

## Setup (once)

1. **Supabase**: create a free project → put the Project URL and publishable
   key in `src/config.ts` → apply `supabase/migrations/0001_init.sql` (paste
   into the SQL Editor, or add `SUPABASE_DB_PASSWORD` as a repo secret and run
   the `db-migrate` workflow). Enable the Email auth provider.
2. **Hosting**: Settings → Pages → Source: **GitHub Actions**. Pushing `main`
   deploys.
3. **Install on phones**: open the Pages URL in Safari → Share →
   *Add to Home Screen*.

## Development

```bash
npm install
npm run dev          # vite dev server
npm run build        # type-check, then bundle to dist/
```

To develop against a local backend: `npx supabase start`, then set
`fluent.supabaseUrl` / `fluent.supabaseKey` in localStorage — see
[docs/TESTING.md](docs/TESTING.md).

## Keyboard and gestures

Space play/pause · ← → jump a sentence · ↑ ↓ speed ±25 · F fullscreen ·
Esc back · ⌘K command bar · / search.
On touch: tap to play/pause, swipe horizontally for sentences, vertically for
speed. Pausing opens the context peek — tap a word to jump there.

## Roadmap

- **Phase 1 (done):** import anything, RSVP engine with ORP and adaptive
  pacing, context peek, narration, library, stats, sync, PWA, themes.
- **Phase 2:** browser extension, email-to-app, RSS/OPML bulk import.
- **Phase 3:** highlights, comprehension check-ins, OCR for scanned PDFs,
  weekly digest.

## For AI agents (and future us)

- **[AGENTS.md](AGENTS.md)** — how we work: golden rules, architecture map,
  house style, definition of done
- **[CLAUDE.md](CLAUDE.md)** — quick facts for Claude sessions
- **[docs/TESTING.md](docs/TESTING.md)** — the e2e playbook (local stack,
  proxy/TLS quirks, service-worker caveat, synthetic-click traps)
- **[docs/OPERATIONS.md](docs/OPERATIONS.md)** — database access, test-data
  cleanup recipes, deploy verification
- **[docs/SPEC.md](docs/SPEC.md)** — the product spec

## Deploying updates

Push to `main`; the Pages workflow builds and deploys in about two minutes.

Any change to app shell files must bump `SHELL_CACHE` in `public/sw.js`
(v4 → v5 → …). That triggers the auto-update flow: installed phones detect the
new service worker on next launch, install fresh files, and reload once
automatically. Confirm the live bundle hash actually changed before calling a
fix shipped — the Pages CDN caches `index.html` for 10 minutes.
