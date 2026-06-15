#!/usr/bin/env node
// Rebuild Summit's schedule per the approved weekly-rhythm plan (Harrison, summer 2026).
// Out-of-band planner: Claude owns the weekly global re-plan; advisor handles daily check-ins.
//
// Usage:
//   node scripts/planner/apply.mjs                 # dry run — print week 1 + summary, write nothing
//   node scripts/planner/apply.mjs --all           # dry run — print every day
//   node scripts/planner/apply.mjs --week=2026-06-15  # print the 7 days from that date
//   node scripts/planner/apply.mjs --write         # snapshot, wipe incomplete tasks in range, insert new
//
// Plan rules:
//   - Fixed weekly rhythm, 2 deep-work goals/day; 3–4 hrs/day target.
//   - Daily habits: reading every day, gym 5x/wk, music 15 min daily from 6/27.
//   - Cleared days (genuine downtime): keep reading + gym, drop deep work + music.
//   - All 6 goals due 2026-08-31; work spread across the full window, tracker-grounded.

import { readFileSync, writeFileSync } from 'node:fs'
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
  console.error('Missing Supabase env in .env.local')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

// ---- plan window & cleared days ----
const START = '2026-06-15'
const END = '2026-08-31'
const CLEARED = new Set([
  '2026-06-15', '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19',
  '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26',
])

