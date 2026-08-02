/** ORP layout regression test: for a crafted list of problem words, in BOTH
 *  engines, assert (a) no gap or overlap around the focus letter and
 *  (b) the letter's centre sits on the stage centre (the focus marker).
 *
 *  The word list deliberately alternates narrow ORP letters (i, l, j, t) with
 *  wide ones (m, w) — the sequence that broke the old grid layout on WebKit,
 *  where "just" rendered with the s over the u and "forward" as "for ward". */
import { chromium, webkit } from 'playwright'

const PORT = process.env.PORT || '4182'
let fails = 0

// One word per sentence so ArrowRight steps exactly one word at a time.
const WORDS = [
  'just', 'moment', 'forward', 'will', 'turning', 'im', 'wow', 'lily', 'maximum',
  'it', 'community', 'jilt', 'wammy', 'the', 'text', 'a', 'documentation', 'ill', 'mm',
]
const TEST_DOC_BODY = 'ORP LAYOUT TEST\n\n' + WORDS.map((w) => `${w}.`).join(' ')

async function run(engine) {
  const launcher = engine === 'webkit' ? webkit : chromium
  const opts = engine === 'webkit' ? {} : { executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] }
  const b = await launcher.launch(opts)
  const c = await b.newContext({ viewport: { width: 390, height: 844 } })
  await c.addInitScript(([u, k]) => {
    localStorage.setItem('fluent.supabaseUrl', u)
    localStorage.setItem('fluent.supabaseKey', k)
  }, ['http://127.0.0.1:54321', 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'])
  const p = await c.newPage()
  p.on('pageerror', (e) => console.log('PAGEERROR:', e.message))

  await p.goto(`http://127.0.0.1:${PORT}/`)
  await p.waitForSelector('.auth-card')
  await p.click('.auth-switch button')
  await p.fill('input[type=email]', `orp${Date.now()}@f.dev`)
  await p.fill('input[type=password]', 'orppassword123')
  await p.click('button[type=submit]')
  await p.waitForSelector('.import-bar', { timeout: 30000 })

  // paste the crafted doc
  await p.click('text=Paste text')
  await p.fill('.modal textarea', TEST_DOC_BODY)
  await p.click('.modal .btn.primary')
  await p.waitForSelector('.doc-card >> text=ORP LAYOUT TEST', { timeout: 15000 })
  await p.click('text=ORP LAYOUT TEST')
  await p.waitForSelector('.rsvp-word', { timeout: 15000 })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(300)

  let worst = { gap: 0, drift: 0, word: '' }
  const seen = new Set()
  for (let i = 0; i < WORDS.length + 4; i++) {
    const m = await p.evaluate(() => {
      const stage = document.querySelector('.rsvp-word')
      const inner = document.querySelector('.rsvp-word-inner')
      const letter = inner?.querySelector('.orp')
      if (!stage || !inner || !letter) return null
      const runRect = (node) => {
        const r = document.createRange()
        r.selectNodeContents(node)
        const rects = [...r.getClientRects()].filter((x) => x.width > 0)
        return rects.length ? { left: rects[0].left, right: rects[rects.length - 1].right } : null
      }
      const kids = [...inner.childNodes]
      const preNode = kids[0]?.nodeType === 3 && kids[0].textContent ? runRect(kids[0]) : null
      const last = kids[kids.length - 1]
      const postNode = last?.nodeType === 3 && last.textContent ? runRect(last) : null
      const o = letter.getBoundingClientRect()
      const s = stage.getBoundingClientRect()
      return {
        text: inner.textContent,
        preGap: preNode ? +(o.left - preNode.right).toFixed(2) : 0,
        postGap: postNode ? +(postNode.left - o.right).toFixed(2) : 0,
        drift: +((o.left + o.width / 2) - (s.left + s.width / 2)).toFixed(2),
      }
    })
    if (m) {
      seen.add(m.text)
      for (const g of [m.preGap, m.postGap])
        if (Math.abs(g) > Math.abs(worst.gap)) worst = { ...worst, gap: g, word: m.text }
      if (Math.abs(m.drift) > Math.abs(worst.drift)) worst.drift = m.drift
    }
    await p.keyboard.press('ArrowRight')
    await p.waitForTimeout(70)
  }

  console.log(`=== ${engine} — ${seen.size} distinct words (incl. "just") ===`)
  console.log(`  worst letter gap/overlap: ${worst.gap}px (${JSON.stringify(worst.word)})`)
  console.log(`  worst centre drift:       ${worst.drift}px`)
  const gapOk = Math.abs(worst.gap) <= 2
  const driftOk = Math.abs(worst.drift) <= 2
  const sawJust = [...seen].some((t) => t.startsWith('just'))
  console.log(`  ${gapOk ? 'PASS' : 'FAIL'} letters are contiguous (|gap| ≤ 2px)`)
  console.log(`  ${driftOk ? 'PASS' : 'FAIL'} focus letter pinned to marker (|drift| ≤ 2px)`)
  console.log(`  ${sawJust ? 'PASS' : 'FAIL'} the word "just" was among the measured words`)
  if (!gapOk || !driftOk || !sawJust) fails++
  await p.screenshot({ path: `/tmp/shots/orp-fixed-${engine}.png` })
  await b.close()
}

await run('chromium')
await run('webkit')
console.log(fails === 0 ? '\nALL ORP LAYOUT CHECKS PASSED' : `\n${fails} ENGINE(S) FAILED`)
process.exitCode = fails ? 1 : 0
