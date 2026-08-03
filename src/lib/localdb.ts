import { Doc, Extracted, Position, ReadingSession, DocStatus } from './types'
import { countWords } from './tokenize'

/** On-device storage driver: everything in IndexedDB, nothing leaves the
 *  phone. Mirrors the shape of the Supabase driver in db.ts exactly. */

const DB_NAME = 'fluent-local'
let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('positions')) d.createObjectStore('positions', { keyPath: 'document_id' })
        if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' })
        if (!d.objectStoreNames.contains('highlights')) d.createObjectStore('highlights', { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function reqAsPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getAll<T>(store: string): Promise<T[]> {
  const d = await open()
  return reqAsPromise(d.transaction(store, 'readonly').objectStore(store).getAll() as IDBRequest<T[]>)
}
async function getOne<T>(store: string, key: string): Promise<T | undefined> {
  const d = await open()
  return reqAsPromise(d.transaction(store, 'readonly').objectStore(store).get(key) as IDBRequest<T | undefined>)
}
async function put(store: string, value: unknown): Promise<void> {
  const d = await open()
  await reqAsPromise(d.transaction(store, 'readwrite').objectStore(store).put(value))
}
async function del(store: string, key: string): Promise<void> {
  const d = await open()
  await reqAsPromise(d.transaction(store, 'readwrite').objectStore(store).delete(key))
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ---------- documents ----------

export async function listDocs(): Promise<Doc[]> {
  const docs = await getAll<Doc>('docs')
  return docs.sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1))
}

export async function getDoc(id: string): Promise<Doc | null> {
  return (await getOne<Doc>('docs', id)) ?? null
}

export async function saveDoc(ex: Extracted): Promise<Doc> {
  const now = new Date().toISOString()
  const doc: Doc = {
    id: uuid(),
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
    tags: [],
    created_at: now,
    updated_at: now,
  }
  await put('docs', doc)
  return doc
}

export async function putDoc(doc: Doc): Promise<void> {
  await put('docs', doc)
}

export async function updateDoc(id: string, patch: Partial<Doc>): Promise<void> {
  const doc = await getOne<Doc>('docs', id)
  if (!doc) return
  await put('docs', { ...doc, ...patch, updated_at: new Date().toISOString() })
}

export async function deleteDoc(id: string): Promise<void> {
  await del('docs', id)
  await del('positions', id).catch(() => {})
  const highlights = await getAll<{ id: string; document_id: string }>('highlights')
  for (const h of highlights.filter((h) => h.document_id === id)) await del('highlights', h.id)
}

// ---------- positions ----------

export async function getPosition(documentId: string): Promise<Position | null> {
  return (await getOne<Position>('positions', documentId)) ?? null
}

export async function listPositions(): Promise<Record<string, number>> {
  const all = await getAll<Position>('positions')
  return Object.fromEntries(all.map((p) => [p.document_id, p.word_index]))
}

export async function savePosition(pos: Position): Promise<void> {
  await put('positions', { ...pos, updated_at: new Date().toISOString() })
}

// ---------- sessions ----------

export async function saveSession(s: ReadingSession): Promise<void> {
  await put('sessions', { ...s, id: uuid() })
}

export async function listSessions(days: number): Promise<ReadingSession[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const all = await getAll<ReadingSession>('sessions')
  return all.filter((s) => s.started_at >= since).sort((a, b) => (a.started_at < b.started_at ? -1 : 1))
}

// ---------- backup / restore / migration ----------

export interface LibraryExport {
  app: 'fluent'
  version: 1
  exported_at: string
  docs: Doc[]
  positions: Position[]
  sessions: ReadingSession[]
}

export async function exportAll(): Promise<LibraryExport> {
  return {
    app: 'fluent',
    version: 1,
    exported_at: new Date().toISOString(),
    docs: await getAll<Doc>('docs'),
    positions: await getAll<Position>('positions'),
    sessions: await getAll<ReadingSession>('sessions'),
  }
}

/** Merge a backup (or a cloud library) into local storage. Existing docs with
 *  the same id are overwritten; nothing is deleted. */
export async function importAll(data: LibraryExport): Promise<number> {
  let n = 0
  for (const doc of data.docs ?? []) {
    if (!doc?.id || typeof doc.content !== 'string') continue
    await put('docs', { ...doc, tags: doc.tags ?? [] })
    n++
  }
  for (const p of data.positions ?? []) {
    if (p?.document_id) await put('positions', p)
  }
  for (const s of data.sessions ?? []) {
    if (s?.started_at) await put('sessions', { ...s, id: (s as { id?: string }).id ?? uuid() })
  }
  return n
}
