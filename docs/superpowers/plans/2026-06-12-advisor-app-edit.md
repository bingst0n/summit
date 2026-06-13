# Advisor App-Edit Capability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One generic `<app_edit>` advisor tag + executor route giving the advisor full editing parity (tasks, light days, trackers, goals, on-demand redistribution) behind a single confirm button, plus automatic task check-off from check-in recaps and a season-start clamp on schedule generation.

**Architecture:** Pure validation/types in new `lib/appEdit.ts`; tag parsing in `lib/advisorParse.ts`; the adjustment loop extracted to `lib/adjust.ts` (shared by `/api/adjust` and the new `redistribute` op); a sequential best-effort executor at `app/api/app-edit/route.ts` calling new thin `lib/db.ts` helpers; advisor context gains a 14-day upcoming-tasks section; one new confirm button in `AdvisorChat.tsx`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase via `lib/db.ts`, Anthropic SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-12-advisor-app-edit-design.md`

**Conventions that bite:**
- Dates: always `today()`/`localDate()`/`addDays()` from `lib/utils.ts` — never `new Date().toISOString()` for dates.
- Route handlers: `{ params }: { params: Promise<{ id: string }> }`, error JSON `{ error: String(err) }`, `console.error('Verb noun error:', err)`.
- Tests: Vitest, colocated `lib/<name>.test.ts`. Baseline before this plan: **99 passing**.
- Tags: extractors return null on missing/malformed; `stripTags` must strip every tag.

---

### Task 1: Pure op validation + upcoming summary (`lib/appEdit.ts`)

**Files:**
- Create: `lib/appEdit.ts`
- Test: `lib/appEdit.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/appEdit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateOp, filterByMatch, buildUpcomingSummary, type ValidateCtx } from './appEdit'
import type { DailyTask, Goal } from './types'

const ctx: ValidateCtx = { goalIds: new Set(['g1']), trackerIds: new Set(['t1']) }

const task = (over: Partial<DailyTask> = {}): DailyTask => ({
  id: 'tk1',
  goal_id: 'g1',
  date: '2026-06-13',
  description: 'M21 parts 10-12',
  completed: false,
  created_at: '',
  ...over,
})

describe('validateOp: task_delete / task_shift', () => {
  it('accepts a range delete for all goals (goal_id null)', () => {
    expect(validateOp({ op: 'task_delete', goal_id: null, from: '2026-06-10', to: '2026-06-14' }, ctx)).toEqual({
      ok: true,
      value: { op: 'task_delete', goal_id: null, from: '2026-06-10', to: '2026-06-14', match: undefined },
    })
  })
  it('accepts a scoped delete with match', () => {
    const res = validateOp({ op: 'task_delete', goal_id: 'g1', from: '2026-06-13', to: '2026-06-13', match: ' SAT ' }, ctx)
    expect(res.ok && res.value).toEqual({ op: 'task_delete', goal_id: 'g1', from: '2026-06-13', to: '2026-06-13', match: 'SAT' })
  })
  it('rejects unknown goal, bad dates, inverted range', () => {
    expect(validateOp({ op: 'task_delete', goal_id: 'nope', from: '2026-06-10', to: '2026-06-14' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_delete', goal_id: null, from: 'June 10', to: '2026-06-14' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_delete', goal_id: null, from: '2026-06-15', to: '2026-06-14' }, ctx).ok).toBe(false)
  })
  it('accepts a shift and bounds days', () => {
    expect(validateOp({ op: 'task_shift', goal_id: null, from: '2026-06-12', to: '2026-06-14', days: 3 }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'task_shift', goal_id: null, from: '2026-06-12', to: '2026-06-14', days: 0 }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_shift', goal_id: null, from: '2026-06-12', to: '2026-06-14', days: 2.5 }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_shift', goal_id: null, from: '2026-06-12', to: '2026-06-14', days: 91 }, ctx).ok).toBe(false)
  })
})

describe('validateOp: task_add / task_edit / task_complete', () => {
  it('accepts and trims task_add', () => {
    const res = validateOp({ op: 'task_add', goal_id: 'g1', date: '2026-06-20', description: ' Timed SAT section ' }, ctx)
    expect(res.ok && res.value).toEqual({ op: 'task_add', goal_id: 'g1', date: '2026-06-20', description: 'Timed SAT section' })
  })
  it('task_add requires a known goal, valid date, non-empty description', () => {
    expect(validateOp({ op: 'task_add', goal_id: null, date: '2026-06-20', description: 'x' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_add', goal_id: 'g1', date: 'tomorrow', description: 'x' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'task_add', goal_id: 'g1', date: '2026-06-20', description: '  ' }, ctx).ok).toBe(false)
  })
  it('accepts task_edit and task_complete', () => {
    expect(validateOp({ op: 'task_edit', goal_id: 'g1', date: '2026-06-13', match: 'M21', description: 'New text' }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'task_complete', goal_id: 'g1', date: '2026-06-13', completed: true }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'task_complete', goal_id: 'g1', date: '2026-06-13', completed: 'yes' }, ctx).ok).toBe(false)
  })
})

describe('validateOp: light_day / tracker_edit / goal_edit / redistribute', () => {
  it('accepts light_day, rejects non-boolean', () => {
    expect(validateOp({ op: 'light_day', date: '2026-06-20', light: true }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'light_day', date: '2026-06-20', light: 'yes' }, ctx).ok).toBe(false)
  })
  it('tracker_edit requires a known tracker and at least one field', () => {
    expect(validateOp({ op: 'tracker_edit', tracker_id: 't1', total: 25 }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'tracker_edit', tracker_id: 't1' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'tracker_edit', tracker_id: 'nope', total: 25 }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'tracker_edit', tracker_id: 't1', name: '  ' }, ctx).ok).toBe(false)
  })
  it('goal_edit requires a known goal and at least one field, valid deadline', () => {
    expect(validateOp({ op: 'goal_edit', goal_id: 'g1', deadline: '2026-08-15' }, ctx).ok).toBe(true)
    expect(validateOp({ op: 'goal_edit', goal_id: 'g1' }, ctx).ok).toBe(false)
    expect(validateOp({ op: 'goal_edit', goal_id: 'g1', deadline: 'August' }, ctx).ok).toBe(false)
  })
  it('redistribute requires a known goal; note optional and trimmed', () => {
    const res = validateOp({ op: 'redistribute', goal_id: 'g1', note: ' lighter weekends ' }, ctx)
    expect(res.ok && res.value).toEqual({ op: 'redistribute', goal_id: 'g1', note: 'lighter weekends' })
    expect(validateOp({ op: 'redistribute', goal_id: 'zzz' }, ctx).ok).toBe(false)
  })
  it('rejects unknown ops and junk', () => {
    expect(validateOp({ op: 'drop_table' }, ctx).ok).toBe(false)
    expect(validateOp(null, ctx).ok).toBe(false)
    expect(validateOp('delete stuff', ctx).ok).toBe(false)
  })
})

