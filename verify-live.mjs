/** Live end-to-end check against the deployed GitHub Pages site + production Supabase.
 *  Service-worker behaviour is covered separately by verify-sw.mjs, because SWs
 *  cannot register through a TLS-intercepting proxy. */
import { chromium } from 'playwright'

const APP = 'https://arturitov.github.io/Fluent/'
const EMAIL = process.env.PROD_EMAIL
const PASS = process.env.PROD_PASS
let fails = 0
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg)
  if (!cond) fails++
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

await page.goto(APP, { timeout: 30000 })
await page.waitForSelector('.auth-demo-word', { timeout: 20000 })
check(true, 'live sign-in screen renders with the RSVP demo')
check((await page.textContent('.auth-tagline')) === 'Save anything. Read it faster.', 'tagline is clean (no duplicated word)')
const drift = await page.evaluate(() => {
  const s = document.querySelector('.auth-demo-stage').getBoundingClientRect()
  const o = document.querySelector('.auth-demo-word .orp').getBoundingClientRect()
  return Math.abs(o.left + o.width / 2 - (s.left + s.width / 2))
})
check(drift < 1, `demo ORP letter pinned to centre (${drift.toFixed(1)}px drift)`)
await page.screenshot({ path: '/tmp/shots/17-live-mobile-auth.png' })

if (EMAIL && PASS) {
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASS)
  await page.click('button[type=submit]')
  await page.waitForSelector('.import-bar', { timeout: 30000 })
  check(true, 'sign-in against production Supabase')
  await page.waitForSelector('text=Welcome to Fluent', { timeout: 20000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/shots/18-live-mobile-library.png' })

  await page.click('text=Welcome to Fluent')
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

  // position must survive a fresh sign-in on another device
  await page.click('.reader-top .btn')
  await page.waitForSelector('.import-bar', { timeout: 10000 })
  await page.waitForTimeout(1800)
  const pctLibrary = await page.textContent('.doc-meta')
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true })
  const p2 = await ctx2.newPage()
  await p2.goto(APP, { timeout: 30000 })
  await p2.waitForSelector('.auth-card', { timeout: 20000 })
  await p2.fill('input[type=email]', EMAIL)
  await p2.fill('input[type=password]', PASS)
  await p2.click('button[type=submit]')
  await p2.waitForSelector('text=Welcome to Fluent', { timeout: 30000 })
  await p2.click('text=Welcome to Fluent')
  await p2.waitForSelector('.rsvp-word', { timeout: 15000 })
  const pct = await p2.textContent('.reader-top div:last-child')
  const pctNum = Number((pct ?? '').match(/(\d+)%/)?.[1] ?? 0)
  check(pctNum > 0, `position synced to a second device (${pct?.trim()}, library showed ${pctLibrary?.trim()})`)
  await p2.screenshot({ path: '/tmp/shots/21-live-desktop-resume.png' })
}

console.log(fails === 0 ? '\nALL LIVE CHECKS PASSED' : `\n${fails} FAILURE(S)`)
process.exitCode = fails ? 1 : 0
await browser.close()
