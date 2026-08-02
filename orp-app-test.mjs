/** ORP layout regression test: for many words, in BOTH engines, assert
 *  (a) no gap or overlap around the focus letter, and
 *  (b) the letter's centre sits on the stage centre (the focus marker). */
import { chromium, webkit } from 'playwright'

const PORT = process.env.PORT || '4182'
let fails = 0

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
  await p.waitForSelector('text=Welcome to Fluent', { timeout: 30000 })
  await p.click('text=Welcome to Fluent')
  await p.waitForSelector('.rsvp-word', { timeout: 15000 })
  await p.evaluate(() => document.fonts.ready)
  await p.waitForTimeout(300)

  let worstGap = 0
  let worstDrift = 0
  let worstWord = ''
  const samples = []
  for (let i = 0; i < 40; i++) {
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
      const preNode = kids[0]?.nodeType === 3 ? kids[0] : null
      const postNode = kids[kids.length - 1]?.nodeType === 3 ? kids[kids.length - 1] : null
      const o = letter.getBoundingClientRect()
      const stageRect = stage.getBoundingClientRect()
      const pre = preNode && preNode.textContent ? runRect(preNode) : null
      const post = postNode && postNode.textContent ? runRect(postNode) : null
      return {
        text: inner.textContent,
        preGap: pre ? +(o.left - pre.right).toFixed(2) : 0,
        postGap: post ? +(post.left - o.right).toFixed(2) : 0,
        drift: +((o.left + o.width / 2) - (stageRect.left + stageRect.width / 2)).toFixed(2),
      }
    })
    if (m) {
      samples.push(m)
      for (const g of [m.preGap, m.postGap]) {
        if (Math.abs(g) > Math.abs(worstGap)) {
          worstGap = g
          worstWord = m.text
        }
      }
      if (Math.abs(m.drift) > Math.abs(worstDrift)) worstDrift = m.drift
    }
    await p.keyboard.press('ArrowRight')
    await p.waitForTimeout(80)
  }

  const uniq = new Set(samples.map((s) => s.text)).size
  console.log(`=== ${engine} — ${uniq} distinct words ===`)
  console.log(`  worst letter gap/overlap: ${worstGap}px (${JSON.stringify(worstWord)})`)
  console.log(`  worst centre drift:       ${worstDrift}px`)
  const gapOk = Math.abs(worstGap) <= 2
  const driftOk = Math.abs(worstDrift) <= 2
  console.log(`  ${gapOk ? 'PASS' : 'FAIL'} letters are contiguous (|gap| ≤ 2px)`)
  console.log(`  ${driftOk ? 'PASS' : 'FAIL'} focus letter pinned to marker (|drift| ≤ 2px)`)
  if (!gapOk || !driftOk) fails++
  await p.screenshot({ path: `/tmp/shots/orp-fixed-${engine}.png` })
  await b.close()
}

await run('chromium')
await run('webkit')
console.log(fails === 0 ? '\nALL ORP LAYOUT CHECKS PASSED' : `\n${fails} ENGINE(S) FAILED`)
process.exitCode = fails ? 1 : 0
