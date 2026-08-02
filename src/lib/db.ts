import { supabase } from './supabase'
import { Doc, Extracted, Position, ReadingSession, DocStatus } from './types'
import { countWords } from './tokenize'

/** Data layer. Talks to Supabase, with a localStorage mirror so the app
 *  stays usable offline and feels instant. */

const LS_DOCS = 'fluent.cache.docs'
const LS_POS = 'fluent.cache.positions'
const LS_PENDING = 'fluent.pending'

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota — drop cache silently */
  }
}

// ---------- documents ----------

export async function listDocs(): Promise<Doc[]> {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id,title,author,source_type,source_url,excerpt,cover_url,favicon_url,word_count,status,tags,created_at,updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw error
    const docs = (data ?? []).map((d) => ({ ...d, content: '' })) as Doc[]
    const cached = readLS<Record<string, Doc>>(LS_DOCS, {})
    // keep cached content for docs we already have
    docs.forEach((d) => {
      if (cached[d.id]?.content) d.content = cached[d.id].content
    })
    writeLS(
      LS_DOCS,
      Object.fromEntries(docs.map((d) => [d.id, d])),
    )
    return docs
  } catch (e) {
    // offline: serve cache
    const cached = readLS<Record<string, Doc>>(LS_DOCS, {})
    return Object.values(cached).sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))
  }
}

export async function getDoc(id: string): Promise<Doc | null> {
  const cached = readLS<Record<string, Doc>>(LS_DOCS, {})
  if (cached[id]?.content) return cached[id]
  try {
    const { data, error } = await supabase.from('documents').select('*').eq('id', id).single()
    if (error) throw error
    const doc = data as Doc
    cached[id] = doc
    writeLS(LS_DOCS, cached)
    return doc
  } catch {
    return cached[id] ?? null
  }
}

export async function saveDoc(ex: Extracted): Promise<Doc> {
  const row = {
    title: ex.title || 'Untitled',
    author: ex.author,
    source_type: ex.sourceType,
    source_url: ex.sourceUrl,
    content: ex.content,
    excerpt: ex.excerpt ?? ex.content.slice(0, 240),
    cover_url: ex.coverUrl,
    favicon_url: ex.faviconUrl,
    word_count: countWords(ex.content),
    status: 'unread' as DocStatus,
  }
  const { data, error } = await supabase.from('documents').insert(row).select().single()
  if (error) throw error
  const doc = data as Doc
  const cached = readLS<Record<string, Doc>>(LS_DOCS, {})
  cached[doc.id] = doc
  writeLS(LS_DOCS, cached)
  return doc
}

export async function updateDoc(id: string, patch: Partial<Doc>): Promise<void> {
  const cached = readLS<Record<string, Doc>>(LS_DOCS, {})
  if (cached[id]) {
    cached[id] = { ...cached[id], ...patch, updated_at: new Date().toISOString() }
    writeLS(LS_DOCS, cached)
  }
  const { error } = await supabase.from('documents').update(patch).eq('id', id)
  if (error) queuePending({ kind: 'updateDoc', id, patch })
}

export async function deleteDoc(id: string): Promise<void> {
  const cached = readLS<Record<string, Doc>>(LS_DOCS, {})
  delete cached[id]
  writeLS(LS_DOCS, cached)
  await supabase.from('documents').delete().eq('id', id)
}

// ---------- positions ----------

export async function getPosition(documentId: string): Promise<Position | null> {
  try {
    const { data } = await supabase
      .from('positions')
      .select('document_id,word_index,wpm,updated_at')
      .eq('document_id', documentId)
      .maybeSingle()
    if (data) {
      const local = readLS<Record<string, Position>>(LS_POS, {})
      const l = local[documentId]
      // prefer whichever is newer
      if (l && l.updated_at && data.updated_at && l.updated_at > data.updated_at) return l
      local[documentId] = data as Position
      writeLS(LS_POS, local)
      return data as Position
    }
  } catch {
    /* offline */
  }
  return readLS<Record<string, Position>>(LS_POS, {})[documentId] ?? null
}

export async function listPositions(): Promise<Record<string, number>> {
  try {
    const { data } = await supabase.from('positions').select('document_id,word_index')
    if (data) {
      const map = Object.fromEntries(data.map((p) => [p.document_id, p.word_index]))
      const local = readLS<Record<string, Position>>(LS_POS, {})
      Object.values(local).forEach((p) => {
        if (map[p.document_id] === undefined || (p.word_index ?? 0) > map[p.document_id]) map[p.document_id] = p.word_index
      })
      return map
    }
  } catch {
    /* offline */
  }
  const local = readLS<Record<string, Position>>(LS_POS, {})
  return Object.fromEntries(Object.values(local).map((p) => [p.document_id, p.word_index]))
}

export async function savePosition(pos: Position): Promise<void> {
  const local = readLS<Record<string, Position>>(LS_POS, {})
  local[pos.document_id] = { ...pos, updated_at: new Date().toISOString() }
  writeLS(LS_POS, local)
  const { error } = await supabase
    .from('positions')
    .upsert({ document_id: pos.document_id, word_index: pos.word_index, wpm: pos.wpm }, { onConflict: 'document_id,user_id' })
  if (error) queuePending({ kind: 'savePosition', pos })
}

// ---------- sessions / stats ----------

export async function saveSession(s: ReadingSession): Promise<void> {
  if (s.words_read < 10 || s.duration_ms < 3000) return // ignore blips
  const { error } = await supabase.from('reading_sessions').insert({
    document_id: s.document_id,
    wpm: Math.round(s.wpm),
    words_read: s.words_read,
    duration_ms: Math.round(s.duration_ms),
    started_at: s.started_at,
  })
  if (error) queuePending({ kind: 'saveSession', s })
}

export async function listSessions(days = 90): Promise<ReadingSession[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  try {
    const { data, error } = await supabase
      .from('reading_sessions')
      .select('document_id,wpm,words_read,duration_ms,started_at')
      .gte('started_at', since)
      .order('started_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as ReadingSession[]
  } catch {
    return []
  }
}

// ---------- pending write queue (offline resilience) ----------

type Pending =
  | { kind: 'savePosition'; pos: Position }
  | { kind: 'saveSession'; s: ReadingSession }
  | { kind: 'updateDoc'; id: string; patch: Partial<Doc> }

function queuePending(p: Pending) {
  const q = readLS<Pending[]>(LS_PENDING, [])
  q.push(p)
  writeLS(LS_PENDING, q.slice(-200))
}

export async function flushPending(): Promise<void> {
  const q = readLS<Pending[]>(LS_PENDING, [])
  if (!q.length) return
  writeLS(LS_PENDING, [])
  for (const p of q) {
    try {
      if (p.kind === 'savePosition') await savePosition(p.pos)
      else if (p.kind === 'saveSession') await saveSession(p.s)
      else if (p.kind === 'updateDoc') await updateDoc(p.id, p.patch)
    } catch {
      /* re-queued by the calls themselves on failure */
    }
  }
}

export function clearLocalCache() {
  localStorage.removeItem(LS_DOCS)
  localStorage.removeItem(LS_POS)
  localStorage.removeItem(LS_PENDING)
}
