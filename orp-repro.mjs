import { chromium, webkit } from 'playwright'

const url = 'http://127.0.0.1:8899/orp-repro.html'
for (const [name, launcher, opts] of [
  ['chromium', chromium, { executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] }],
  ['webkit  ', webkit, {}],
]) {
  const b = await launcher.launch(opts)
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage()
  await p.goto(url)
  await p.waitForTimeout(1800) // let the webfont load
  const rows = await p.evaluate(() => window.measure())
  console.log(`=== ${name} ===`)
  for (const r of rows) console.log(`  ${r.text.padEnd(14)} pre→orp: ${String(r.preToOrp).padStart(6)}  orp→post: ${String(r.orpToPost).padStart(6)}`)
  await p.screenshot({ path: `/tmp/shots/orp-${name.trim()}.png` })
  await b.close()
}