describe('filterByMatch', () => {
  const tasks = [task(), task({ id: 'tk2', description: 'SAT reading drill' })]
  it('case-insensitive substring filter', () => {
    expect(filterByMatch(tasks, 'sat')).toHaveLength(1)
    expect(filterByMatch(tasks, 'sat')[0].id).toBe('tk2')
  })
  it('no match returns all', () => {
    expect(filterByMatch(tasks)).toHaveLength(2)
    expect(filterByMatch(tasks, undefined)).toHaveLength(2)
  })
})

describe('buildUpcomingSummary', () => {
  const goals = [{ id: 'g1', title: 'Math modules' } as Goal]
  it('formats one line per task with [done] marker', () => {
    const out = buildUpcomingSummary(goals, [task(), task({ id: 'tk2', date: '2026-06-14', description: 'M21 parts 13-15', completed: true })])
    expect(out).toBe(
      '2026-06-13 (Math modules): M21 parts 10-12\n' +
      '2026-06-14 (Math modules): M21 parts 13-15 [done]'
    )
  })
  it('handles empty', () => {
    expect(buildUpcomingSummary(goals, [])).toBe('No upcoming tasks.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/appEdit.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `lib/appEdit.ts`**

```ts
import type { DailyTask, Goal } from './types'

/**
 * The advisor's generic edit vocabulary. One <app_edit> tag carries an ordered
 * list of these ops; /api/app-edit validates each against live ids and
 * executes them best-effort (a failed op never aborts the rest).
 */
export interface OpTaskDelete { op: 'task_delete'; goal_id: string | null; from: string; to: string; match?: string }
export interface OpTaskShift { op: 'task_shift'; goal_id: string | null; from: string; to: string; days: number; match?: string }
export interface OpTaskAdd { op: 'task_add'; goal_id: string; date: string; description: string }
export interface OpTaskEdit { op: 'task_edit'; goal_id: string; date: string; match?: string; description: string }
export interface OpTaskComplete { op: 'task_complete'; goal_id: string; date: string; match?: string; completed: boolean }
export interface OpLightDay { op: 'light_day'; date: string; light: boolean }
export interface OpTrackerEdit { op: 'tracker_edit'; tracker_id: string; name?: string; total?: number; current?: number; unit?: string }
export interface OpGoalEdit { op: 'goal_edit'; goal_id: string; title?: string; description?: string; deadline?: string }
export interface OpRedistribute { op: 'redistribute'; goal_id: string; note?: string }

export type AppEditOp =
  | OpTaskDelete
  | OpTaskShift
  | OpTaskAdd
  | OpTaskEdit
  | OpTaskComplete
  | OpLightDay
  | OpTrackerEdit
  | OpGoalEdit
  | OpRedistribute

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_SHIFT_DAYS = 90

export interface ValidateCtx {
  goalIds: Set<string>
  trackerIds: Set<string>
}

type Validated = { ok: true; value: AppEditOp } | { ok: false; error: string }

function isDate(v: unknown): v is string {
  return typeof v === 'string' && DATE_RE.test(v)
}

function optMatch(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/**
 * Shape-validate one op against live ids. Tracker number rules (clamping,
 * steps-integer total) are deferred to normalizeTrackerPatch at execution.
 */
export function validateOp(input: unknown, ctx: ValidateCtx): Validated {
  if (!input || typeof input !== 'object') return { ok: false, error: 'op must be an object' }
  const o = input as Record<string, unknown>

  const optionalGoalId = (): { ok: boolean; id: string | null } => {
    if (o.goal_id === null || o.goal_id === undefined) return { ok: true, id: null }
    if (typeof o.goal_id === 'string' && ctx.goalIds.has(o.goal_id)) return { ok: true, id: o.goal_id }
    return { ok: false, id: null }
  }
  const requiredGoalId = (): string | null =>
    typeof o.goal_id === 'string' && ctx.goalIds.has(o.goal_id) ? o.goal_id : null

  switch (o.op) {
    case 'task_delete':
    case 'task_shift': {
      const g = optionalGoalId()
      if (!g.ok) return { ok: false, error: `${o.op}: unknown goal_id` }
      if (!isDate(o.from) || !isDate(o.to)) return { ok: false, error: `${o.op}: from/to must be YYYY-MM-DD` }
      if (o.from > o.to) return { ok: false, error: `${o.op}: from is after to` }
      if (o.op === 'task_shift') {
        if (
          typeof o.days !== 'number' ||
          !Number.isInteger(o.days) ||
          o.days === 0 ||
          Math.abs(o.days) > MAX_SHIFT_DAYS
        ) {
          return { ok: false, error: 'task_shift: days must be a non-zero integer within ±90' }
        }
        return { ok: true, value: { op: 'task_shift', goal_id: g.id, from: o.from, to: o.to, days: o.days, match: optMatch(o.match) } }
      }
      return { ok: true, value: { op: 'task_delete', goal_id: g.id, from: o.from, to: o.to, match: optMatch(o.match) } }
    }
    case 'task_add': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'task_add: unknown goal_id' }
      if (!isDate(o.date)) return { ok: false, error: 'task_add: date must be YYYY-MM-DD' }
      if (typeof o.description !== 'string' || !o.description.trim()) return { ok: false, error: 'task_add: description required' }
      return { ok: true, value: { op: 'task_add', goal_id: gid, date: o.date, description: o.description.trim() } }
    }
    case 'task_edit': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'task_edit: unknown goal_id' }
      if (!isDate(o.date)) return { ok: false, error: 'task_edit: date must be YYYY-MM-DD' }
      if (typeof o.description !== 'string' || !o.description.trim()) return { ok: false, error: 'task_edit: description required' }
      return { ok: true, value: { op: 'task_edit', goal_id: gid, date: o.date, match: optMatch(o.match), description: o.description.trim() } }
    }
    case 'task_complete': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'task_complete: unknown goal_id' }
      if (!isDate(o.date)) return { ok: false, error: 'task_complete: date must be YYYY-MM-DD' }
      if (typeof o.completed !== 'boolean') return { ok: false, error: 'task_complete: completed must be boolean' }
      return { ok: true, value: { op: 'task_complete', goal_id: gid, date: o.date, match: optMatch(o.match), completed: o.completed } }
    }
    case 'light_day': {
      if (!isDate(o.date)) return { ok: false, error: 'light_day: date must be YYYY-MM-DD' }
      if (typeof o.light !== 'boolean') return { ok: false, error: 'light_day: light must be boolean' }
      return { ok: true, value: { op: 'light_day', date: o.date, light: o.light } }
    }
    case 'tracker_edit': {
      if (typeof o.tracker_id !== 'string' || !ctx.trackerIds.has(o.tracker_id)) {
        return { ok: false, error: 'tracker_edit: unknown tracker_id' }
      }
      const value: OpTrackerEdit = { op: 'tracker_edit', tracker_id: o.tracker_id }
      if (o.name !== undefined) {
        if (typeof o.name !== 'string' || !o.name.trim()) return { ok: false, error: 'tracker_edit: name must be non-empty' }
        value.name = o.name.trim()
      }
      if (o.total !== undefined) {
        if (typeof o.total !== 'number') return { ok: false, error: 'tracker_edit: total must be a number' }
        value.total = o.total
      }
      if (o.current !== undefined) {
        if (typeof o.current !== 'number') return { ok: false, error: 'tracker_edit: current must be a number' }
        value.current = o.current
      }
      if (o.unit !== undefined) {
        if (typeof o.unit !== 'string') return { ok: false, error: 'tracker_edit: unit must be a string' }
        value.unit = o.unit
      }
      if (value.name === undefined && value.total === undefined && value.current === undefined && value.unit === undefined) {
        return { ok: false, error: 'tracker_edit: no fields to change' }
      }
      return { ok: true, value }
    }
    case 'goal_edit': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'goal_edit: unknown goal_id' }
      const value: OpGoalEdit = { op: 'goal_edit', goal_id: gid }
      if (o.title !== undefined) {
        if (typeof o.title !== 'string' || !o.title.trim()) return { ok: false, error: 'goal_edit: title must be non-empty' }
        value.title = o.title.trim()
      }
      if (o.description !== undefined) {
        if (typeof o.description !== 'string') return { ok: false, error: 'goal_edit: description must be a string' }
        value.description = o.description
      }
      if (o.deadline !== undefined) {
        if (!isDate(o.deadline)) return { ok: false, error: 'goal_edit: deadline must be YYYY-MM-DD' }
        value.deadline = o.deadline
      }
      if (value.title === undefined && value.description === undefined && value.deadline === undefined) {
        return { ok: false, error: 'goal_edit: no fields to change' }
      }
      return { ok: true, value }
    }
    case 'redistribute': {
      const gid = requiredGoalId()
      if (!gid) return { ok: false, error: 'redistribute: unknown goal_id' }
      const note = typeof o.note === 'string' && o.note.trim() ? o.note.trim() : undefined
      return { ok: true, value: { op: 'redistribute', goal_id: gid, note } }
    }
    default:
      return { ok: false, error: `unknown op "${String(o.op)}"` }
  }
}

/** Case-insensitive substring filter on task descriptions; no match = all. */
export function filterByMatch<T extends { description: string }>(tasks: T[], match?: string): T[] {
  if (!match) return tasks
  const m = match.toLowerCase()
  return tasks.filter(t => t.description.toLowerCase().includes(m))
}

/** Compact per-task listing for the advisor's upcoming-schedule context. */
export function buildUpcomingSummary(goals: Goal[], tasks: DailyTask[]): string {
  if (tasks.length === 0) return 'No upcoming tasks.'
  const titleById = new Map(goals.map(g => [g.id, g.title]))
  return tasks
    .map(t => `${t.date} (${titleById.get(t.goal_id) ?? 'unknown goal'}): ${t.description}${t.completed ? ' [done]' : ''}`)
    .join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/appEdit.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Full suite + commit**

Run `pnpm vitest run` — all green (99 baseline + new). Then:

```bash
git add lib/appEdit.ts lib/appEdit.test.ts
git commit -m "feat: app-edit op types, validation, and upcoming-tasks summary

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Tag parsing (`lib/advisorParse.ts`)

**Files:**
- Modify: `lib/advisorParse.ts`
- Test: `lib/advisorParse.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Add `extractAppEdit` to the import at the top of `lib/advisorParse.test.ts`, then append:

```ts
describe('extractAppEdit', () => {
  it('parses summary + ops', () => {
    const text =
      'Here is the plan.\n<app_edit>{"summary":"Delete pre-season tasks","ops":[{"op":"task_delete","goal_id":null,"from":"2026-06-10","to":"2026-06-14"}]}</app_edit>'
    expect(extractAppEdit(text)).toEqual({
      summary: 'Delete pre-season tasks',
      ops: [{ op: 'task_delete', goal_id: null, from: '2026-06-10', to: '2026-06-14' }],
    })
  })
  it('returns null when absent, malformed, missing summary, or empty ops', () => {
    expect(extractAppEdit('no tag')).toBeNull()
    expect(extractAppEdit('<app_edit>not json</app_edit>')).toBeNull()
    expect(extractAppEdit('<app_edit>{"ops":[{"op":"light_day"}]}</app_edit>')).toBeNull()
    expect(extractAppEdit('<app_edit>{"summary":"x","ops":[]}</app_edit>')).toBeNull()
  })
})

describe('extractCheckIn done flag', () => {
  it('passes done through when boolean', () => {
    const text = '<check_in>[{"goal_id":"g1","notes":"finished today","done":true}]</check_in>'
    expect(extractCheckIn(text)).toEqual([{ goal_id: 'g1', notes: 'finished today', done: true }])
  })
  it('drops a non-boolean done', () => {
    const text = '<check_in>[{"goal_id":"g1","notes":"x","done":"yes"}]</check_in>'
    expect(extractCheckIn(text)).toEqual([{ goal_id: 'g1', notes: 'x' }])
  })
})

describe('stripTags (app_edit)', () => {
  it('removes the app_edit tag', () => {
    expect(stripTags('Before <app_edit>{"summary":"x","ops":[1]}</app_edit> after')).toBe('Before  after')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/advisorParse.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `lib/advisorParse.ts`:

(a) Change the `CheckInEntry` interface to:

```ts
export interface CheckInEntry {
  goal_id: string
  notes: string
  /** Recap says the user finished this goal's planned work today — check the task(s) off. */
  done?: boolean
}
```

(b) In `extractCheckIn`, replace the `return valid.length > 0 ? valid : null` tail with a mapping that whitelists fields (so junk keys and non-boolean `done` never leak through):

```ts
    const cleaned: CheckInEntry[] = valid.map(e => ({
      goal_id: e.goal_id,
      notes: e.notes,
      ...(typeof (e as Record<string, unknown>).done === 'boolean'
        ? { done: (e as Record<string, unknown>).done as boolean }
        : {}),
    }))
    return cleaned.length > 0 ? cleaned : null
```

(c) Append the new extractor:

```ts
export interface ParsedAppEdit {
  summary: string
  /** Raw op objects — validated server-side by /api/app-edit, not at parse time. */
  ops: unknown[]
}

export function extractAppEdit(text: string): ParsedAppEdit | null {
  const match = text.match(/<app_edit>([\s\S]*?)<\/app_edit>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) return null
    if (!Array.isArray(parsed.ops) || parsed.ops.length === 0) return null
    return { summary: parsed.summary.trim(), ops: parsed.ops }
  } catch {
    return null
  }
}
```

(d) Add to `stripTags` (before `.trim()`):

```ts
    .replace(/<app_edit>[\s\S]*?<\/app_edit>/g, '')
```

- [ ] **Step 4: Run tests, full suite, commit**

Run: `pnpm vitest run` — all green.

```bash
git add lib/advisorParse.ts lib/advisorParse.test.ts
git commit -m "feat: app_edit tag extractor + check_in done flag

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: DB helpers + adjustment extraction

**Files:**
- Modify: `lib/db.ts`
- Create: `lib/adjust.ts`
- Modify: `app/api/adjust/route.ts`

No new unit tests (thin Supabase wrappers + a pure-move refactor; behavior covered by typecheck and the existing suite).

- [ ] **Step 1: Add task/goal helpers to `lib/db.ts`**

Add `addDays` to the utils import at the top:

```ts
import { localDate, addDays } from './utils'
```

Add `filterByMatch` import:

```ts
import { filterByMatch } from './appEdit'
```

Insert after the existing `getTaskStats` function:

```ts
/** Delete incomplete tasks in [from, to] (all goals when goalId is null). Returns count. */
export async function deleteTasksInRange(
  goalId: string | null,
  from: string,
  to: string,
  match?: string
): Promise<number> {
  let q = db().from('daily_tasks').select('id, description, completed').gte('date', from).lte('date', to)
  if (goalId) q = q.eq('goal_id', goalId)
  const { data } = await q
  const targets = filterByMatch((data ?? []).filter(t => !t.completed), match)
  if (targets.length === 0) return 0
  const { error } = await db().from('daily_tasks').delete().in('id', targets.map(t => t.id))
  if (error) throw error
  return targets.length
}

/** Shift incomplete tasks in [from, to] by `days`. Returns count. */
export async function shiftTasks(
  goalId: string | null,
  from: string,
  to: string,
  days: number,
  match?: string
): Promise<number> {
  let q = db().from('daily_tasks').select('id, date, description, completed').gte('date', from).lte('date', to)
  if (goalId) q = q.eq('goal_id', goalId)
  const { data } = await q
  const targets = filterByMatch((data ?? []).filter(t => !t.completed), match)
  for (const t of targets) {
    const { error } = await db().from('daily_tasks').update({ date: addDays(t.date, days) }).eq('id', t.id)
    if (error) throw error
  }
  return targets.length
}

export async function createDailyTask(goalId: string, date: string, description: string) {
  const { error } = await db().from('daily_tasks').insert({ goal_id: goalId, date, description })
  if (error) throw error
}

export async function getTasksForGoalDate(goalId: string, date: string): Promise<DailyTask[]> {
  const { data } = await db()
    .from('daily_tasks')
    .select('*')
    .eq('goal_id', goalId)
    .eq('date', date)
    .order('created_at')
  return data ?? []
}

export async function updateTaskDescription(id: string, description: string) {
  const { error } = await db().from('daily_tasks').update({ description }).eq('id', id)
  if (error) throw error
}

export async function setTasksCompleted(ids: string[], completed: boolean) {
  if (ids.length === 0) return
  const { error } = await db().from('daily_tasks').update({ completed }).in('id', ids)
  if (error) throw error
}
```

Insert after `deleteGoal`:

```ts
export async function updateGoal(
  id: string,
  patch: Partial<Pick<Goal, 'title' | 'description' | 'deadline'>>
) {
  const { error } = await db().from('goals').update(patch).eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Create `lib/adjust.ts` (extraction of the adjust route body)**

```ts
import { anthropic } from './claude'
import { ADJUSTMENT_SYSTEM } from './prompts'
import {
  getGoal,
  getLogsForGoal,
  getFutureTasksForGoal,
  getTrackersForGoal,
  replaceFutureTasks,
} from './db'
import { nextStepLabel } from './tracker'

export type AdjustmentResult = { adjusted: number } | { skipped: string }

/**
 * Redistribute a goal's future tasks (tomorrow onward) via the adjustment LLM.
 * `instruction` is an explicit user request (from the app_edit redistribute op)
 * that the model follows even when the logs suggest otherwise.
 */
export async function runAdjustment(goalId: string, instruction?: string): Promise<AdjustmentResult> {
  const [goal, logs, futureTasks, trackers] = await Promise.all([
    getGoal(goalId),
    getLogsForGoal(goalId, 7),
    getFutureTasksForGoal(goalId),
    getTrackersForGoal(goalId),
  ])

  if (!goal || goal.type !== 'continuous' || futureTasks.length === 0) {
    return { skipped: 'nothing to adjust' }
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: ADJUSTMENT_SYSTEM,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        goal,
        logs,
        futureTasks,
        trackers: trackers.map(t => ({
          name: t.name,
          kind: t.kind,
          current: t.current,
          total: t.total,
          unit: t.unit,
          next: nextStepLabel(t),
        })),
        ...(instruction ? { instruction } : {}),
      }),
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    console.error('Failed to parse adjustment JSON:', text)
    return { skipped: 'unparseable' }
  }

  // Validate shape before touching the DB — a malformed adjustment must not be
  // allowed to wipe the existing schedule via the delete-then-insert.
  const valid = Array.isArray(parsed)
    ? parsed.filter(
        (t): t is { date: string; description: string } =>
          !!t &&
          typeof t.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
          typeof t.description === 'string' &&
          t.description.trim().length > 0
      )
    : []

  if (valid.length === 0) {
    console.error('Adjustment produced no valid tasks; keeping existing schedule.')
    return { skipped: 'no valid tasks' }
  }

  await replaceFutureTasks(goalId, valid)
  return { adjusted: valid.length }
}
```

- [ ] **Step 3: Replace `app/api/adjust/route.ts` with the thin wrapper**

The full new file (response shapes preserved exactly — `{ok:true,count}` / `{ok:true,skipped}` / 400 / 500):

```ts
import { NextResponse } from 'next/server'
import { runAdjustment } from '@/lib/adjust'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const goal_id = body?.goal_id
    if (!goal_id || typeof goal_id !== 'string') {
      return NextResponse.json({ error: 'goal_id required' }, { status: 400 })
    }
    const instruction = typeof body?.instruction === 'string' ? body.instruction : undefined

    const res = await runAdjustment(goal_id, instruction)
    if ('adjusted' in res) {
      return NextResponse.json({ ok: true, count: res.adjusted })
    }
    return NextResponse.json({ ok: true, skipped: res.skipped })
  } catch (err) {
    console.error('Adjust error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

Note: the old route returned `{ok: true}` with no `skipped` key for the not-continuous/no-future-tasks case; the new wrapper returns `{ok: true, skipped: 'nothing to adjust'}`. The only consumer (`AdvisorChat.runCheckIn`) checks `res.ok` (HTTP status) only, so this is safe.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && pnpm vitest run && pnpm lint`
Expected: all clean.

```bash
git add lib/db.ts lib/adjust.ts app/api/adjust/route.ts
git commit -m "feat: task/goal edit db helpers + extract runAdjustment with instruction support

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Executor route (`app/api/app-edit/route.ts`)

**Files:**
- Create: `app/api/app-edit/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextResponse } from 'next/server'
import {
  getGoals,
  getTrackers,
  getTracker,
  updateTracker,
  updateGoal,
  setLightDays,
  deleteTasksInRange,
  shiftTasks,
  createDailyTask,
  getTasksForGoalDate,
  updateTaskDescription,
  setTasksCompleted,
} from '@/lib/db'
import { validateOp, filterByMatch, type AppEditOp } from '@/lib/appEdit'
import { normalizeTrackerPatch } from '@/lib/tracker'
import { runAdjustment } from '@/lib/adjust'
import type { Goal } from '@/lib/types'

export const maxDuration = 60 // redistribute ops call the adjustment LLM

const MAX_OPS = 25

interface OpResult {
  ok: boolean
  detail: string
}

async function executeOp(op: AppEditOp): Promise<OpResult> {
  switch (op.op) {
    case 'task_delete': {
      const n = await deleteTasksInRange(op.goal_id, op.from, op.to, op.match)
      return { ok: true, detail: `deleted ${n} task${n === 1 ? '' : 's'}` }
    }
    case 'task_shift': {
      const n = await shiftTasks(op.goal_id, op.from, op.to, op.days, op.match)
      return { ok: true, detail: `moved ${n} task${n === 1 ? '' : 's'}` }
    }
    case 'task_add': {
      await createDailyTask(op.goal_id, op.date, op.description)
      return { ok: true, detail: `added task on ${op.date}` }
    }
    case 'task_edit': {
      const matches = filterByMatch(await getTasksForGoalDate(op.goal_id, op.date), op.match)
      if (matches.length === 0) return { ok: false, detail: `task_edit: no matching task on ${op.date}` }
      if (matches.length > 1) return { ok: false, detail: `task_edit: ${matches.length} tasks match on ${op.date} — be more specific` }
      await updateTaskDescription(matches[0].id, op.description)
      return { ok: true, detail: `edited task on ${op.date}` }
    }
    case 'task_complete': {
      const matches = filterByMatch(await getTasksForGoalDate(op.goal_id, op.date), op.match)
      if (matches.length === 0) return { ok: false, detail: `task_complete: no matching task on ${op.date}` }
      if (op.match && matches.length > 1) return { ok: false, detail: `task_complete: ${matches.length} tasks match — be more specific` }
      await setTasksCompleted(matches.map(t => t.id), op.completed)
      return { ok: true, detail: `marked ${matches.length} task${matches.length === 1 ? '' : 's'} ${op.completed ? 'done' : 'not done'}` }
    }
    case 'light_day': {
      await setLightDays([op.date], op.light)
      return { ok: true, detail: `${op.light ? 'marked' : 'unmarked'} ${op.date} as a light day` }
    }
    case 'tracker_edit': {
      const existing = await getTracker(op.tracker_id)
      if (!existing) return { ok: false, detail: 'tracker_edit: tracker not found' }
      const patch: Record<string, unknown> = {}
      if (op.name !== undefined) patch.name = op.name
      if (op.total !== undefined) patch.total = op.total
      if (op.current !== undefined) patch.current = op.current
      if (op.unit !== undefined) patch.unit = op.unit
      const res = normalizeTrackerPatch(patch, existing)
      if (!res.ok) return { ok: false, detail: `tracker_edit: ${res.error}` }
      await updateTracker(op.tracker_id, res.value)
      return { ok: true, detail: `updated tracker "${existing.name}"` }
    }
    case 'goal_edit': {
      const patch: Partial<Pick<Goal, 'title' | 'description' | 'deadline'>> = {}
      if (op.title !== undefined) patch.title = op.title
      if (op.description !== undefined) patch.description = op.description
      if (op.deadline !== undefined) patch.deadline = op.deadline
      await updateGoal(op.goal_id, patch)
      return { ok: true, detail: 'updated goal' }
    }
    case 'redistribute': {
      const res = await runAdjustment(op.goal_id, op.note)
      if ('adjusted' in res) {
        return { ok: true, detail: `rescheduled ${res.adjusted} task${res.adjusted === 1 ? '' : 's'}` }
      }
      return { ok: false, detail: `redistribute: ${res.skipped}` }
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const ops = body?.ops
    if (!Array.isArray(ops) || ops.length === 0) {
      return NextResponse.json({ error: 'ops array required' }, { status: 400 })
    }
    if (ops.length > MAX_OPS) {
      return NextResponse.json({ error: `too many ops (max ${MAX_OPS})` }, { status: 400 })
    }

    const [goals, trackers] = await Promise.all([getGoals(), getTrackers()])
    const ctx = {
      goalIds: new Set(goals.map(g => g.id)),
      trackerIds: new Set(trackers.map(t => t.id)),
    }

    // Sequential, best-effort: a failed op records an error and the rest continue.
    const results: OpResult[] = []
    for (const raw of ops) {
      const v = validateOp(raw, ctx)
      if (!v.ok) {
        results.push({ ok: false, detail: v.error })
        continue
      }
      try {
        results.push(await executeOp(v.value))
      } catch (err) {
        console.error('App-edit op error:', err)
        results.push({ ok: false, detail: String(err) })
      }
    }

    const applied = results.filter(r => r.ok).length
    return NextResponse.json({ results, applied, failed: results.length - applied })
  } catch (err) {
    console.error('App-edit error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc --noEmit && pnpm vitest run && pnpm build 2>&1 | tail -8`
Expected: clean; route table includes `/api/app-edit`.

```bash
git add app/api/app-edit
git commit -m "feat: app-edit executor route (sequential best-effort ops)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Prompt updates (`lib/prompts.ts`)

**Files:**
- Modify: `lib/prompts.ts`

After this task `npx tsc --noEmit` will error ONLY at the `ADVISOR_SYSTEM` call site in `app/api/advisor/chat/route.ts` (missing `upcoming`) — fixed in Task 6.

- [ ] **Step 1: `ADVISOR_SYSTEM` — ctx field + upcoming section**

Add `upcoming: string` to the ctx type (after `todayTasks: string`). Insert after the `## Today's Tasks\n${ctx.todayTasks}` block:

```
## Upcoming Tasks (next 14 days)
${ctx.upcoming}
```

- [ ] **Step 2: `ADVISOR_SYSTEM` — check_in `done` flag**

In the **Log a check-in:** block, change the example JSON line from:

```
[{"goal_id":"<id from the Goals list>","notes":"<what they did or didn't do toward this goal>"}]
```

to:

```
[{"goal_id":"<id from the Goals list>","notes":"<what they did or didn't do toward this goal>","done":true}]
```

and add this bullet after the existing "- Use the exact ids..." bullet:

```
- Set "done":true only when they clearly finished that goal's planned work for the day — their scheduled task gets checked off automatically. Partial progress: notes only, omit done.
```

- [ ] **Step 3: `ADVISOR_SYSTEM` — app_edit capability block**

Insert AFTER the entire **Delete a tracker:** block and BEFORE the **Delete a goal:** block:

```
**Edit the schedule, calendar, trackers, or goals:** When the user asks you to change anything in the app — delete or move scheduled tasks, add a one-off task, reword a task, check something off, mark a light day, edit a tracker, change a goal's title/description/deadline, or rebalance a goal's schedule — describe the changes in plain language, then at the very END of your message append ONE app_edit tag containing every change:
<app_edit>
{"summary":"Delete all tasks before Jun 15 and mark Jun 20 a light day",
 "ops":[
  {"op":"task_delete","goal_id":null,"from":"2026-06-10","to":"2026-06-14"},
  {"op":"light_day","date":"2026-06-20","light":true}
 ]}
</app_edit>
Operations (exact field names; dates YYYY-MM-DD; goal_id from Goals, tracker_id = tid from Trackers):
- {"op":"task_delete","goal_id":<id or null = all goals>,"from":"...","to":"...","match":"<optional substring>"} — deletes incomplete tasks in the date range.
- {"op":"task_shift","goal_id":<id or null>,"from":"...","to":"...","days":<non-zero integer>,"match":"<optional>"} — moves incomplete tasks by that many days.
- {"op":"task_add","goal_id":"<id>","date":"...","description":"..."} — adds a one-off task.
- {"op":"task_edit","goal_id":"<id>","date":"...","match":"<substring>","description":"<new text>"} — rewords exactly one task.
- {"op":"task_complete","goal_id":"<id>","date":"...","match":"<optional>","completed":true} — without match, applies to all of that goal's tasks that day.
- {"op":"light_day","date":"...","light":true}
- {"op":"tracker_edit","tracker_id":"<tid>","name":"...","total":21,"current":5,"unit":"..."} — any subset of fields.
- {"op":"goal_edit","goal_id":"<id>","title":"...","description":"...","deadline":"YYYY-MM-DD"} — any subset of fields.
- {"op":"redistribute","goal_id":"<id>","note":"<optional guidance>"} — re-spreads the goal's future tasks (tomorrow onward); use it after deletes/shifts or when asked to rebalance.
Rules:
- The user confirms with a button before anything is applied — propose, don't ask permission.
- summary is one short sentence naming what will change.
- Completed tasks are never deleted or moved.
- Include match whenever a goal has more than one task on the target day.
- app_edit is for explicit edit requests. Recaps of what already happened still use check_in / tracker_update, never app_edit.
```

- [ ] **Step 4: `ADJUSTMENT_SYSTEM` — instruction field**

In the "You receive:" list, after the `- trackers: ...` line, add:

```
- instruction: an explicit user request for this redistribution (optional). When present, follow it even if the logs suggest otherwise.
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit` — exactly ONE error (chat route missing `upcoming`). Run `pnpm vitest run` — all green.

```bash
git add lib/prompts.ts
git commit -m "feat: app_edit capability, upcoming-tasks context, check-in done flag in prompts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Chat route wiring + season-start clamp

**Files:**
- Modify: `app/api/advisor/chat/route.ts`
- Modify: `app/api/goals/generate-schedule/route.ts`

- [ ] **Step 1: Chat route — upcoming tasks context**

(a) Add `getTasksInRange` to the `@/lib/db` import list and add:

```ts
import { buildUpcomingSummary } from '@/lib/appEdit'
```

(b) Extend the parallel fetch (add as the last element):

```ts
const [goals, todayTasks, recentLogs, lightDays, state, trackers, upcomingTasks] = await Promise.all([
  getGoals(),
  getTodayTasks(date),
  getRecentLogs(7),
  getLightDays(date, horizonStr),
  getConversationState(),
  getTrackers(),
  getTasksInRange(localDate(1), localDate(14)),
])
```

(c) After the `trackersSummary` line, add:

```ts
const upcomingSummary = buildUpcomingSummary(goals, upcomingTasks)
```

(d) Add `upcoming: upcomingSummary,` to the `ADVISOR_SYSTEM({...})` call (after `todayTasks: tasksSummary,`).

- [ ] **Step 2: Season-start clamp in `app/api/goals/generate-schedule/route.ts`**

(a) Extend the utils import:

```ts
import { today as etToday, localDate, SEASON } from '@/lib/utils'
```

(b) Replace:

```ts
  const today = etToday()
  const horizonStr = localDate(30)
  const scheduleEnd = goalData.deadline < horizonStr ? goalData.deadline : horizonStr
```

with:

```ts
  // Never schedule before the season starts — goals created pre-season begin on Day 1.
  const today = etToday()
  const startDate = today < SEASON.start ? SEASON.start : today
  const horizonStr = localDate(30)
  const scheduleEnd = goalData.deadline < horizonStr ? goalData.deadline : horizonStr
```

(c) In `userPrompt`, change `Start date: ${today}` to `Start date: ${startDate}`.

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit && pnpm vitest run && pnpm build 2>&1 | tail -5`
Expected: all clean.

```bash
git add app/api/advisor/chat/route.ts app/api/goals/generate-schedule/route.ts
git commit -m "feat: upcoming-tasks advisor context + season-start schedule clamp

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Client — confirm button + check-in auto check-off (`components/AdvisorChat.tsx`)

**Files:**
- Modify: `components/AdvisorChat.tsx`

- [ ] **Step 1: Imports, derivation, state**

Add `extractAppEdit` to the `@/lib/advisorParse` import. Below `pendingTrackerDelete` add:

```ts
const pendingAppEdit = extractAppEdit(lastAssistantContent)
```

Add state next to `trackerError`:

```ts
const [appEditApplying, setAppEditApplying] = useState(false)
const [appEditError, setAppEditError] = useState<string | null>(null)
```

- [ ] **Step 2: Check-in auto check-off**

In `runCheckIn`, directly after the check-in POST success check (`if (!res.ok) throw new Error(...)`) and BEFORE the adjust fan-out, insert:

```ts
      // Recap said these goals' planned work is finished — check today's tasks
      // off before adjustment runs, so redistribution sees the truth.
      const doneGoals = checkIn.filter(c => c.done).map(c => c.goal_id)
      if (doneGoals.length > 0) {
        try {
          const tasksRes = await fetch(`/api/tasks?start=${today()}&end=${today()}`)
          const { tasks } = await tasksRes.json()
          const targets = (tasks ?? []).filter(
            (t: { id: string; goal_id: string; completed: boolean }) =>
              doneGoals.includes(t.goal_id) && !t.completed
          )
          await Promise.allSettled(
            targets.map((t: { id: string }) =>
              fetch(`/api/tasks/${t.id}/complete`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed: true }),
              })
            )
          )
        } catch {
          // Best-effort: the log is already saved; check-off failure must not block adjustment.
        }
      }
```

- [ ] **Step 3: Apply handler**

Add next to `deleteTracker`:

```ts
async function applyAppEdit() {
  if (!pendingAppEdit) return
  setAppEditApplying(true)
  setAppEditError(null)
  try {
    const res = await fetch('/api/app-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: pendingAppEdit.ops }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Server error ${res.status}`)
    }
    const { results, applied, failed } = await res.json()
    router.refresh()
    const firstFail = (results as Array<{ ok: boolean; detail: string }> | undefined)?.find(r => !r.ok)
    setMessages(prev => [
      ...prev,
      {
        role: 'assistant',
        content:
          failed === 0
            ? `✓ Applied ${applied} change${applied === 1 ? '' : 's'}.`
            : `Applied ${applied} of ${applied + failed} change${applied + failed === 1 ? '' : 's'} — ${firstFail?.detail ?? 'some changes failed'}`,
      },
    ])
  } catch (err) {
    setAppEditError(err instanceof Error ? err.message : String(err))
  } finally {
    setAppEditApplying(false)
  }
}
```

- [ ] **Step 4: Confirm-button JSX**

After the existing "Delete tracker button" block:

```tsx
{/* Apply app-edit button */}
{pendingAppEdit && !streaming && (
  <div className="flex flex-col items-center gap-2 pt-2">
    <p className="text-mut text-xs text-center max-w-[300px]">{pendingAppEdit.summary}</p>
    {appEditError && <p className="text-warn text-xs text-center">{appEditError}</p>}
    <button
      onClick={applyAppEdit}
      disabled={appEditApplying}
      className="bg-moss hover:brightness-110 active:brightness-90 disabled:opacity-50 text-moss-ink font-semibold px-8 py-3 rounded-2xl transition-colors"
    >
      {appEditApplying
        ? 'Applying…'
        : appEditError
          ? 'Retry'
          : `Apply ${pendingAppEdit.ops.length} change${pendingAppEdit.ops.length === 1 ? '' : 's'} ✓`}
    </button>
  </div>
)}
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && pnpm vitest run && pnpm lint && pnpm build 2>&1 | tail -3`
Expected: all clean.

```bash
git add components/AdvisorChat.tsx
git commit -m "feat: app-edit confirm button + check-in auto check-off in advisor chat

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Full verification + smoke test

**Files:** none new.

- [ ] **Step 1: Full suite**

Run: `pnpm test && pnpm lint && npx tsc --noEmit && pnpm build`
Expected: all green; build route table includes `/api/app-edit`.

- [ ] **Step 2: Dev-server smoke (real env — `.env.local` is present in the worktree)**

Start `pnpm dev --port 3101` in the background, then:

- `curl -s -o /dev/null -w "%{http_code}" localhost:3101/` → 200; same for `/progress`, `/calendar`, `/advisor`.
- `curl -s -X POST localhost:3101/api/app-edit -H 'Content-Type: application/json' -d '{"bogus":true}'` → 400 `ops array required`.
- `curl -s -X POST localhost:3101/api/app-edit -H 'Content-Type: application/json' -d '{"ops":[{"op":"task_delete","goal_id":"00000000-0000-0000-0000-000000000000","from":"2026-06-10","to":"2026-06-11"}]}'` → 200 with `{"results":[{"ok":false,"detail":"task_delete: unknown goal_id"}],"applied":0,"failed":1}`.
- First check `curl -s localhost:3101/api/calendar-marks` and pick a date NOT already marked (default `2026-08-30`). Then: `curl -s -X POST localhost:3101/api/app-edit -H 'Content-Type: application/json' -d '{"ops":[{"op":"light_day","date":"2026-08-30","light":true},{"op":"light_day","date":"2026-08-30","light":false}]}'` → 200, `applied: 2` (mark + immediately unmark — net no-op only because the date started unmarked).

Kill the dev server when done.

- [ ] **Step 3: Commit any fixes**

If smoke surfaced fixes, commit them. Final state: clean tree, all checks green.
