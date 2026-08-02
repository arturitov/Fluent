/** Library card menu: can its items actually be clicked? */
import { chromium } from 'playwright'
const PORT = process.env.PORT || '4181'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const c = await b.newContext({ viewport: { width: 1280, height: 860 } })
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
await p.fill('input[type=email]', `menu${Date.now()}@f.dev`)
await p.fill('input[type=password]', 'menupassword123')
await p.click('button[type=submit]')
await p.waitForSelector('text=Welcome to Fluent', { timeout: 30000 })

// add a second doc so we can delete one and still see the grid
await p.click('text=Paste text')
await p.fill('.modal input', 'MENU TEST')
await p.fill('.modal textarea', 'A short document created purely to exercise the card menu. It has enough words to be a valid import and nothing else to say.')
await p.click('.modal .btn.primary')
await p.waitForSelector('.doc-card >> text=MENU TEST', { timeout: 15000 })

const card = p.locator('.doc-card', { hasText: 'MENU TEST' }).first()
await card.locator('.doc-menu-btn').click()
await p.waitForSelector('.menu', { timeout: 5000 })
check(true, 'menu opens')

// what is actually on top at the menu item's position?
const probe = await p.evaluate(() => {
  const item = document.querySelector('.menu button.danger')
  if (!item) return { error: 'no menu item' }
  const r = item.getBoundingClientRect()
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  const menu = document.querySelector('.menu')
  const cardEl = menu.closest('.doc-card')
  return {
    hitTarget: top?.className || top?.tagName,
    reachesMenuItem: !!top?.closest('.menu'),
    cardTransform: getComputedStyle(cardEl).transform,
    cardOverflow: getComputedStyle(cardEl).overflow,
    menuClippedBy: r.bottom > cardEl.getBoundingClientRect().bottom ? 'card bottom edge' : 'not clipped',
  }
})
console.log('   probe:', JSON.stringify(probe))
check(probe.reachesMenuItem, 'menu item is the topmost element at its own coordinates')

const clicked = await p
  .click('.menu button.danger', { timeout: 4000 })
  .then(() => true)
  .catch(() => false)
check(clicked, 'menu item is clickable')
if (clicked) {
  await p.waitForTimeout(1200)
  check((await p.locator('.doc-card', { hasText: 'MENU TEST' }).count()) === 0, 'delete removed the card')
}

console.log(fails === 0 ? '\nALL MENU TESTS PASSED' : `\n${fails} FAILURE(S)`)
process.exitCode = fails ? 1 : 0
await b.close()
