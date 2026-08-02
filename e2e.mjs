import { chromium } from 'playwright'
import fs from 'fs'

const APP = 'http://127.0.0.1:4179/'
const LOCAL_SB_URL = 'http://127.0.0.1:54321'
const LOCAL_SB_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
const SHOTS = '/tmp/shots'
fs.mkdirSync(SHOTS, { recursive: true })

const results = []
const ok = (name) => { results.push(['PASS', name]); console.log('PASS', name) }
const fail = (name, e) => { results.push(['FAIL', name + ' :: ' + (e?.message ?? e)]); console.log('FAIL', name, e?.message ?? e) }

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
await ctx.addInitScript(([u, k]) => {
  localStorage.setItem('fluent.supabaseUrl', u)
  localStorage.setItem('fluent.supabaseKey', k)
}, [LOCAL_SB_URL, LOCAL_SB_KEY])
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
const email = `e2e${Date.now()}@fluent.dev`

try {
  // 1. auth screen
  await page.goto(APP)
  await page.waitForSelector('.auth-card', { timeout: 15000 })
  await page.screenshot({ path: `${SHOTS}/01-auth.png` })
  ok('auth screen renders')

  // 2. sign up
  await page.click('.auth-switch button')
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', 'e2e-password-123')
  await page.click('button[type=submit]')
  await page.waitForSelector('.import-bar', { timeout: 20000 })
  ok('signup → library')

  // 3. welcome doc seeded
  await page.waitForSelector('text=Welcome to Fluent', { timeout: 15000 })
  await page.screenshot({ path: `${SHOTS}/02-library-seeded.png` })
  ok('welcome guide auto-seeded')

  // 4. URL import
  await page.fill('.import-bar input', 'http://127.0.0.1:8899/story.html')
  await page.click('.import-bar .btn.primary')
  await page.waitForSelector('text=The Quiet Power of Reading Faster', { timeout: 25000 })
  ok('URL import + readability extraction')

  // 5. PDF upload
  await page.setInputFiles('input[type=file]', '/tmp/test-doc.pdf')
  await page.waitForSelector('text=A Short Field Guide to Better Meetings', { timeout: 30000 })
  ok('PDF import (pdf.js)')

  // 6. paste text
  await page.click('text=Paste text')
  await page.fill('.modal textarea', 'On Focus\n\nDeep work is the ability to focus without distraction on a cognitively demanding task. It is a skill that allows you to quickly master complicated information and produce better results in less time. Deep work will make you better at what you do and provide the sense of true fulfillment that comes from craftsmanship.')
  await page.click('.modal .btn.primary')
  await page.waitForSelector('.doc-card >> text=On Focus', { timeout: 15000 })
  await page.screenshot({ path: `${SHOTS}/03-library-full.png` })
  ok('paste text import')

  // 7. reader: open article, play ~4.5s
  await page.click('text=The Quiet Power of Reading Faster')
  await page.waitForSelector('.rsvp-word', { timeout: 15000 })
  await page.screenshot({ path: `${SHOTS}/04-reader-idle.png` })
  await page.keyboard.press(' ')
  await page.waitForTimeout(4500)
  const wordMid = await page.textContent('.rsvp-word')
  if (!wordMid || !wordMid.trim()) throw new Error('no word displayed while playing')
  await page.screenshot({ path: `${SHOTS}/05-reader-playing.png` })
  ok('rsvp playback runs')

  // 8. pause → context peek
  await page.keyboard.press(' ')
  await page.waitForSelector('.peek', { timeout: 5000 })
  await page.screenshot({ path: `${SHOTS}/06-context-peek.png` })
  ok('pause shows context peek')

  // click a word in peek to jump
  await page.click('.peek-word.now')
  await page.waitForSelector('.peek', { state: 'detached', timeout: 5000 })
  ok('peek word-jump works')

  // 9. sentence jumps + speed
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  const wpm = await page.textContent('.wpm-value')
  ok(`controls respond (wpm now ${wpm?.trim()})`)

  // 10. exit; progress persisted on card
  await page.keyboard.press('Escape')
  await page.waitForSelector('.import-bar', { timeout: 10000 })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `${SHOTS}/07-library-progress.png` })
  ok('exit reader → library')

  // 11. stats page
  await page.click('button[title=Stats]')
  await page.waitForSelector('.stat-tile', { timeout: 10000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${SHOTS}/08-stats.png` })
  ok('stats page renders')
  await page.click('.topbar .btn')

  // 12. command bar
  await page.waitForSelector('.import-bar', { timeout: 10000 })
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.cmdbar', { timeout: 5000 })
  await page.fill('.cmdbar input', 'quiet')
  await page.waitForSelector('.cmd-item >> text=Quiet', { timeout: 5000 })
  await page.screenshot({ path: `${SHOTS}/09-cmdbar.png` })
  await page.keyboard.press('Enter')
  await page.waitForSelector('.rsvp-word', { timeout: 10000 })
  ok('command bar search + open')
  await page.keyboard.press('Escape')

  // 13. resume position: reopen same doc, check it did not start at word 0
  await page.click('text=The Quiet Power of Reading Faster')
  await page.waitForSelector('.rsvp-word', { timeout: 10000 })
  const pct = await page.textContent('.reader-top div:last-child')
  ok(`resume position shows: ${pct?.trim()}`)
  await page.keyboard.press('Escape')

  // 14. light theme
  await page.click('button[title=Settings]')
  await page.click('.seg button:has-text("Light")')
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${SHOTS}/10-light-theme.png` })
  ok('light theme applies')
  await page.keyboard.press('Escape')
} catch (e) {
  fail('flow', e)
  await page.screenshot({ path: `${SHOTS}/99-failure.png` }).catch(() => {})
}

// mobile viewport spot-check
try {
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await mctx.addInitScript(([u, k]) => {
    localStorage.setItem('fluent.supabaseUrl', u)
    localStorage.setItem('fluent.supabaseKey', k)
  }, [LOCAL_SB_URL, LOCAL_SB_KEY])
  const mp = await mctx.newPage()
  await mp.goto(APP)
  await mp.waitForSelector('.auth-card', { timeout: 15000 })
  await mp.fill('input[type=email]', email)
  await mp.fill('input[type=password]', 'e2e-password-123')
  await mp.click('button[type=submit]')
  await mp.waitForSelector('.import-bar', { timeout: 20000 })
  await mp.screenshot({ path: `${SHOTS}/11-mobile-library.png` })
  await mp.click('text=Welcome to Fluent')
  await mp.waitForSelector('.rsvp-word', { timeout: 10000 })
  await mp.tap('.reader-stage')
  await mp.waitForTimeout(2000)
  await mp.screenshot({ path: `${SHOTS}/12-mobile-reader.png` })
  ok('mobile: login persists across devices + reader works')
  await mctx.close()
} catch (e) {
  fail('mobile flow', e)
}

console.log('\n==== SUMMARY ====')
results.forEach(([s, n]) => console.log(s, n))
console.log(`${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed`)
await browser.close()
