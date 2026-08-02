/**
 * Live end-to-end check: the deployed GitHub Pages site against production Supabase.
 *
 *   PROD_EMAIL=... PROD_PASS=... node verify-live.mjs
 *   SB_SECRET=sb_secret_...          # optional, for orphaned-session cleanup
 *
 * Data discipline (see AGENTS.md): this runs against Arturo's real library, so
 * it creates its own document titled with a TEST suffix, does every read test
 * on that, and deletes exactly that document afterwards. It never touches an
 * existing document's position or status.
 *
 * Service-worker behaviour is covered by verify-sw.mjs, not here — workers
 * cannot register through a TLS-intercepting proxy.
 */
import { chromium } from 'playwright'

const APP = 'https://arturitov.github.io/Fluent/'
const EMAIL = process.env.PROD_EMAIL
const PASS = process.env.PROD_PASS
const SB_SECRET = process.env.SB_SECRET
const SB_URL = 'https://hrsblcjekgtncappdexx.supabase.co'
const TEST_TITLE = 'FLUENT E2E TEST'

let fails = 0
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg)
  if (!cond) fails++
}

const TEST_BODY = `${TEST_TITLE}

This document exists only so the end to end suite has something of its own to
read. It is created at the start of the run and deleted at the end, so that no
real reading position or session history is ever disturbed.

Reading is the closest thing we have to a superpower, and yet most of us do it
the same way we did in the fourth grade. The average adult reads about two
hundred and thirty words per minute, a pace set not by comprehension but by
habit.

Rapid serial visual presentation removes the eye movement entirely. Words
appear one at a time at a fixed point, and the reader simply keeps their eyes
still. With modest practice, readers can comfortably double their pace on
suitable material without measurable loss of comprehension.`

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--no-proxy-server'],
})
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  ignoreHTTPSErrors: true,
  hasTouch: true,
  isMobile: true,
})
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