// weekday (0=Sun..6=Sat) -> two deep-work goals + which habits run
const TPL = {
  1: { deep: ['MATH', 'SAT'], gym: true, music: true },   // Mon
  2: { deep: ['AMC', 'CHINESE'], gym: true, music: false }, // Tue
  3: { deep: ['MATH', 'SAT'], gym: true, music: true },   // Wed
  4: { deep: ['AMC', 'CHINESE'], gym: true, music: false }, // Thu
  5: { deep: ['MATH', 'SAT'], gym: false, music: true },  // Fri
  6: { deep: ['AMC', 'CHINESE'], gym: false, music: false }, // Sat
  0: { deep: ['SAT', 'MATH'], gym: true, music: false },  // Sun
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const phaseOf = (date) => (date <= '2026-06-30' ? 'foundations' : date <= '2026-07-31' ? 'build' : 'test-ready')

// ---- content generators (progressive, tracker-grounded) ----
// Math: M21 is at 4/22 per tracker, so resume at part 5. Then M22 (15), M23 (8).
const MATH_UNITS = []
for (let p = 5; p <= 22; p++) MATH_UNITS.push(`M21 part ${p}`)
for (let p = 1; p <= 15; p++) MATH_UNITS.push(`M22 part ${p}`)
for (let p = 1; p <= 8; p++) MATH_UNITS.push(`M23 part ${p}`)
const MATH_REVIEW = [
  'Mixed review: redo the problems you flagged across M21–M23.',
  'Consolidation: re-derive M22’s key results from scratch, no notes.',
  'Timed set spanning M21–M23 — push for speed without losing accuracy.',
  'Deep-dive your weakest module section; rework 6–8 problems.',
]
function mathDesc(n) {
  const i = n * 2
  if (i < MATH_UNITS.length) {
    const span = MATH_UNITS[i + 1] ? `${MATH_UNITS[i]} and ${MATH_UNITS[i + 1]}` : MATH_UNITS[i]
    return `Work through ${span}, in order. Flag any sticking points for review.`
  }
  return MATH_REVIEW[n % MATH_REVIEW.length]
}

const SAT_CYCLE = [
  'Reading: one literature + one paired-passage set (~25 Qs); review every miss.',
  'Writing & Language: grammar + rhetoric set (~25 Qs); log recurring error types.',
  'Math (no-calc): algebra & problem-solving set (~20 Qs).',
  'Math (calc): advanced math & data set (~20 Qs).',
  'Reading: inference & tone-focused passages (~25 Qs).',
  'Full timed practice test — simulate real conditions; score all sections.',
  'Error review: categorize last test’s misses, drill your top-2 error types.',
]
const satDesc = (n, ph) =>
  SAT_CYCLE[n % SAT_CYCLE.length] +
  (ph === 'foundations' ? ' Method over speed.' : ph === 'build' ? ' Time each section.' : ' Strict test-day timing.')

const AMC_CYCLE = [
  'Algebra: 8 problems (factoring, inequalities, functions).',
  'Geometry: 8 problems (triangles, circles, coordinate geometry).',
  'Number theory: 8 problems (divisibility, modular arithmetic).',
  'Counting & probability: 8 problems.',
  'Mixed mid-range: AMC 10 problems 1–15, ~10 problems.',
  'Back-half: AMC 10 problems 16–25, 6–8 problems, multiple approaches each.',
  'Full AMC 10 mock (25 Q / 75 min); score and categorize errors.',
  'Error review + re-attempt the back-half problems you missed.',
]
function amcDesc(n, ph) {
  if (ph === 'test-ready' && n % 4 === 0) return 'AIME-intro problems (levels 1–8): solve 3, get comfortable with the integer-answer format.'
  return AMC_CYCLE[n % AMC_CYCLE.length]
}

const ZH_CYCLE = [
  'Speech: draft/refine one section; tighten word choice and transitions.',
  'Speaking: record a 2–3 min delivery, then review for fluency and tone.',
  'Idioms & vocab: 15–20 chengyu with short usage examples.',
  'Cultural knowledge: study a theme (history / geography / philosophy); make flashcards.',
  'Mock Q&A: answer 8–10 competition-style questions aloud, unscripted.',
]
function zhDesc(n, ph) {
  if (ph === 'test-ready' && n % 5 === 4) return 'Full mock: deliver your speech and field follow-up questions under realistic conditions.'
  return ZH_CYCLE[n % ZH_CYCLE.length]
}

const MUSIC_CYCLE = [
  'SightReadingFactory 15 min + drill two major scales in position.',
  'Leavitt Guitar Method: next exercises; focus on rhythm and tempo.',
  'Theory (Zenchi): scale construction; build M7/m7 chords from each degree.',
  'Modes & fretboard: compute modes from one parent scale; map across the neck.',
]
const musicDesc = (n) => MUSIC_CYCLE[n % MUSIC_CYCLE.length]

const GYM_CYCLE = [
  'Upper-body strength (~45 min).',
  'Lower-body strength (~45 min).',
  'Cardio / conditioning (~30–40 min).',
  'Full-body strength (~45 min).',
  'Core & mobility (~30 min).',
]
const gymDesc = (n) => GYM_CYCLE[n % GYM_CYCLE.length]
const READING = 'Read 25 pages.'

const genDeep = (key, n, ph) =>
  key === 'MATH' ? mathDesc(n) : key === 'SAT' ? satDesc(n, ph) : key === 'AMC' ? amcDesc(n, ph) : zhDesc(n, ph)

// ---- build the schedule ----
const goals = await (await fetch(`${URL}/rest/v1/goals?select=id,title`, { headers: H })).json()
const idFor = (frag) => {
  const g = goals.find((g) => g.title.toLowerCase().includes(frag))
  if (!g) throw new Error(`No goal matching "${frag}"`)
  return g.id
}
const GID = {
  MATH: idFor('math modules'), AMC: idFor('amc'), SAT: idFor('sat'),
  CHINESE: idFor('chinese'), MUSIC: idFor('music'), WELLNESS: idFor('wellness'),
}

const dates = []
for (let d = new Date(START + 'T00:00:00Z'); d <= new Date(END + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1)) {
  dates.push(d.toISOString().slice(0, 10))
}

const counters = { MATH: 0, SAT: 0, AMC: 0, CHINESE: 0, MUSIC: 0, GYM: 0 }
const rows = [] // {goal_id, date, description, completed:false} + _key for display
for (const date of dates) {
  const wd = new Date(date + 'T00:00:00Z').getUTCDay()
  const tpl = TPL[wd]
  const ph = phaseOf(date)
  const cleared = CLEARED.has(date)
  const push = (key, desc) => rows.push({ goal_id: GID[key], date, description: desc, completed: false, _key: key })

  if (!cleared) {
    for (const key of tpl.deep) push(key, genDeep(key, counters[key]++, ph))
  }
  // 15-min daily music habit, every day from 6/27 onward (off during the cleared stretch)
  if (date >= '2026-06-27') push('MUSIC', musicDesc(counters.MUSIC++))
  push('WELLNESS', READING)
  if (tpl.gym) push('WELLNESS', gymDesc(counters.GYM++))
}

// ---- output ----
const arg = process.argv.find((a) => a.startsWith('--week='))
const weekStart = arg ? arg.split('=')[1] : null
const printDay = (date) => {
  const wd = new Date(date + 'T00:00:00Z').getUTCDay()
  const tag = CLEARED.has(date) ? '  [CLEARED — habits only]' : ''
  console.log(`  ${DOW[wd]} ${date}${tag}`)
  for (const r of rows.filter((r) => r.date === date)) console.log(`      · (${r._key}) ${r.description}`)
}

if (process.argv.includes('--write')) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const existing = await (await fetch(`${URL}/rest/v1/daily_tasks?date=gte.${START}&date=lte.${END}&select=*`, { headers: H })).json()
  const snapPath = resolve(here, `snapshot-${stamp}.json`)
  writeFileSync(snapPath, JSON.stringify(existing, null, 2))
  const completed = existing.filter((t) => t.completed).length
  console.log(`Snapshot: ${existing.length} existing tasks saved -> ${snapPath} (${completed} completed, preserved)`)

  const del = await fetch(`${URL}/rest/v1/daily_tasks?completed=eq.false&date=gte.${START}&date=lte.${END}`, {
    method: 'DELETE', headers: { ...H, Prefer: 'return=representation' },
  })
  const deleted = await del.json()
  console.log(`Deleted ${deleted.length} incomplete tasks in range.`)

  const payload = rows.map(({ _key, ...r }) => r)
  for (let i = 0; i < payload.length; i += 100) {
    const chunk = payload.slice(i, i + 100)
    const res = await fetch(`${URL}/rest/v1/daily_tasks`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) throw new Error(`Insert failed: ${res.status} ${await res.text()}`)
  }
  console.log(`Inserted ${payload.length} new tasks (${START} .. ${END}).`)
  process.exit(0)
}

