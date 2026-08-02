# Testing

Playwright, run from the repo root. Every suite drives the real UI; none of
them mock the data layer.

## The suites

| Suite | Backend | Covers |
|---|---|---|
| `node e2e.mjs` | local | signup → seed → URL/PDF/paste import → playback → peek → resume → stats → ⌘K → themes → mobile viewport |
| `node taptest.mjs` | local | mobile gestures: single tap, double tap, peek dismissal, swipe-to-speed |
| `node wpmtest.mjs` | local | speed and peek behaviour stay correct across repeated sessions |
| `node menutest.mjs` | local | library card menu opens, is on top, and its actions work |
| `node orp-app-test.mjs` | local | ORP letter contiguity + centering on problem words, Chromium AND WebKit |
| `node safearea-test.mjs` | local | installed-PWA safe areas: simulated notch/home-indicator, all screens |
| `node verify-sw.mjs` | none | service worker beats a poisoned cache, still boots offline |
| `node verify-live.mjs` | **production** | the deployed site end to end, incl. cross-device resume |

## Local setup

```bash
npx supabase start                    # Postgres + Auth + REST on :54321
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -f supabase/migrations/0001_init.sql
npm run build && npx vite preview --port 4181 --strictPort
```

Suites point at `127.0.0.1:4181`; change the port constant at the top of each
file if you use another. They inject the local Supabase credentials through
`localStorage` before the app boots:

```js
await ctx.addInitScript(([u, k]) => {
  localStorage.setItem('fluent.supabaseUrl', u)
  localStorage.setItem('fluent.supabaseKey', k)
}, ['http://127.0.0.1:54321', '<local publishable key from supabase start>'])
```

`src/config.ts` reads those overrides first, which is the only reason tests
can run against a different backend than the shipped one. Keep that hook.

The URL-import test needs a CORS-enabled page to fetch: a static server on
`127.0.0.1:8899` serving a small article with
`Access-Control-Allow-Origin: *`.

## Test data discipline

Non-negotiable, because production is Arturo's real library:

- Local suites create a **fresh signup per run** (`tap<timestamp>@f.dev`) —
  the cheapest isolation there is, and nothing to clean up.
- Anything created against production is titled with a `TEST` suffix in caps
  and deleted by that filter at the end of the run.
- Never delete with a filter that could match a real row. Cleanup recipes:
  [OPERATIONS.md](OPERATIONS.md).

## Environment quirks (Anthropic sandbox)

These cost real time to rediscover:

- **Chromium:** launch with `executablePath: '/opt/pw-browsers/chromium'` and
  `args: ['--no-sandbox', '--no-proxy-server']`. Without `--no-proxy-server`
  the egress proxy resets connections to github.io.
- **TLS:** the proxy intercepts HTTPS, so any context hitting the live URL
  needs `ignoreHTTPSErrors: true`.
- **Service workers cannot register through that interception** — the browser
  refuses the worker script on certificate error. So SW behaviour is tested on
  `http://127.0.0.1` (a secure context) in `verify-sw.mjs`, never against the
  live URL. Don't waste time debugging a "broken" SW on the public site here.
- **Playwright must be invoked from the directory where it is installed**
  (repo root). A script in `/tmp` will not resolve the module.
- **`curl` to GitHub's API** needs `--noproxy '*'`; the sandbox proxy only
  exposes repo-scoped endpoints and returns 502 otherwise.
- **WebKit for iOS-reported bugs:** `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD= PLAYWRIGHT_BROWSERS_PATH=$HOME/pw npx playwright install webkit`, then run tests with `PLAYWRIGHT_BROWSERS_PATH=$HOME/pw`. Chromium alone missed a WebKit-only layout bug (grid tracks not resizing on text change).
- **Postgres port 5432 is not directly reachable.** Migrations run through
  the `db-migrate` workflow instead — see [OPERATIONS.md](OPERATIONS.md).

## Writing a new interaction test

Two things the existing suites learned the hard way:

1. **Assert state, not just absence of error.** `peek stayed open: true` after
   a pause caught a bug that "no exception thrown" never would.
2. **Synthetic clicks are real.** A tap fires `touchstart → touchend → click`.
   When testing anything that renders an overlay on tap, assert the overlay is
   *still open* a second later — the first version of the peek closed itself
   in ~10 ms and every naive test passed.

To dispatch a swipe (Playwright's `touchscreen` only taps):

```js
await p.evaluate(([x, y]) => {
  const el = document.querySelector('.reader-stage')
  const mk = (type, cy) => {
    const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: cy })
    return new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [t],
      targetTouches: type === 'touchend' ? [] : [t],
      changedTouches: [t],
    })
  }
  el.dispatchEvent(mk('touchstart', y))
  el.dispatchEvent(mk('touchend', y + 120))   // swipe down → slower
}, [cx, cy])
```

## Before reporting a fix

```bash
npm run build && node e2e.mjs && node taptest.mjs && node wpmtest.mjs && node verify-sw.mjs
# push, wait for the workflow, confirm the live bundle hash changed, then:
PROD_EMAIL=... PROD_PASS=... node verify-live.mjs
```
