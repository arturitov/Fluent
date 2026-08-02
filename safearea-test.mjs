/** Installed-PWA safe-area regression test.
 *
 *  Playwright can't produce real iOS safe-area insets, but the app reads them
 *  through --safe-* custom properties, so we simulate an iPhone Dynamic Island
 *  (59px top, 34px bottom) by overriding those and assert that no interactive
 *  element sits inside the status-bar or home-indicator zones. */
import { chromium } from 'playwright'

const PORT = process.env.PORT || '4182'
const TOP = 59
const BOTTOM = 34
let fails = 0
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg)
  if (!cond) fails++
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const c = await b.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true })
await c.addInitScript(([u, k, top, bottom]) => {
  localStorage.setItem('fluent.supabaseUrl', u)
  localStorage.setItem('fluent.supabaseKey', k)
  const s = document.createElement('style')
  s.textContent = `:root { --safe-top: ${top}px !important; --safe-bottom: ${bottom}px !important; }`
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s))
}, ['http://127.0.0.1:54321', 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', TOP, BOTTOM])
const p = await c.newPage()
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

const topOf = async (sel) => (await p.locator(sel).first().boundingBox())?.y ?? -1
const bottomOf = async (sel) => {
  const bb = await p.locator(sel).first().boundingBox()
  return bb ? bb.y + bb.height : -1
}

// ---- auth screen ----
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('.auth-card', { timeout: 20000 })
check((await topOf('.auth-card')) >= TOP, 'auth card clears the status bar')

// ---- library ----
await p.click('.auth-switch button')
await p.fill('input[type=email]', `safe${Date.now()}@f.dev`)
await p.fill('input[type=password]', 'safepassword123')
await p.click('button[type=submit]')
await p.waitForSelector('text=Welcome to Fluent', { timeout: 30000 })
check((await topOf('.brand')) >= TOP, `library logo below the notch (y=${await topOf('.brand')})`)
check((await topOf('button[title=Settings]')) >= TOP, 'settings button below the notch')
check((await topOf('button[title=Stats]')) >= TOP, 'stats button below the notch')
await p.screenshot({ path: '/tmp/shots/safearea-library.png' })

// sticky header must still clear the notch after scrolling
await p.evaluate(() => window.scrollTo(0, 400))
await p.waitForTimeout(300)
check((await topOf('.brand')) >= TOP, 'sticky header still clear after scrolling')
await p.evaluate(() => window.scrollTo(0, 0))

// ---- reader ----
await p.click('text=Welcome to Fluent')
await p.waitForSelector('.rsvp-word', { timeout: 15000 })
const backY = await topOf('.reader-top .btn')
check(backY >= TOP, `reader back button below the notch (y=${backY})`)
const progressY = await topOf('.reader-progress-track')
check(Math.abs(progressY - TOP) <= 1, `progress bar sits at the safe-area edge (y=${progressY})`)
const playBottom = await bottomOf('.ctrl-btn.big')
check(playBottom <= 852 - BOTTOM + 2, `play button clears the home indicator (bottom=${Math.round(playBottom)})`)
await p.screenshot({ path: '/tmp/shots/safearea-reader.png' })

// ---- settings modal ----
await p.keyboard.press('Escape')
await p.waitForSelector('.import-bar', { timeout: 10000 })
await p.click('button[title=Settings]')
await p.waitForSelector('.modal', { timeout: 5000 })
check((await topOf('.modal')) >= TOP, 'settings modal clears the status bar')
await p.keyboard.press('Escape')
await p.waitForSelector('.modal', { state: 'detached', timeout: 5000 })
check(true, 'Escape closes the settings modal')

// ---- stats ----
await p.click('button[title=Stats]')
await p.waitForSelector('.stat-tile', { timeout: 10000 })
check((await topOf('.topbar .btn')) >= TOP, 'stats back button below the notch')

console.log(fails === 0 ? '\nALL SAFE-AREA CHECKS PASSED' : `\n${fails} FAILURE(S)`)
process.exitCode = fails ? 1 : 0
await b.close()
