#!/usr/bin/env node
// Verify the live schedule is complete and well-formed (read-only).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')
function loadEnv() {
  const raw = readFileSync(resolve(repoRoot, '.env.local'), 'utf8')
  const e = {}
  for (const l of raw.split('\n')) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return e
}
const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const START = '2026-06-15', END = '2026-08-31'
const CLEARED = new Set(['2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26'])

const goals = await (await fetch(`${URL}/rest/v1/goals?select=id,title`, { headers: H })).json()
const gName = (id) => goals.find((g) => g.id === id)?.title ?? '?'
const tasks = await (await fetch(`${URL}/rest/v1/daily_tasks?date=gte.${START}&date=lte.${END}&select=*&order=date`, { headers: H })).json()

console.log(`\n=== SCHEDULE VERIFICATION (${START} .. ${END}) ===`)
console.log(`Total tasks: ${tasks.length}`)

const byDate = {}
for (const t of tasks) (byDate[t.date] ??= []).push(t)

const gaps = []
for (let d = new Date(START + 'T00:00:00Z'); d <= new Date(END + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
  const s = d.toISOString().slice(0, 10)
  if (!byDate[s]) gaps.push(s)
}
console.log(`Days with NO tasks: ${gaps.length}${gaps.length ? ' -> ' + gaps.join(', ') : ' ✓'}`)

const counts = Object.keys(byDate).map((d) => byDate[d].length)
console.log(`Tasks/day: min ${Math.min(...counts)}, max ${Math.max(...counts)}`)
const over = Object.keys(byDate).filter((d) => byDate[d].length > 6)
console.log(`Days with >6 tasks: ${over.length}${over.length ? ' -> ' + over.join(', ') : ' ✓'}`)

// cleared days should have only Daily Wellness tasks
const badCleared = [...CLEARED].filter((d) => (byDate[d] || []).some((t) => !gName(t.goal_id).includes('Wellness')))
console.log(`Cleared days with deep work (should be none): ${badCleared.length}${badCleared.length ? ' -> ' + badCleared.join(', ') : ' ✓'}`)

const perGoal = {}
for (const t of tasks) perGoal[gName(t.goal_id)] = (perGoal[gName(t.goal_id)] || 0) + 1
console.log('Per-goal totals:', perGoal)

const math = tasks.filter((t) => gName(t.goal_id).includes('Math')).map((t) => t.description)
const covered = new Set(math.join(' ').match(/M2[123] part \d+/g) || [])
const missing = []
for (let p = 5; p <= 22; p++) if (!covered.has(`M21 part ${p}`)) missing.push(`M21 part ${p}`)
for (let p = 1; p <= 15; p++) if (!covered.has(`M22 part ${p}`)) missing.push(`M22 part ${p}`)
for (let p = 1; p <= 8; p++) if (!covered.has(`M23 part ${p}`)) missing.push(`M23 part ${p}`)
console.log(`Math parts M21p5–M23p8 missing: ${missing.length}${missing.length ? ' -> ' + missing.join(', ') : ' ✓ (all 41 covered)'}`)

// Confirm the browser's anon key can read tasks (RLS disabled) — this is the path the calendar UI uses
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ar = await fetch(`${URL}/rest/v1/daily_tasks?date=eq.${START}&select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })
console.log(`Anon-key read (calendar's path) for ${START}: HTTP ${ar.status} -> ${ar.ok ? (await ar.json()).length + ' tasks visible ✓' : 'FAILED: ' + (await ar.text())}`)
console.log('')
