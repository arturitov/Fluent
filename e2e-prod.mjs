import { chromium } from 'playwright'

const APP = process.env.APP_URL || 'http://127.0.0.1:4174/'
const EMAIL = 'e2e-prod@fluent-e2e.dev'
const PASS = process.env.TESTPW
if (!PASS) throw new Error('TESTPW env missing')

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox', '--no-proxy-server'],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

await page.goto(APP)
await page.waitForSelector('.auth-card', { timeout: 20000 })
await page.fill('input[type=email]', EMAIL)
await page.fill('input[type=password]', PASS)
await page.click('button[type=submit]')
await page.waitForSelector('.import-bar', { timeout: 25000 })
console.log('PASS prod sign-in → library')

await page.waitForSelector('text=Welcome to Fluent', { timeout: 20000 })
console.log('PASS welcome guide seeded into PROD db')

if (!process.env.SKIP_URL_IMPORT) {
  await page.fill('.import-bar input', 'http://127.0.0.1:8899/story.html')
  await page.click('.import-bar .btn.primary')
  await page.waitForSelector('text=The Quiet Power of Reading Faster', { timeout: 25000 })
  console.log('PASS URL import persisted to PROD')
}

await page.click('text=Welcome to Fluent')
await page.waitForSelector('.rsvp-word', { timeout: 15000 })
await page.keyboard.press(' ')
await page.waitForTimeout(4200)
await page.keyboard.press(' ')
await page.waitForSelector('.peek', { timeout: 5000 })
console.log('PASS reading + peek on prod data')
await page.keyboard.press('Escape')
await page.keyboard.press('Escape')
await page.waitForSelector('.import-bar', { timeout: 10000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/shots/15-prod-library.png' })
console.log('DONE')
await browser.close()