console.log(`\n=== DRY RUN — ${rows.length} tasks, ${START} .. ${END} (nothing written) ===`)
if (weekStart) {
  const wd = dates.filter((d) => d >= weekStart).slice(0, 7)
  console.log(`\nWeek of ${weekStart}:`)
  wd.forEach(printDay)
} else if (process.argv.includes('--all')) {
  dates.forEach(printDay)
} else {
  console.log(`\nWEEK 1 (6/15–6/21):`)
  dates.filter((d) => d <= '2026-06-21').forEach(printDay)
}

// weekly load summary (Mon-anchored)
const weekKey = (date) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}
// reading and gym share the Wellness goal — split them for the summary
const dkey = (r) => (r._key === 'WELLNESS' ? (r.description === READING ? 'READ' : 'GYM') : r._key)
const byWeek = {}
for (const r of rows) { const w = (byWeek[weekKey(r.date)] ??= {}); const k = dkey(r); w[k] = (w[k] || 0) + 1 }
console.log(`\nWEEKLY LOAD (sessions per goal):`)
console.log(`  week-of      MATH SAT AMC ZH  MUS READ GYM  total`)
for (const wk of Object.keys(byWeek).sort()) {
  const c = byWeek[wk]
  const g = (k) => String(c[k] || 0).padStart(2)
  const tot = Object.values(c).reduce((a, b) => a + b, 0)
  console.log(`  ${wk}    ${g('MATH')}  ${g('SAT')}  ${g('AMC')}  ${g('CHINESE')}  ${g('MUSIC')}  ${g('READ')}  ${g('GYM')}   ${String(tot).padStart(3)}`)
}
const totals = {}
for (const r of rows) { const k = dkey(r); totals[k] = (totals[k] || 0) + 1 }
console.log(`\nTOTAL sessions over summer:`, totals)
console.log('')
