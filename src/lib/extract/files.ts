import { Extracted } from '../types'

/** Client-side file parsing: PDF (pdf.js), EPUB (JSZip), DOCX (mammoth), TXT/MD. */

export async function extractFromFile(file: File): Promise<Extracted> {
  const name = file.name.replace(/\.[^.]+$/, '')
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'pdf' || file.type === 'application/pdf') return extractPdf(file, name)
  if (ext === 'epub') return extractEpub(file, name)
  if (ext === 'docx') return extractDocx(file, name)
  if (['txt', 'md', 'markdown', 'text'].includes(ext) || file.type.startsWith('text/')) {
    const text = await file.text()
    return plain(ext === 'md' || ext === 'markdown' ? stripMarkdown(text) : text, name, ext === 'md' ? 'md' : 'txt')
  }
  throw new Error(`Unsupported file type: .${ext}. Try PDF, EPUB, DOCX, TXT, or Markdown.`)
}

function plain(content: string, title: string, sourceType: Extracted['sourceType']): Extracted {
  const trimmed = content.replace(/\r\n/g, '\n').trim()
  if (trimmed.length < 10) throw new Error('That file appears to be empty.')
  // First non-blank line often makes a better title than the filename
  const firstLine = trimmed.split('\n').find((l) => l.trim().length > 0)?.trim() ?? title
  return {
    title: firstLine.length > 3 && firstLine.length <= 120 ? firstLine : title,
    author: null,
    content: trimmed,
    excerpt: trimmed.slice(0, 240),
    sourceType,
    sourceUrl: null,
    coverUrl: null,
    faviconUrl: null,
  }
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>|]+/g, '')
}

async function extractPdf(file: File, name: string): Promise<Extracted> {
  const pdfjs = await import('pdfjs-dist')
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const data = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data }).promise
  const meta = (await doc.getMetadata().catch(() => null)) as { info?: { Title?: string; Author?: string } } | null
  const paras: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    let line = ''
    const lines: string[] = []
    let lastY: number | null = null
    for (const item of tc.items as Array<{ str: string; transform: number[] }>) {
      const y = item.transform?.[5]
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
        if (line.trim()) lines.push(line.trim())
        line = ''
      }
      line += item.str + ' '
      if (y !== undefined) lastY = y
    }
    if (line.trim()) lines.push(line.trim())
    // Merge hyphenated line breaks, join lines into paragraphs
    const pageText = lines
      .join('\n')
      .replace(/-\n(\p{Ll})/gu, '$1')
      .replace(/\n(?=\p{Ll})/gu, ' ')
    paras.push(pageText)
  }
  const content = paras.join('\n\n').replace(/[ \t]+/g, ' ').trim()
  if (content.length < 50)
    throw new Error('This PDF has no extractable text — it may be a scanned document. OCR support is coming soon.')
  return {
    title: meta?.info?.Title?.trim() || name,
    author: meta?.info?.Author?.trim() || null,
    content,
    excerpt: content.slice(0, 240),
    sourceType: 'pdf',
    sourceUrl: null,
    coverUrl: null,
    faviconUrl: null,
  }
}

async function extractDocx(file: File, name: string): Promise<Extracted> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  const content = result.value.replace(/\n{3,}/g, '\n\n').trim()
  if (content.length < 10) throw new Error('No text found in that document.')
  return plain(content, name, 'docx')
}

async function extractEpub(file: File, name: string): Promise<Extracted> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  // Locate the OPF package file
  const containerXml = await zip.file('META-INF/container.xml')?.async('text')
  let opfPath = containerXml?.match(/full-path="([^"]+)"/)?.[1]
  if (!opfPath) opfPath = Object.keys(zip.files).find((f) => f.endsWith('.opf'))
  if (!opfPath) throw new Error('Not a valid EPUB file.')
  const opf = await zip.file(opfPath)!.async('text')
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : ''

  const opfDoc = new DOMParser().parseFromString(opf, 'application/xml')
  const title = opfDoc.querySelector('metadata title')?.textContent?.trim() || name
  const author = opfDoc.querySelector('metadata creator')?.textContent?.trim() || null

  // Spine order → manifest hrefs
  const manifest = new Map<string, string>()
  opfDoc.querySelectorAll('manifest item').forEach((item) => {
    const id = item.getAttribute('id')
    const href = item.getAttribute('href')
    if (id && href) manifest.set(id, href)
  })
  const spineIds: string[] = []
  opfDoc.querySelectorAll('spine itemref').forEach((ref) => {
    const idref = ref.getAttribute('idref')
    if (idref) spineIds.push(idref)
  })

  const parts: string[] = []
  for (const id of spineIds) {
    const href = manifest.get(id)
    if (!href) continue
    const path = decodeURIComponent(opfDir + href)
    const entry = zip.file(path) ?? zip.file(href)
    if (!entry) continue
    const html = await entry.async('text')
    const doc = new DOMParser().parseFromString(html, 'text/html')
    doc.querySelectorAll('script,style,nav').forEach((n) => n.remove())
    const blocks = doc.querySelectorAll('p,h1,h2,h3,h4,blockquote,li')
    if (blocks.length) {
      blocks.forEach((b) => {
        const t = (b.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) parts.push(t)
      })
    } else {
      const t = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (t) parts.push(t)
    }
  }
  const content = parts.join('\n\n').trim()
  if (content.length < 50) throw new Error('No readable text found in that EPUB.')
  return {
    title,
    author,
    content,
    excerpt: content.slice(0, 240),
    sourceType: 'epub',
    sourceUrl: null,
    coverUrl: null,
    faviconUrl: null,
  }
}

export function extractFromPaste(text: string, title?: string): Extracted {
  const trimmed = text.trim()
  if (trimmed.length < 10) throw new Error('Paste a bit more text than that.')
  const firstLine = trimmed.split('\n').find((l) => l.trim())?.trim() ?? 'Pasted text'
  return {
    title: title?.trim() || (firstLine.length <= 120 ? firstLine : firstLine.slice(0, 117) + '…'),
    author: null,
    content: trimmed,
    excerpt: trimmed.slice(0, 240),
    sourceType: 'paste',
    sourceUrl: null,
    coverUrl: null,
    faviconUrl: null,
  }
}
