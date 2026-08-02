/** Validates the service-worker update path on a real secure context (localhost),
 *  since the sandbox proxy's certificate prevents SW registration over the public URL. */
import { chromium } from 'playwright'

const APP = 'http://127.0.0.1:4181/'
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

await page.goto(APP)
await page.waitForSelector('.auth-card', { timeout: 20000 })
await page.evaluate(() => navigator.serviceWorker.ready)
await page.waitForTimeout(1500)
console.log('PASS service worker registered, controller:', await page.evaluate(() => !!navigator.serviceWorker.controller))

// Simulate exactly the user's situation: a stale shell sitting in the SW cache.
await page.evaluate(async () => {
  for (const k of await caches.keys()) {
    const c = await caches.open(k)
    const stale = () => new Response('<html><body>STALE BUILD</body></html>', { headers: { 'Content-Type': 'text/html' } })
    await c.put('./index.html', stale())
    await c.put('./', stale())
    await c.put(new Request(location.href), stale())
  }
})
console.log('injected stale shell into SW cache')

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const html = await page.content()
if (html.includes('STALE BUILD')) {
  console.log('FAIL stale cache was served')
  process.exitCode = 1
} else {
  await page.waitForSelector('.auth-demo-word', { timeout: 15000 })
  console.log('PASS fresh build served despite poisoned cache (network-first shell)')
}

// Offline fallback still works (the reason the cache exists at all)
await ctx.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await page.waitForTimeout(1200)
const offlineOk = await page.evaluate(() => !!document.querySelector('#root')?.children.length)
console.log(offlineOk ? 'PASS app shell still boots offline' : 'FAIL offline boot broken')
await ctx.setOffline(false)
await browser.close()
