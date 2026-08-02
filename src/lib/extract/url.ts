import { Readability } from '@mozilla/readability'
import { Extracted } from '../types'

/** Fetch a URL and extract clean article text, entirely client-side.
 *  Tries direct fetch first (works for CORS-friendly sites), then public
 *  CORS-relay fallbacks, then a reader-mode text service. */

const RELAYS = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
]

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response> {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, { signal: ctl.signal, redirect: 'follow' })
  } finally {
    clearTimeout(t)
  }
}

async function getHtml(url: string): Promise<string | null> {
  const attempts = [url, ...RELAYS.map((r) => r(url))]
  for (const attempt of attempts) {
    try {
      const res = await fetchWithTimeout(attempt)
      if (!res.ok) continue
      const text = await res.text()
      if (text && text.length > 200) return text
    } catch {
      /* try next */
    }
  }
  return null
}

/** Reader-mode fallback: returns markdown-ish plain text. */
async function getReaderText(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const res = await fetchWithTimeout(`https://r.jina.ai/${url}`, 20000)
    if (!res.ok) return null
    const text = await res.text()
    if (!text || text.length < 200) return null
    const titleMatch = text.match(/^Title:\s*(.+)$/m)
    const body = text.replace(/^(Title|URL Source|Published Time|Markdown Content):.*$/gm, '').trim()
    return { title: titleMatch?.[1]?.trim() ?? url, content: cleanMarkdown(body) }
  } catch {
    return null
  }
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → text
    .replace(/[*_`#>|]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function htmlToParagraphText(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll('script,style,noscript,iframe,figure,img,svg,nav,footer,aside').forEach((n) => n.remove())
  const blocks = div.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td')
  if (!blocks.length) return (div.textContent ?? '').replace(/\s+/g, ' ').trim()
  const parts: string[] = []
  blocks.forEach((b) => {
    const t = (b.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (t) parts.push(t)
  })
  return parts.join('\n\n')
}

export async function extractFromUrl(url: string): Promise<Extracted> {
  let normalized = url.trim()
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`
  const origin = new URL(normalized).origin
  const favicon = `https://www.google.com/s2/favicons?domain=${new URL(normalized).hostname}&sz=64`

  const html = await getHtml(normalized)
  if (html) {
    try {
      const dom = new DOMParser().parseFromString(html, 'text/html')
      // resolve relative URLs for og:image
      const ogImage = dom.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null
      const byline = dom.querySelector('meta[name="author"]')?.getAttribute('content') ?? null
      const reader = new Readability(dom.cloneNode(true) as Document)
      const article = reader.parse()
      if (article && article.textContent && article.textContent.trim().length > 300) {
        const content = htmlToParagraphText(article.content ?? '')
        return {
          title: article.title || dom.title || normalized,
          author: article.byline || byline,
          content: content.length > 200 ? content : article.textContent.trim(),
          excerpt: article.excerpt ?? null,
          sourceType: 'url',
          sourceUrl: normalized,
          coverUrl: ogImage && /^https?:/.test(ogImage) ? ogImage : ogImage ? origin + ogImage : null,
          faviconUrl: favicon,
        }
      }
    } catch {
      /* fall through to reader mode */
    }
  }

  const reader = await getReaderText(normalized)
  if (reader && reader.content.length > 200) {
    return {
      title: reader.title,
      author: null,
      content: reader.content,
      excerpt: reader.content.slice(0, 240),
      sourceType: 'url',
      sourceUrl: normalized,
      coverUrl: null,
      faviconUrl: favicon,
    }
  }

  throw new Error(
    "Couldn't extract this page cleanly — it may be paywalled or JavaScript-rendered. Try pasting the text instead.",
  )
}
