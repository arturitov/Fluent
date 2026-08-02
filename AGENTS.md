# How we work on Fluent

Canonical working agreement for this repo. [CLAUDE.md](CLAUDE.md) is the
quick-facts card; this is the reasoning behind it.

## Golden rules

1. **The production database holds real reading.** Arturo reads on this app.
   Never bulk-delete from `positions`, `reading_sessions`, `documents`, or
   `highlights`. Tests create their own rows, named with a `TEST` suffix in
   caps, and delete exactly those rows afterward. Recipes live in
   [docs/OPERATIONS.md](docs/OPERATIONS.md).
   *(This rule exists because a `DELETE ... ?word_index=gte.0` once wiped his
   real reading positions and stats. The documents survived; the progress
   didn't.)*
2. **Schema changes only via `supabase/migrations/`.** Never hand-edit tables
   in the dashboard — the migration file is the source of truth, and
   `.github/workflows/db-migrate.yml` applies it.
3. **Never commit `sb_secret_...`.** The repo is public. The publishable key
   in `src/config.ts` is safe to ship — Row Level Security is what protects
   the data, and every table has it.
4. **Bump `SHELL_CACHE` in `public/sw.js` on any app-shell change.** Installed
   phones otherwise keep running old code. The worker also self-updates on
   launch, but the bump is what guarantees a clean install.
5. **Reproduce before fixing.** A bug report gets a failing test first, then
   the fix. Every bug fixed so far had a non-obvious root cause that guessing
   would have missed.
6. **Verify against the real thing.** Local Supabase for the fast loop, the
   live GitHub Pages URL + production Supabase before calling it done.

## Architecture map

Static React SPA on GitHub Pages talking straight to Supabase. No server.

```
src/main.tsx              Entry; service-worker registration + auto-reload
src/App.tsx               Auth gate, hash router (#/ , #/read/:id , #/stats), shell
src/config.ts             Supabase URL + publishable key (localStorage override for tests)

src/lib/supabase.ts       Client singleton
src/lib/db.ts             ALL data access. localStorage mirror + offline write queue
src/lib/types.ts          Doc / Position / ReadingSession / Settings
src/lib/tokenize.ts       Text → tokens → chunks; ORP index + pacing weights
src/lib/rsvp.ts           RsvpEngine: timer chain, ramping, sentence jumps
src/lib/settings.ts       User settings in localStorage + theme application
src/lib/stats.ts          Session aggregation, streaks, formatting
src/lib/sample.ts         The welcome document seeded on first run
src/lib/extract/url.ts    Article extraction: direct fetch → CORS relays → reader fallback
src/lib/extract/files.ts  PDF (pdf.js), EPUB (JSZip), DOCX (mammoth), TXT/MD, paste

src/components/Reader.tsx      The product. RSVP surface, gestures, peek, TTS
src/components/Library.tsx     Grid, import bar, filters, drag-and-drop, share target
src/components/StatsPage.tsx   Tiles + two SVG charts
src/components/CommandBar.tsx  ⌘K fuzzy jump
src/components/{AuthScreen,SettingsModal,ImportModal,Toast,icons}.tsx

public/sw.js              Service worker. Network-first shell, cache-first hashed assets
supabase/migrations/      Schema + RLS + grants
.github/workflows/        deploy.yml (Pages on push) · db-migrate.yml (manual)
```

## House style

- TypeScript, strict. React function components, hooks, no state library —
  the app is small enough that `useState` + the data layer is the whole story.
- One stylesheet (`src/styles.css`) driven by CSS custom properties. Themes
  are `[data-theme]` on `<html>`; never hardcode a colour in a component.
- All Supabase access goes through `src/lib/db.ts`. Components never import
  the client directly (auth in `App.tsx` is the single exception).
- The data layer is offline-tolerant by design: read from cache, write
  through, queue failed writes in `LS_PENDING` and flush on reconnect. Keep
  new mutations consistent with that.
- Touch and mouse both fire on a tap. Anything clickable on the reading
  surface must respect the `isSyntheticClick()` guard in `Reader.tsx` — this
  has caused two separate bugs already.
- Keep the reading surface free of chrome. If a feature needs UI, it goes in
  settings, the command bar, or the control row.

## Definition of done

A change is done when all of these are true:

- `npm run build` passes (it type-checks first).
- The relevant suite passes locally — see [docs/TESTING.md](docs/TESTING.md).
  A new interaction gets a new test; a fixed bug gets a regression test.
- `SHELL_CACHE` bumped if any shell file changed.
- Test data cleaned up, verified by querying the table afterward.
- Pushed to `main`, the Pages workflow went green, and the live URL was
  checked — not assumed.
- Reported with screenshots and an honest note about anything unverified.

## Reporting

Arturo reads on his phone. Lead with what changed for the user and a
screenshot; put mechanics second. Say plainly what could not be verified and
why. If a trade-off was made, name it and recommend a side.
