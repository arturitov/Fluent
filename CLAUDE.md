# CLAUDE.md

Read **[AGENTS.md](AGENTS.md)** first — it is the canonical "how we work"
document for this repo (golden rules, architecture map, house style,
definition of done). This file only adds the quick facts an agent needs
instantly.

## Quick facts

- **App:** Fluent — RSVP speed reader. Save a link, PDF, EPUB, DOCX or
  pasted text; read it one word at a time at 300–1200 wpm.
- **Live:** https://arturitov.github.io/Fluent/
- **Stack:** React + Vite → GitHub Pages (static). Supabase for auth,
  Postgres, RLS. No server anywhere.
- **Build:** `npm run build` (type-checks, then bundles). Push `main` →
  Pages deploys in ~2 min via `.github/workflows/deploy.yml`.
- **Backend:** URL + publishable key in `src/config.ts`. Admin
  `sb_secret_...` key: ask Arturo, never commit it — the repo is public.
- **Schema:** change ONLY via `supabase/migrations/`; apply with the
  `db-migrate` workflow (needs the `SUPABASE_DB_PASSWORD` repo secret).
- **Deploys:** bump `SHELL_CACHE` in `public/sw.js` or phones keep old code.
- **Testing:** Playwright. Full playbook in [docs/TESTING.md](docs/TESTING.md)
  (local Supabase stack, proxy/TLS quirks, service-worker caveat).
- **Data poking & cleanup recipes:** [docs/OPERATIONS.md](docs/OPERATIONS.md)
- **Product spec:** [docs/SPEC.md](docs/SPEC.md)

## The three rules most likely to bite you

1. **His library is real data.** Never bulk-delete from `positions`,
   `reading_sessions`, `documents` or `highlights`. Create rows suffixed
   `TEST`, delete exactly those. (This has gone wrong once — see AGENTS.md.)
2. **A tap fires touch *and* click.** Anything clickable on the reading
   surface must respect `isSyntheticClick()` in `Reader.tsx`. Two bugs so far.
3. **Don't trust a green build as proof of a fix.** Check the live URL and
   confirm the bundle hash changed before reporting.

## Working with Arturo

Ship whole features: research → implement → e2e-test → clean up → push →
report honestly (including what couldn't be verified). He reads results on
his phone; screenshots beat prose. When he reports a bug, reproduce it
before fixing it. When something can't be done well the easy way, present
the trade-off and recommend — he decides fast.
