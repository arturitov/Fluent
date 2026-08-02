# Testing

All suites run against a local Supabase stack (`npx supabase start`) with the
production build served by `npx vite preview`. Set the port to match.

| Suite | Covers |
|---|---|
| `node e2e.mjs` | signup → seed → URL/PDF/paste import → RSVP playback → peek → resume → stats → ⌘K → themes → mobile viewport |
| `node taptest.mjs` | mobile gestures: single tap, double tap, peek dismissal, swipe-to-speed |
| `node wpmtest.mjs` | reading speed and peek behaviour stay correct across repeated sessions |
| `node verify-sw.mjs` | service worker serves a fresh build over a stale cache, and still boots offline |
| `node verify-live.mjs` | the deployed GitHub Pages site against production Supabase |

Note: service workers cannot register through a TLS-intercepting proxy, so
`verify-sw.mjs` runs on `127.0.0.1` (a secure context) rather than the public URL.