let created = false
try {
  // ---- sign-in screen ----
  await page.goto(APP, { timeout: 30000 })
  await page.waitForSelector('.auth-demo-word', { timeout: 20000 })
  check(true, 'live sign-in screen renders with the RSVP demo')
  check((await page.textContent('.auth-tagline')) === 'Save anything. Read it faster.', 'tagline is clean')
  const drift = await page.evaluate(() => {
    const s = document.querySelector('.auth-demo-stage').getBoundingClientRect()
    const o = document.querySelector('.auth-demo-word .orp').getBoundingClientRect()
    return Math.abs(o.left + o.width / 2 - (s.left + s.width / 2))
  })
  check(drift < 1, `demo ORP letter pinned to centre (${drift.toFixed(1)}px drift)`)
  await page.screenshot({ path: '/tmp/shots/17-live-mobile-auth.png' })

  if (!EMAIL || !PASS) {
    console.log('\nPROD_EMAIL / PROD_PASS not set — stopping after the public checks.')
    process.exitCode = fails ? 1 : 0
    await browser.close()
    process.exit()
  }

  // ---- sign in ----
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASS)
  await page.click('button[type=submit]')
  await page.waitForSelector('.import-bar', { timeout: 30000 })
  check(true, 'sign-in against production Supabase')
  await page.screenshot({ path: '/tmp/shots/18-live-mobile-library.png' })

  // ---- create our own document to read ----
  await page.click('text=Paste text')
  await page.fill('.modal input', TEST_TITLE)
  await page.fill('.modal textarea', TEST_BODY)
  await page.click('.modal .btn.primary')
  await page.waitForSelector(`.doc-card >> text=${TEST_TITLE}`, { timeout: 20000 })
  created = true
  check(true, `created test document "${TEST_TITLE}"`)

  // ---- read it ----
  await page.click(`text=${TEST_TITLE}`)
  await page.waitForSelector('.rsvp-word', { timeout: 15000 })
  const w0 = await page.textContent('.rsvp-word')
  const wpm0 = (await page.textContent('.wpm-value')).trim()

  await page.tap('.reader-stage')
  await page.waitForTimeout(3000)
  const w1 = await page.textContent('.rsvp-word')
  check(w0 !== w1 && !(await page.$('.peek')), `one tap starts reading (${JSON.stringify(w0)} → ${JSON.stringify(w1)})`)
  await page.screenshot({ path: '/tmp/shots/19-live-mobile-reader.png' })

  await page.tap('.reader-stage')
  await page.waitForTimeout(1000)
  check(!!(await page.$('.peek')), 'second tap pauses and holds the context peek open')
  const wPaused = await page.textContent('.rsvp-word')
  await page.waitForTimeout(1000)
  check((await page.textContent('.rsvp-word')) === wPaused, 'stays paused')
  check((await page.textContent('.wpm-value')).trim() === wpm0, `speed untouched by taps (${wpm0} wpm)`)
  await page.screenshot({ path: '/tmp/shots/20-live-mobile-peek.png' })

  await page.touchscreen.tap(195, 110)
  await page.waitForTimeout(1300)
  check(!(await page.$('.peek')), 'tap dismisses the peek')
  check((await page.textContent('.rsvp-word')) !== wPaused, 'and reading resumes')

  await page.click('.reader-top .btn')
  await page.waitForSelector('.import-bar', { timeout: 10000 })
  await page.waitForTimeout(1800)

  // ---- position syncs to a second device ----
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true })
  const p2 = await ctx2.newPage()
  await p2.goto(APP, { timeout: 30000 })
  await p2.waitForSelector('.auth-card', { timeout: 20000 })
  await p2.fill('input[type=email]', EMAIL)
  await p2.fill('input[type=password]', PASS)
  await p2.click('button[type=submit]')
  await p2.waitForSelector(`text=${TEST_TITLE}`, { timeout: 30000 })
  await p2.click(`text=${TEST_TITLE}`)
  await p2.waitForSelector('.rsvp-word', { timeout: 15000 })
  const pct = (await p2.textContent('.reader-top div:last-child')) ?? ''
  check(Number(pct.match(/(\d+)%/)?.[1] ?? 0) > 0, `position synced to a second device (${pct.trim()})`)
  await p2.screenshot({ path: '/tmp/shots/21-live-desktop-resume.png' })
  await p2.click('.reader-top .btn')
  await ctx2.close()
} catch (e) {
  check(false, `flow threw: ${e.message}`)
  await page.screenshot({ path: '/tmp/shots/99-live-failure.png' }).catch(() => {})
}

// ---- cleanup: delete exactly what we created ----
if (created) {
  try {
    await page.goto(APP, { timeout: 30000 })
    await page.waitForSelector('.import-bar', { timeout: 30000 })
    const card = page.locator('.doc-card', { hasText: TEST_TITLE }).first()
    await card.locator('.doc-menu-btn').click()
    await page.click('.menu button.danger')
    await page.waitForTimeout(1500)
    const gone = (await page.locator('.doc-card', { hasText: TEST_TITLE }).count()) === 0
    check(gone, 'test document deleted from the library')
  } catch (e) {
    check(false, `CLEANUP FAILED — delete "${TEST_TITLE}" by hand: ${e.message}`)
  }
}

// Sessions keep a null document_id after the cascade; clear only those orphans.
if (SB_SECRET) {
  const res = await fetch(`${SB_URL}/rest/v1/reading_sessions?document_id=is.null`, {
    method: 'DELETE',
    headers: { apikey: SB_SECRET, Authorization: `Bearer ${SB_SECRET}` },
  })
  check(res.ok, `orphaned test sessions cleared (HTTP ${res.status})`)
} else {
  console.log('NOTE  SB_SECRET not set — a session row with a null document_id may remain.')
}

console.log(fails === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${fails} FAILURE(S)`)
process.exitCode = fails ? 1 : 0
await browser.close()
