#!/usr/bin/env node
/**
 * One-command production Supabase setup for Fluent.
 *
 * Usage:
 *   node scripts/setup-prod.mjs \
 *     --url https://YOURREF.supabase.co \
 *     --secret sb_secret_...            # secret (service) API key — used to verify + create the first user
 *     --db "postgresql://postgres:PASSWORD@db.YOURREF.supabase.co:5432/postgres"  # OR --token sbp_... (Management API)
 *     [--email you@example.com --password yourpassword]   # optional: create a confirmed auth user
 *
 * What it does:
 *   1. Verifies the keys actually belong to the project URL.
 *   2. Applies supabase/migrations/0001_init.sql (via direct Postgres connection, or the
 *      Management API if you pass --token instead of --db).
 *   3. Optionally creates a pre-confirmed auth user.
 */
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) => (a.startsWith('--') ? [a.slice(2), arr[i + 1]] : null)).filter(Boolean),
)
const { url, secret, db, token, email, password } = args
if (!url || !secret || (!db && !token)) {
  console.error('Missing args. See header of this file for usage.')
  process.exit(1)
}
const ref = new URL(url).hostname.split('.')[0]
const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/0001_init.sql'), 'utf8')

// 1. verify keys
const health = await fetch(`${url}/auth/v1/health`, { headers: { apikey: secret } })
if (!health.ok) {
  console.error(`✗ The secret key is not valid for ${url} (HTTP ${health.status}). Re-copy both keys from that project's dashboard → Settings → API keys.`)
  process.exit(1)
}
console.log('✓ secret key valid for project', ref)

// 2. apply schema
if (token) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    console.error('✗ Management API schema apply failed:', res.status, await res.text())
    process.exit(1)
  }
  console.log('✓ schema + RLS applied via Management API')
} else {
  const { default: pg } = await import('pg').catch(() => {
    console.error('Run: npm i pg')
    process.exit(1)
  })
  const client = new pg.Client({ connectionString: db, ssl: { rejectUnauthorized: false } })
  await client.connect()
  await client.query(sql)
  await client.end()
  console.log('✓ schema + RLS applied via direct connection')
}

// 3. optional: create confirmed user
if (email && password) {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  const body = await res.json()
  if (res.ok) console.log('✓ auth user created:', body.email)
  else console.error('✗ user creation failed:', body.msg ?? body.message ?? body)
}
console.log('Done. The deployed app will work as soon as src/config.ts has this project URL + publishable key.')
