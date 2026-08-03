/** Storage mode: 'local' keeps everything on this device (IndexedDB, no
 *  account, no network); 'cloud' is the original Supabase-backed mode with
 *  sign-in and cross-device sync. */
export type StorageMode = 'local' | 'cloud'

const KEY = 'fluent.mode'

export function getMode(): StorageMode {
  return localStorage.getItem(KEY) === 'local' ? 'local' : 'cloud'
}

export function setMode(mode: StorageMode) {
  localStorage.setItem(KEY, mode)
}

export function isLocalMode(): boolean {
  return getMode() === 'local'
}
