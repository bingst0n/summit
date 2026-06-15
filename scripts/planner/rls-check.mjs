#!/usr/bin/env node
// Compare service-role vs anon-key visibility per table to map the live RLS state (read-only).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..')
const raw = readFileSync(resolve(root, '.env.local'), 'utf8')
const e = {}
for (const l of raw.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '').trim() }
const URL = e.NEXT_PUBLIC_SUPABASE_URL, SVC = e.SUPABASE_SERVICE_ROLE_KEY, ANON = e.NEXT_PUBLIC_SUPABASE_ANON_KEY
const tables = ['goals', 'daily_tasks', 'daily_logs', 'calendar_marks', 'trackers', 'conversations']
const probe = async (t, key) => {
  const r = await fetch(`${URL}/rest/v1/${t}?select=id`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' } })
  return `HTTP ${r.status} count=${(r.headers.get('content-range') || '?').split('/')[1] || '?'}`
}
console.log('\nTABLE             SERVICE-ROLE              ANON (browser/calendar)')
for (const t of tables) console.log(`${t.padEnd(16)}  ${(await probe(t, SVC)).padEnd(24)}  ${await probe(t, ANON)}`)
console.log('')
