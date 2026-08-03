import { supabase } from './supabase'
import { Doc, Extracted, Position, ReadingSession, DocStatus } from './types'
import { countWords } from './tokenize'
import { isLocalMode } from './mode'
import * as local from './localdb'

/** Data layer. Two interchangeable drivers behind one interface:
 *  - local (device-only): IndexedDB, no account, nothing leaves the phone
 *  - cloud: Supabase, with a localStorage mirror for offline resilience
 *  Every public function branches on the current storage mode. */

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
  if (isLocalMode()) return local.listDocs()
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
  if (isLocalMode()) return local.getDoc(id)
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
  if (isLocalMode()) return local.saveDoc(ex)
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
  if (isLocalMode()) return local.updateDoc(id, patch)
  const cached = readLS<Record<string, Doc>>(LS_DOCS, {})
  if (cached[id]) {
    cached[id] = { ...cached[id], ...patch, updated_at: new Date().toISOString() }
    writeLS(LS_DOCS, cached)
  }
  const { error } = await supabase.from('documents').update(patch).eq('id', id)
  if (error) queuePending({ kind: 'updateDoc', id, patch })
}

export async function deleteDoc(id: string): Promise<void> {
  if (isLocalMode()) return local.deleteDoc(id)
  const cached = readLS<Record<string, Doc>>(LS_DOCS, {})
  delete cached[id]
  writeLS(LS_DOCS, cached)
  await supabase.from('documents').delete().eq('id', id)
}

// ---------- positions ----------

export async function getPosition(documentId: string): Promise<Position | null> {
  if (isLocalMode()) return local.getPosition(documentId)
  try {
    const { data } = await supabase
      .from('positions')
      .select('document_id,word_index,wpm,updated_at')
      .eq('document_id', documentId)
      .maybeSingle()
    if (data) {
      const mirror = readLS<Record<string, Position>>(LS_POS, {})
      const l = mirror[documentId]
      // prefer whichever is newer
      if (l && l.updated_at && data.updated_at && l.updated_at > data.updated_at) return l
      mirror[documentId] = data as Position
      writeLS(LS_POS, mirror)
      return data as Position
    }
  } catch {
    /* offline */
  }
  return readLS<Record<string, Position>>(LS_POS, {})[documentId] ?? null
}

export async function listPositions(): Promise<Record<string, number>> {
  if (isLocalMode()) return local.listPositions()
  try {
    const { data } = await supabase.from('positions').select('document_id,word_index')
    if (data) {
      const map = Object.fromEntries(data.map((p) => [p.document_id, p.word_index]))
      const mirror = readLS<Record<string, Position>>(LS_POS, {})
      Object.values(mirror).forEach((p) => {
        if (map[p.document_id] === undefined || (p.word_index ?? 0) > map[p.document_id]) map[p.document_id] = p.word_index
      })
      return map
    }
  } catch {
    /* offline */
  }
  const mirror = readLS<Record<string, Position>>(LS_POS, {})
  return Object.fromEntries(Object.values(mirror).map((p) => [p.document_id, p.word_index]))
}

export async function savePosition(pos: Position): Promise<void> {
  if (isLocalMode()) return local.savePosition(pos)
  const mirror = readLS<Record<string, Position>>(LS_POS, {})
  mirror[pos.document_id] = { ...pos, updated_at: new Date().toISOString() }
  writeLS(LS_POS, mirror)
  const { error } = await supabase
    .from('positions')
    .upsert({ document_id: pos.document_id, word_index: pos.word_index, wpm: pos.wpm }, { onConflict: 'document_id,user_id' })
  if (error) queuePending({ kind: 'savePosition', pos })
}

// ---------- sessions / stats ----------

export async function saveSession(s: ReadingSession): Promise<void> {
  if (s.words_read < 10 || s.duration_ms < 3000) return // ignore blips
  if (isLocalMode())
    return local.saveSession({ ...s, wpm: Math.round(s.wpm), duration_ms: Math.round(s.duration_ms) })
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
  if (isLocalMode()) return local.listSessions(days)
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
  if (isLocalMode()) return
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

// ---------- device-only mode: migration, backup, restore ----------

/** Copy the signed-in user's entire cloud library into on-device storage.
 *  Used when switching to device-only mode so nothing is lost. */
export async function migrateCloudToLocal(): Promise<number> {
  const { data: docs, error } = await supabase.from('documents').select('*')
  if (error) throw error
  const { data: positions } = await supabase.from('positions').select('document_id,word_index,wpm,updated_at')
  const { data: sessions } = await supabase
    .from('reading_sessions')
    .select('document_id,wpm,words_read,duration_ms,started_at')
  return local.importAll({
    app: 'fluent',
    version: 1,
    exported_at: new Date().toISOString(),
    docs: (docs ?? []) as Doc[],
    positions: (positions ?? []) as Position[],
    sessions: (sessions ?? []) as ReadingSession[],
  })
}

/** Full library backup as a downloadable JSON object (works in both modes). */
export async function exportLibrary(): Promise<local.LibraryExport> {
  if (isLocalMode()) return local.exportAll()
  const { data: docs } = await supabase.from('documents').select('*')
  const { data: positions } = await supabase.from('positions').select('document_id,word_index,wpm,updated_at')
  const { data: sessions } = await supabase
    .from('reading_sessions')
    .select('document_id,wpm,words_read,duration_ms,started_at')
  return {
    app: 'fluent',
    version: 1,
    exported_at: new Date().toISOString(),
    docs: (docs ?? []) as Doc[],
    positions: (positions ?? []) as Position[],
    sessions: (sessions ?? []) as ReadingSession[],
  }
}

/** Restore a backup file. In device-only mode ids are preserved; in cloud
 *  mode docs are re-inserted (new ids) and their positions remapped. */
export async function importLibrary(data: local.LibraryExport): Promise<number> {
  if (!data || data.app !== 'fluent' || !Array.isArray(data.docs)) {
    throw new Error("That file doesn't look like a Fluent backup.")
  }
  if (isLocalMode()) return local.importAll(data)
  let n = 0
  const posByDoc = new Map((data.positions ?? []).map((p) => [p.document_id, p]))
  for (const doc of data.docs) {
    if (!doc || typeof doc.content !== 'string') continue
    const { data: inserted, error } = await supabase
      .from('documents')
      .insert({
        title: doc.title,
        author: doc.author,
        source_type: doc.source_type,
        source_url: doc.source_url,
        content: doc.content,
        excerpt: doc.excerpt,
        cover_url: doc.cover_url,
        favicon_url: doc.favicon_url,
        word_count: doc.word_count,
        status: doc.status,
        tags: doc.tags ?? [],
      })
      .select('id')
      .single()
    if (error) continue
    n++
    const pos = posByDoc.get(doc.id)
    if (pos && inserted) {
      await supabase
        .from('positions')
        .upsert({ document_id: inserted.id, word_index: pos.word_index, wpm: pos.wpm }, { onConflict: 'document_id,user_id' })
    }
  }
  return n
}
