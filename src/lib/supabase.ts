import { createClient, SupabaseClient, User } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from '../config'

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export type { User }

/** Detects the "backend not reachable / key invalid" class of errors so the UI
 *  can show a helpful setup message instead of a cryptic failure. */
export function isConfigError(err: unknown): boolean {
  const m = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  return /invalid api key|failed to fetch|apikey|jwt/i.test(m)
}
