/** Cloud → device-only migration: sign in, build a small cloud library, hit
 *  "Go device-only", then prove the library survives with Supabase blocked. */
import { chromium } from 'playwright'

const PORT = process.env.PORT || '4182'
let fails = 0
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg)
  if (!cond) fails++
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await c.addInitScript(([u, k]) => {
  localStorage.setItem('fluent.supabaseUrl', u)
  localStorage.setItem('fluent.supabaseKey', k)
}, ['http://127.0.0.1:54321', 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'])
const p = await c.newPage()
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

// cloud account with a doc + a reading position
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('.auth-card')
await p.click('.auth-switch button')
await p.fill('input[type=email]', `mig${Date.now()}@f.dev`)
await p.fill('input[type=password]', 'migpassword123')
await p.click('button[type=submit]')
await p.waitForSelector('text=Welcome to Fluent', { timeout: 30000 })
await p.click('text=Paste text')
await p.fill('.modal input', 'MIGRATION TEST')
await p.fill('.modal textarea', 'MIGRATION TEST. This document starts life in the cloud and must arrive intact on the device, together with the reading position that follows this sentence around wherever it goes.')
await p.click('.modal .btn.primary')
await p.waitForSelector('.doc-card >> text=MIGRATION TEST', { timeout: 15000 })
await p.click('text=MIGRATION TEST')
await p.waitForSelector('.rsvp-word', { timeout: 15000 })
await p.tap('.reader-stage')
await p.waitForTimeout(3500)
await p.tap('.reader-stage')
await p.waitForTimeout(600)
await p.click('.reader-top .btn')
await p.waitForSelector('.import-bar', { timeout: 10000 })
await p.waitForTimeout(1200)
check(true, 'cloud library prepared (doc + position)')

// switch to device-only
await p.click('button[title=Settings]')
await p.waitForSelector('.modal', { timeout: 5000 })
await p.click('text=Go device-only')
await p.waitForSelector('.import-bar', { timeout: 20000 })
await p.waitForSelector('.doc-card >> text=MIGRATION TEST', { timeout: 15000 })
check(true, 'switch copied the cloud library to the device')

// from here on, no backend
let calls = 0
await c.route(/127\.0\.0\.1:54321/, (r) => {
  calls++
  r.abort()
})
await p.reload()
await p.waitForSelector('.doc-card >> text=MIGRATION TEST', { timeout: 15000 })
const meta = await p.locator('.doc-card', { hasText: 'MIGRATION TEST' }).locator('.doc-meta').textContent()
check(/%/.test(meta ?? ''), `doc AND position survive with backend blocked (${JSON.stringify(meta?.trim())})`)
await p.waitForSelector('text=Welcome to Fluent', { timeout: 10000 })
check(true, 'welcome guide migrated too')
await p.click('text=MIGRATION TEST')
await p.waitForSelector('.rsvp-word', { timeout: 15000 })
const pct = await p.textContent('.reader-top div:last-child')
check(Number((pct ?? '').match(/(\d+)%/)?.[1] ?? 0) > 0, `reader resumes mid-document offline (${pct?.trim()})`)
console.log(`   (backend calls after switch: ${calls}, all aborted)`)

console.log(fails === 0 ? '\nALL MIGRATION CHECKS PASSED' : `\n${fails} FAILURE(S)`)
process.exitCode = fails ? 1 : 0
await b.close()
