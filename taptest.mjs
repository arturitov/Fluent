/** Mobile gesture regression test: a tap must toggle exactly once. */
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
await c.addInitScript(([u, k]) => {
  localStorage.setItem('fluent.supabaseUrl', u)
  localStorage.setItem('fluent.supabaseKey', k)
}, ['http://127.0.0.1:54321', 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'])
const p = await c.newPage()
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
let fails = 0
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg)
  if (!cond) fails++
}

await p.goto('http://127.0.0.1:4181/')
await p.waitForSelector('.auth-card')
await p.click('.auth-switch button')
await p.fill('input[type=email]', `tap${Date.now()}@f.dev`)
await p.fill('input[type=password]', 'tappassword123')
await p.click('button[type=submit]')
await p.waitForSelector('text=Welcome to Fluent', { timeout: 30000 })
await p.click('text=Welcome to Fluent')
await p.waitForSelector('.rsvp-word')

const wpmStart = (await p.textContent('.wpm-value')).trim()
const w0 = await p.textContent('.rsvp-word')
await p.tap('.reader-stage')
await p.waitForTimeout(1600)
const w1 = await p.textContent('.rsvp-word')
check(!(await p.$('.peek')) && w0 !== w1, `one tap starts playback (${JSON.stringify(w0)} → ${JSON.stringify(w1)})`)

await p.tap('.reader-stage')
await p.waitForTimeout(900)
check(!!(await p.$('.peek')), 'second tap pauses and opens context peek')
const wPaused = await p.textContent('.rsvp-word')
await p.waitForTimeout(900)
check((await p.textContent('.rsvp-word')) === wPaused, 'stays paused (word does not advance)')

// tap the backdrop → resumes
await p.touchscreen.tap(195, 120)
await p.waitForTimeout(1300)
check(!(await p.$('.peek')), 'tap on peek backdrop dismisses it')
check((await p.textContent('.rsvp-word')) !== wPaused, 'and resumes playback')

// wpm must be untouched by plain taps
check((await p.textContent('.wpm-value')).trim() === wpmStart, `taps do not change speed (still ${wpmStart} wpm)`)

// deliberate vertical swipe changes speed exactly one step
await p.tap('.reader-stage')
await p.waitForTimeout(500)
if (await p.$('.peek')) await p.touchscreen.tap(195, 120)
await p.waitForTimeout(600)
const before = Number((await p.textContent('.wpm-value')).trim())
await p.touchscreen.tap(195, 400) // pause first
await p.waitForTimeout(400)
const box = await p.locator('.reader-stage').boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
await p.touchscreen.tap(cx, cy) // dismiss any peek
await p.waitForTimeout(400)
await p.evaluate(
  ([x, y]) => {
    const el = document.querySelector('.reader-stage')
    const mk = (type, cy2) => {
      const touch = new Touch({ identifier: 1, target: el, clientX: x, clientY: cy2 })
      return new TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: type === 'touchend' ? [] : [touch],
        targetTouches: type === 'touchend' ? [] : [touch],
        changedTouches: [touch],
      })
    }
    el.dispatchEvent(mk('touchstart', y))
    el.dispatchEvent(mk('touchend', y + 120)) // swipe down
  },
  [cx, cy],
)
await p.waitForTimeout(500)
const after = Number((await p.textContent('.wpm-value')).trim())
check(after === before - 25, `downward swipe lowers speed one step (${before} → ${after})`)

console.log(fails === 0 ? '\nALL MOBILE GESTURE TESTS PASSED' : `\n${fails} FAILURE(S)`)
process.exitCode = fails ? 1 : 0
await b.close()
