/** Does the saved reading speed stay put across sessions? */
import { chromium } from 'playwright'
const PORT = process.env.PORT || '4182'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await c.addInitScript(([u, k]) => {
  localStorage.setItem('fluent.supabaseUrl', u)
  localStorage.setItem('fluent.supabaseKey', k)
}, ['http://127.0.0.1:54321', 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'])
const p = await c.newPage()
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
let fails = 0
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fails++ }

await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('.auth-card')
await p.click('.auth-switch button')
await p.fill('input[type=email]', `wpm${Date.now()}@f.dev`)
await p.fill('input[type=password]', 'wpmpassword123')
await p.click('button[type=submit]')
await p.waitForSelector('text=Welcome to Fluent', { timeout: 30000 })

const openAndRead = async (label, seconds) => {
  await p.click('text=Welcome to Fluent')
  await p.waitForSelector('.rsvp-word', { timeout: 15000 })
  const before = (await p.textContent('.wpm-value')).trim()
  await p.tap('.reader-stage')
  await p.waitForTimeout(seconds * 1000)
  await p.tap('.reader-stage') // pause → peek
  await p.waitForTimeout(700)
  const peekOpen = !!(await p.$('.peek'))
  const after = (await p.textContent('.wpm-value')).trim()
  console.log(`  ${label}: wpm ${before} → ${after}, peek stayed open: ${peekOpen}`)
  await p.click('.reader-top .btn') // back to library
  await p.waitForSelector('.import-bar', { timeout: 10000 })
  await p.waitForTimeout(1200)
  return { before, after, peekOpen }
}

const s1 = await openAndRead('session 1', 4)
check(s1.peekOpen, 'tap-to-pause opens context peek and it stays open')
check(s1.before === s1.after, 'speed unchanged within a session')
const s2 = await openAndRead('session 2', 4)
check(s2.before === s1.after, `speed persists across sessions (${s1.after} → ${s2.before})`)
const s3 = await openAndRead('session 3', 4)
check(s3.before === s2.after, `speed still stable on a third session (${s2.after} → ${s3.before})`)

console.log(fails === 0 ? '\nALL SPEED-PERSISTENCE TESTS PASSED' : `\n${fails} FAILURE(S)`)
process.exitCode = fails ? 1 : 0
await b.close()
