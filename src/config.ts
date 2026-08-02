// Public client configuration. The publishable key is safe to ship in the
// frontend — all data access is protected by Postgres Row Level Security.
const DEFAULT_URL = 'https://wpkjjaqmsnsqvolwfjkk.supabase.co'
const DEFAULT_KEY = 'sb_publishable_0IjiQClCmABIaWthUFbd4w_vtnsn32x'

// Overridable for local development / testing without a rebuild.
export const SUPABASE_URL: string =
  localStorage.getItem('fluent.supabaseUrl') || import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL

export const SUPABASE_KEY: string =
  localStorage.getItem('fluent.supabaseKey') || import.meta.env.VITE_SUPABASE_KEY || DEFAULT_KEY

export const APP_NAME = 'Fluent'
export const APP_TAGLINE = 'Save anything. Read it faster.'
