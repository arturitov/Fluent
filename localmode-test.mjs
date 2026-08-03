/** Device-only mode: the whole app with NO backend at all.
 *  Verifies the no-account flow, IndexedDB persistence across reloads,
 *  stats, export, and restore-from-backup. Network to Supabase is BLOCKED
 *  for the entire test to prove nothing depends on it. */
import { chromium } from 'playwright'
import fs from 'fs'

const PORT = process.env.PORT || '4182'
let fails = 0
const check = (cond, msg) => {
  console.log((cond ? 'PASS ' : 'FAIL ') + msg)
  if (!cond) fails++
}

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] })
const c = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, acceptDownloads: true })
// Hard-block every Supabase request — device-only mode must never need one.
let supabaseCalls = 0
await c.route(/supabase\.co/, (route) => {
  supabaseCalls++
  route.abort()
})
const p = await c.newPage()
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

// 1. skip the account entirely
await p.goto(`http://127.0.0.1:${PORT}/`)
await p.waitForSelector('.auth-local-btn', { timeout: 20000 })
await p.click('.auth-local-btn')
await p.waitForSelector('.import-bar', { timeout: 15000 })
check(true, 'library opens with no account and no backend')

// 2. welcome guide seeds into IndexedDB
await p.waitForSelector('text=Welcome to Fluent', { timeout: 15000 })
check(true, 'welcome guide seeded locally')

// 3. import by paste
await p.click('text=Paste text')
await p.fill('.modal input', 'LOCAL MODE TEST')
await p.fill(
  '.modal textarea',
  'LOCAL MODE TEST. Reading entirely on this device. Nothing here touches a server, and the words keep their pace regardless. This paragraph exists so the session counter has enough words to record a real reading session for the stats page.',
)
await p.click('.modal .btn.primary')
await p.waitForSelector('.doc-card >> text=LOCAL MODE TEST', { timeout: 15000 })
check(true, 'paste import saved to device storage')

// 4. read a bit, pause → position saved locally
await p.click('text=LOCAL MODE TEST')
await p.waitForSelector('.rsvp-word', { timeout: 15000 })
await p.tap('.reader-stage')
await p.waitForTimeout(4200)
await p.tap('.reader-stage')
await p.waitForTimeout(800)
check(!!(await p.$('.peek')), 'reading + peek works offline-only')
await p.click('.reader-top .btn')
await p.waitForSelector('.import-bar', { timeout: 10000 })
await p.waitForTimeout(600)

// 5. survives a full reload (IndexedDB, not memory)
await p.reload()
await p.waitForSelector('.doc-card >> text=LOCAL MODE TEST', { timeout: 15000 })
const meta = await p.locator('.doc-card', { hasText: 'LOCAL MODE TEST' }).locator('.doc-meta').textContent()
check(/%/.test(meta ?? ''), `position survived reload (card shows ${JSON.stringify(meta?.trim())})`)

// 6. stats recorded locally
await p.click('button[title=Stats]')
await p.waitForSelector('.stat-tile', { timeout: 10000 })
const words = await p.locator('.stat-tile').nth(1).locator('.v').textContent()
check(Number((words ?? '0').replace(/[^\d.]/g, '')) > 0, `stats recorded on device (${words?.trim()} words)`)
await p.click('.topbar .btn')
await p.waitForSelector('.import-bar', { timeout: 10000 })

// 7. export a backup
await p.click('button[title=Settings]')
await p.waitForSelector('.modal', { timeout: 5000 })
const storage = await p.locator('.setting-row', { hasText: 'Storage' }).locator('.sub').textContent()
check(/this device only/i.test(storage ?? ''), `settings shows device-only storage (${storage?.trim()})`)
const [download] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.click('text=Export')])
const backupPath = '/tmp/fluent-backup-test.json'
await download.saveAs(backupPath)
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
check(backup.app === 'fluent' && backup.docs.length >= 2, `backup exported (${backup.docs.length} docs, positions: ${backup.positions.length})`)
await p.keyboard.press('Escape')

// 8. wipe the device, restore from the backup file
await p.evaluate(() => new Promise((res) => {
  const req = indexedDB.deleteDatabase('fluent-local')
  req.onsuccess = req.onerror = req.onblocked = () => res(null)
}))
await p.evaluate(() => localStorage.removeItem('fluent.seeded'))
await p.reload()
await p.waitForSelector('.import-bar', { timeout: 15000 })
await p.setInputFiles('input[type=file]', backupPath)
await p.waitForSelector('.doc-card >> text=LOCAL MODE TEST', { timeout: 15000 })
const meta2 = await p.locator('.doc-card', { hasText: 'LOCAL MODE TEST' }).locator('.doc-meta').textContent()
check(/%/.test(meta2 ?? ''), `restore brought back docs AND reading position (${JSON.stringify(meta2?.trim())})`)

// 9. the whole run made zero successful backend calls
check(true, `Supabase requests blocked throughout (${supabaseCalls} attempted, all aborted)`)

console.log(fails === 0 ? '\nALL LOCAL-MODE CHECKS PASSED' : `\n${fails} FAILURE(S)`)
process.exitCode = fails ? 1 : 0
await b.close()
