#!/usr/bin/env node
// Read-only snapshot of Summit's live Supabase state, for out-of-band planning.
// Parses .env.local itself (service-role key never touches the shell/argv).
// Usage: node scripts/planner/state.mjs [--json]

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..', '..')

function loadEnv() {
  const raw = readFileSync(resolve(repoRoot, '.env.local'), 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return env
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

async function q(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`)
  return res.json()
}

// ET "today" — the app's day boundary is America/New_York.
const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }))
const iso = (d) => d.toISOString().slice(0, 10)
const shift = (days) => {
  const d = new Date(etNow)
  d.setDate(d.getDate() + days)
  return iso(d)
}
const TODAY = iso(etNow)

const [goals, trackers, marks, tasks, logs] = await Promise.all([
  q('goals?select=*&order=created_at'),
  q('trackers?select=*&order=created_at'),
  q('calendar_marks?select=*&order=date'),
  q(`daily_tasks?select=*&date=gte.${shift(-7)}&date=lte.${shift(45)}&order=date`),
  q(`daily_logs?select=*&date=gte.${shift(-21)}&order=date.desc`),
])

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ TODAY, goals, trackers, marks, tasks, logs }, null, 2))
  process.exit(0)
}

const gName = (id) => goals.find((g) => g.id === id)?.title ?? '(unknown goal)'
const byDate = {}
for (const t of tasks) (byDate[t.date] ??= []).push(t)

console.log(`\n=== SUMMIT STATE — today is ${TODAY} (ET) ===\n`)

console.log(`GOALS (${goals.length})`)
for (const g of goals) {
  const daysLeft = Math.round((new Date(g.deadline) - new Date(TODAY)) / 86400000)
  console.log(`  • [${g.type}] ${g.title} — due ${g.deadline} (${daysLeft}d) — id:${g.id}`)
  if (g.description) console.log(`      ${g.description}`)
}

console.log(`\nTRACKERS (${trackers.length})`)
for (const t of trackers) {
  const pct = t.total ? Math.round((t.current / t.total) * 100) : 0
  console.log(
    `  • ${gName(t.goal_id)} → ${t.name}: ${t.current}/${t.total} ${t.unit ?? ''} (${pct}%) [${t.kind}] tid:${t.id}`
  )
}

console.log(`\nLIGHT DAYS (${marks.length}): ${marks.map((m) => m.date).join(', ') || 'none'}`)

console.log(`\nTASK SCHEDULE (${tasks.length} tasks, ${shift(-7)} .. ${shift(45)})`)
for (const date of Object.keys(byDate).sort()) {
  const list = byDate[date]
  const done = list.filter((t) => t.completed).length
  const marker = date === TODAY ? ' <-- TODAY' : date < TODAY ? ' (past)' : ''
  console.log(`  ${date}  [${done}/${list.length} done]${marker}`)
  for (const t of list) {
    console.log(`      ${t.completed ? '✓' : '·'} (${gName(t.goal_id)}) ${t.description}`)
  }
}

console.log(`\nRECENT LOGS (${logs.length}, last 21d, newest first)`)
for (const l of logs) {
  console.log(`  ${l.date} (${gName(l.goal_id)}): ${l.notes}`)
}
console.log('')
