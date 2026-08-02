/** Live end-to-end check against the deployed GitHub Pages site.
 *  Note: service workers cannot register through the sandbox proxy's certificate,
 *  so SW behaviour is covered separately by verify-sw.mjs on localhost. */
import { chromium } from 'playwright'

const APP = 'https://arturitov.github.io/Fluent/'
const EMAIL = process.env.PROD_EMAIL
const PASS = process.env.PROD_PASS

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true, hasTouch: true, isMobile: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

await page.goto(APP, { timeout: 30000 })
await page.waitForSelector('.auth-demo-word', { timeout: 20000 })
console.log('PASS live sign-in screen with RSVP demo')
console.log('     tagline:', JSON.stringify(await page.textContent('.auth-tagline')))
const drift = await page.evaluate(() => {
  const s = document.querySelector('.auth-demo-stage').getBoundingClientRect()
  const o = document.querySelector('.auth-demo-word .orp').getBoundingClientRect()
  return o.left + o.width / 2 - (s.left + s.width / 2)
})
console.log('     ORP drift from centre:', drift.toFixed(1), 'px')
await page.screenshot({ path: '/tmp/shots/17-live-mobile-auth.png' })

if (EMAIL && PASS) {
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASS)
  await page.click('button[type=submit]')
  await page.waitForSelector('.import-bar', { timeout: 30000 })
  console.log('PASS live sign-in with the real account')
  await page.waitForSelector('text=Welcome to Fluent', { timeout: 20000 })
  await page.waitForTimeout(700)
  await page.screenshot({ path: '/tmp/shots/18-live-mobile-library.png' })

  await page.click('text=Welcome to Fluent')
  await page.waitForSelector('.rsvp-word', { timeout: 15000 })
  await page.tap('.reader-stage')
  await page.waitForTimeout(3500)
  await page.screenshot({ path: '/tmp/shots/19-live-mobile-reader.png' })
  console.log('PASS live reader running on a phone viewport')

  await page.tap('.reader-stage')
  await page.waitForSelector('.peek', { timeout: 6000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/tmp/shots/20-live-mobile-peek.png' })
  console.log('PASS tap-to-pause context peek on live site')
}
await browser.close()
