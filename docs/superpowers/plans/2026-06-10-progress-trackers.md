# Progress Trackers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new Progress tab with per-goal steps/counter trackers, editable by the user and the advisor LLM (via the existing text-tag protocol), wired into the check-in → adjustment loop, with course-URL ingestion.

**Architecture:** New `trackers` Supabase table + pure helpers in `lib/tracker.ts`; REST routes under `/api/trackers`; advisor gains three tags (`tracker_create` confirm-button, `tracker_update` automatic, `tracker_delete` confirm-button) parsed in `lib/advisorParse.ts`; the chat route fetches a pasted URL server-side and injects page text ephemerally; `/progress` renders trackers grouped by goal with optimistic edits.

**Tech Stack:** Next.js 15 App Router (async `params`/`searchParams`), TypeScript, Tailwind tokens (`bg`, `panel`, `line`, `ember`, `moss`, `mut`, `ice`), Supabase via `lib/db.ts`, Anthropic SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-progress-trackers-design.md`

**Conventions that bite:**
- Route handlers type dynamic segments as `{ params }: { params: Promise<{ id: string }> }` and `await params`.
- All date logic uses `today()`/`localDate()` from `lib/utils.ts` — never `new Date().toISOString()` for dates.
- `db()` in `lib/db.ts` picks service-role on the server; reads return `data ?? []`, writes throw on error.
- Tests: Vitest, `import { describe, it, expect } from 'vitest'`, colocated as `lib/<name>.test.ts`.
- Run tests with `pnpm test` (or `pnpm vitest run lib/tracker.test.ts` for one file).
- **The `trackers` table does not exist in Supabase yet** (SQL staged in `dummy.txt` at the repo root, run by Harrison in the morning). Dev-server smoke tests will show empty tracker lists and failing tracker writes — that is expected; everything else must work.

---

### Task 1: Tracker type + pure helpers (`lib/tracker.ts`)

**Files:**
- Modify: `lib/types.ts` (append after `CalendarMark`)
- Create: `lib/tracker.ts`
- Test: `lib/tracker.test.ts`

- [ ] **Step 1: Add the Tracker type to `lib/types.ts`**

Append after the `CalendarMark` interface:

```ts
export type TrackerKind = 'steps' | 'counter'

export interface Tracker {
  id: string
  goal_id: string
  name: string
  kind: TrackerKind
  /** steps: number of steps (integer). counter: the target value. */
  total: number
  /** steps: last completed position (0 = not started). counter: current value. */
  current: number
  /** counter: "tests", "problems", "%". steps: the step noun, default "parts". */
  unit: string | null
  /** steps only: optional labels, length === total. */
  step_labels: string[] | null
  /** Set when built from a pasted course link. */
  source_url: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Write the failing tests**

Create `lib/tracker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  trackerFraction,
  blendedPct,
  pipTapTarget,
  clampCurrent,
  nextStepLabel,
  normalizeNewTracker,
  normalizeTrackerPatch,
  buildTrackersSummary,
} from './tracker'
import type { Goal, Tracker } from './types'

const steps = (over: Partial<Tracker> = {}): Tracker => ({
  id: 't1',
  goal_id: 'g1',
  name: 'Module 21',
  kind: 'steps',
  total: 22,
  current: 12,
  unit: 'parts',
  step_labels: null,
  source_url: null,
  created_at: '',
  updated_at: '',
  ...over,
})

const counter = (over: Partial<Tracker> = {}): Tracker => ({
  ...steps({ id: 't2', name: 'Practice tests', kind: 'counter', total: 10, current: 4, unit: 'tests' }),
  ...over,
})

describe('trackerFraction', () => {
  it('divides current by total', () => {
    expect(trackerFraction({ current: 12, total: 22 })).toBeCloseTo(12 / 22)
  })
  it('clamps to [0, 1]', () => {
    expect(trackerFraction({ current: 15, total: 10 })).toBe(1)
    expect(trackerFraction({ current: -3, total: 10 })).toBe(0)
  })
  it('returns 0 for non-positive total', () => {
    expect(trackerFraction({ current: 5, total: 0 })).toBe(0)
  })
})

describe('blendedPct', () => {
  it('averages fractions equally and rounds', () => {
    // 0.5 and 1.0 -> 75
    expect(blendedPct([{ current: 5, total: 10 }, { current: 4, total: 4 }])).toBe(75)
  })
  it('returns 0 for no trackers', () => {
    expect(blendedPct([])).toBe(0)
  })
})

describe('pipTapTarget', () => {
  it('tapping a pip sets position to it', () => {
    expect(pipTapTarget(12, 15)).toBe(15)
    expect(pipTapTarget(12, 3)).toBe(3)
  })
  it('tapping the current pip steps back one', () => {
    expect(pipTapTarget(12, 12)).toBe(11)
  })
  it('tapping pip 1 at position 1 clears to 0', () => {
    expect(pipTapTarget(1, 1)).toBe(0)
  })
})

describe('clampCurrent', () => {
  it('clamps into [0, total]', () => {
    expect(clampCurrent(-2, 10)).toBe(0)
    expect(clampCurrent(12, 10)).toBe(10)
    expect(clampCurrent(7, 10)).toBe(7)
  })
})

describe('nextStepLabel', () => {
  it('names the next part from the unit noun', () => {
    expect(nextStepLabel(steps())).toBe('part 13')
  })
  it('uses the label when step_labels exist', () => {
    const t = steps({ total: 3, current: 1, step_labels: ['Intro', 'Limits', 'Derivatives'] })
    expect(nextStepLabel(t)).toBe('Limits')
  })
  it('returns null when complete or not steps', () => {
    expect(nextStepLabel(steps({ current: 22 }))).toBeNull()
    expect(nextStepLabel(counter())).toBeNull()
  })
})

describe('normalizeNewTracker', () => {
  const goalIds = new Set(['g1'])

  it('accepts a minimal counter', () => {
    const res = normalizeNewTracker(
      { goal_id: 'g1', name: ' Practice tests ', kind: 'counter', total: 10, unit: 'tests' },
      goalIds
    )
    expect(res).toEqual({
      ok: true,
      value: {
        goal_id: 'g1',
        name: 'Practice tests',
        kind: 'counter',
        total: 10,
        current: 0,
        unit: 'tests',
        step_labels: null,
        source_url: null,
      },
    })
  })
  it('defaults steps unit to parts and derives total from labels', () => {
    const res = normalizeNewTracker(
      { goal_id: 'g1', name: 'Units', kind: 'steps', total: 99, step_labels: ['a', 'b', 'c'] },
      goalIds
    )
    expect(res.ok && res.value.total).toBe(3)
    expect(res.ok && res.value.unit).toBe('parts')
    expect(res.ok && res.value.step_labels).toEqual(['a', 'b', 'c'])
  })
  it('accepts steps without labels when total is an integer', () => {
    const res = normalizeNewTracker({ goal_id: 'g1', name: 'M21', kind: 'steps', total: 22 }, goalIds)
    expect(res.ok && res.value.total).toBe(22)
  })
  it('rejects non-integer steps total', () => {
    const res = normalizeNewTracker({ goal_id: 'g1', name: 'M21', kind: 'steps', total: 2.5 }, goalIds)
    expect(res.ok).toBe(false)
  })
  it('clamps current into range', () => {
    const res = normalizeNewTracker(
      { goal_id: 'g1', name: 'x', kind: 'counter', total: 10, current: 99 },
      goalIds
    )
    expect(res.ok && res.value.current).toBe(10)
  })
  it('rejects unknown goal, bad kind, empty name, missing total', () => {
    expect(normalizeNewTracker({ goal_id: 'nope', name: 'x', kind: 'steps', total: 5 }, goalIds).ok).toBe(false)
    expect(normalizeNewTracker({ goal_id: 'g1', name: 'x', kind: 'list', total: 5 }, goalIds).ok).toBe(false)
    expect(normalizeNewTracker({ goal_id: 'g1', name: '  ', kind: 'steps', total: 5 }, goalIds).ok).toBe(false)
    expect(normalizeNewTracker({ goal_id: 'g1', name: 'x', kind: 'counter' }, goalIds).ok).toBe(false)
    expect(normalizeNewTracker(null, goalIds).ok).toBe(false)
  })
})

describe('normalizeTrackerPatch', () => {
  const existing = { kind: 'steps' as const, total: 22, current: 12 }

  it('passes through a current update, clamped', () => {
    expect(normalizeTrackerPatch({ current: 13 }, existing)).toEqual({ ok: true, value: { current: 13 } })
    expect(normalizeTrackerPatch({ current: 99 }, existing)).toEqual({ ok: true, value: { current: 22 } })
  })
  it('re-clamps current when total shrinks', () => {
    expect(normalizeTrackerPatch({ total: 10 }, existing)).toEqual({ ok: true, value: { total: 10, current: 10 } })
  })
  it('trims name and rejects empty', () => {
    expect(normalizeTrackerPatch({ name: ' New ' }, existing)).toEqual({ ok: true, value: { name: 'New' } })
    expect(normalizeTrackerPatch({ name: '  ' }, existing).ok).toBe(false)
  })
  it('rejects non-integer steps total and junk input', () => {
    expect(normalizeTrackerPatch({ total: 2.5 }, existing).ok).toBe(false)
    expect(normalizeTrackerPatch({}, existing).ok).toBe(false)
    expect(normalizeTrackerPatch(null, existing).ok).toBe(false)
  })
})

describe('buildTrackersSummary', () => {
  const goals = [
    { id: 'g1', title: 'Math Modules' } as Goal,
    { id: 'g2', title: 'SAT Prep' } as Goal,
  ]

  it('groups by goal with tids, state, and next label', () => {
    const out = buildTrackersSummary(goals, [steps(), counter({ goal_id: 'g2' })])
    expect(out).toBe(
      'Math Modules:\n' +
        '- [tid:t1] Module 21 (steps, 12/22 parts, next: part 13)\n' +
        'SAT Prep:\n' +
        '- [tid:t2] Practice tests (counter, 4/10 tests)'
    )
  })
  it('says so when there are none', () => {
    expect(buildTrackersSummary(goals, [])).toBe('No trackers.')
  })
  it('skips goals without trackers', () => {
    expect(buildTrackersSummary(goals, [steps()])).not.toContain('SAT Prep')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run lib/tracker.test.ts`
Expected: FAIL — `Cannot find module './tracker'` (or equivalent).

- [ ] **Step 4: Implement `lib/tracker.ts`**

```ts
import type { Goal, Tracker, TrackerKind } from './types'

/** Fraction complete, clamped to [0, 1]. */
export function trackerFraction(t: Pick<Tracker, 'current' | 'total'>): number {
  if (t.total <= 0) return 0
  return Math.min(Math.max(t.current / t.total, 0), 1)
}

/** Unweighted mean of tracker fractions as a whole percent. */
export function blendedPct(trackers: Array<Pick<Tracker, 'current' | 'total'>>): number {
  if (trackers.length === 0) return 0
  const sum = trackers.reduce((acc, t) => acc + trackerFraction(t), 0)
  return Math.round((sum / trackers.length) * 100)
}

/**
 * Pip-tap semantics: tapping pip n means "I'm through n" — except tapping the
 * pip that is already the position steps back one, so the tracker can be
 * walked down to zero.
 */
export function pipTapTarget(current: number, tapped: number): number {
  return tapped === current ? tapped - 1 : tapped
}

export function clampCurrent(current: number, total: number): number {
  return Math.min(Math.max(current, 0), total)
}

/** Human name of the next step ("part 13", or the real label when known). */
export function nextStepLabel(
  t: Pick<Tracker, 'kind' | 'current' | 'total' | 'step_labels' | 'unit'>
): string | null {
  if (t.kind !== 'steps' || t.current >= t.total) return null
  const idx = Math.floor(t.current)
  const label = t.step_labels?.[idx]
  if (label) return label
  const noun = (t.unit ?? 'parts').replace(/s$/, '')
  return `${noun} ${idx + 1}`
}

export type NewTracker = Omit<Tracker, 'id' | 'created_at' | 'updated_at'>

type Normalized<T> = { ok: true; value: T } | { ok: false; error: string }

/** Validate + canonicalize tracker input (from the advisor tag or the manual form). */
export function normalizeNewTracker(input: unknown, goalIds: Set<string>): Normalized<NewTracker> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'tracker must be an object' }
  const t = input as Record<string, unknown>

  if (typeof t.goal_id !== 'string' || !goalIds.has(t.goal_id)) {
    return { ok: false, error: 'unknown goal_id' }
  }
  if (typeof t.name !== 'string' || t.name.trim().length === 0) {
    return { ok: false, error: 'name required' }
  }
  if (t.kind !== 'steps' && t.kind !== 'counter') {
    return { ok: false, error: 'kind must be "steps" or "counter"' }
  }
  const kind = t.kind as TrackerKind

  const labels =
    kind === 'steps' &&
    Array.isArray(t.step_labels) &&
    t.step_labels.length > 0 &&
    t.step_labels.every(l => typeof l === 'string')
      ? (t.step_labels as string[])
      : null

  let total = typeof t.total === 'number' && Number.isFinite(t.total) ? t.total : NaN
  if (labels) total = labels.length
  if (!Number.isFinite(total) || total < 1) return { ok: false, error: 'total must be a number >= 1' }
  if (kind === 'steps' && !Number.isInteger(total)) {
    return { ok: false, error: 'steps total must be an integer' }
  }

  const rawCurrent = typeof t.current === 'number' && Number.isFinite(t.current) ? t.current : 0
  const unit =
    typeof t.unit === 'string' && t.unit.trim()
      ? t.unit.trim()
      : kind === 'steps'
        ? 'parts'
        : null

  return {
    ok: true,
    value: {
      goal_id: t.goal_id,
      name: t.name.trim(),
      kind,
      total,
      current: clampCurrent(rawCurrent, total),
      unit,
      step_labels: labels,
      source_url: typeof t.source_url === 'string' && t.source_url ? t.source_url : null,
    },
  }
}

export type TrackerPatch = Partial<Pick<Tracker, 'current' | 'name' | 'total' | 'unit'>>

/** Validate a PATCH body against the existing row; clamps current to the (new) total. */
export function normalizeTrackerPatch(
  input: unknown,
  existing: Pick<Tracker, 'kind' | 'total' | 'current'>
): Normalized<TrackerPatch> {
  if (!input || typeof input !== 'object') return { ok: false, error: 'patch must be an object' }
  const p = input as Record<string, unknown>
  const out: TrackerPatch = {}

  if (p.total !== undefined) {
    if (typeof p.total !== 'number' || !Number.isFinite(p.total) || p.total < 1) {
      return { ok: false, error: 'total must be a number >= 1' }
    }
    if (existing.kind === 'steps' && !Number.isInteger(p.total)) {
      return { ok: false, error: 'steps total must be an integer' }
    }
    out.total = p.total
  }
  if (p.name !== undefined) {
    if (typeof p.name !== 'string' || p.name.trim().length === 0) {
      return { ok: false, error: 'name must be non-empty' }
    }
    out.name = p.name.trim()
  }
  if (p.unit !== undefined) {
    if (p.unit !== null && typeof p.unit !== 'string') {
      return { ok: false, error: 'unit must be a string or null' }
    }
    out.unit = typeof p.unit === 'string' && p.unit.trim() ? p.unit.trim() : null
  }
  if (p.current !== undefined) {
    if (typeof p.current !== 'number' || !Number.isFinite(p.current)) {
      return { ok: false, error: 'current must be a number' }
    }
    out.current = clampCurrent(p.current, out.total ?? existing.total)
  } else if (out.total !== undefined) {
    out.current = clampCurrent(existing.current, out.total)
  }

  if (Object.keys(out).length === 0) return { ok: false, error: 'no valid fields in patch' }
  return { ok: true, value: out }
}

/** Per-goal tracker listing for system prompts ([tid:] ids the advisor echoes back). */
export function buildTrackersSummary(goals: Goal[], trackers: Tracker[]): string {
  if (trackers.length === 0) return 'No trackers.'
  const lines: string[] = []
  for (const g of goals) {
    const ts = trackers.filter(t => t.goal_id === g.id)
    if (ts.length === 0) continue
    lines.push(`${g.title}:`)
    for (const t of ts) {
      const next = nextStepLabel(t)
      const unitStr = t.unit ? ` ${t.unit}` : ''
      lines.push(
        `- [tid:${t.id}] ${t.name} (${t.kind}, ${t.current}/${t.total}${unitStr}${next ? `, next: ${next}` : ''})`
      )
    }
  }
  return lines.join('\n')
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run lib/tracker.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/tracker.ts lib/tracker.test.ts
git commit -m "feat: Tracker type and pure tracker helpers"
```

---

### Task 2: Advisor tag extractors

**Files:**
- Modify: `lib/advisorParse.ts`
- Test: `lib/advisorParse.test.ts` (append new describe blocks)

- [ ] **Step 1: Write the failing tests**

Append to `lib/advisorParse.test.ts` (extend the import at the top of the file to include the new functions):

```ts
import {
  extractGoalData,
  extractDeleteGoal,
  extractCheckIn,
  extractTrackerCreate,
  extractTrackerUpdate,
  extractTrackerDelete,
  stripTags,
} from './advisorParse'
```

```ts
describe('extractTrackerCreate', () => {
  it('parses a tracker list', () => {
    const text =
      'Setting these up.\n<tracker_create>[{"goal_id":"g1","name":"Module 21","kind":"steps","total":22}]</tracker_create>'
    expect(extractTrackerCreate(text)).toEqual([
      { goal_id: 'g1', name: 'Module 21', kind: 'steps', total: 22 },
    ])
  })
  it('accepts step_labels in place of total', () => {
    const text =
      '<tracker_create>[{"goal_id":"g1","name":"Units","kind":"steps","step_labels":["a","b"]}]</tracker_create>'
    expect(extractTrackerCreate(text)).toEqual([
      { goal_id: 'g1', name: 'Units', kind: 'steps', step_labels: ['a', 'b'] },
    ])
  })
  it('drops malformed entries, null when all malformed or no tag', () => {
    const text =
      '<tracker_create>[{"goal_id":"g1","name":"ok","kind":"counter","total":5},{"kind":"counter"}]</tracker_create>'
    expect(extractTrackerCreate(text)).toEqual([
      { goal_id: 'g1', name: 'ok', kind: 'counter', total: 5 },
    ])
    expect(extractTrackerCreate('<tracker_create>[{"kind":"x"}]</tracker_create>')).toBeNull()
    expect(extractTrackerCreate('no tag')).toBeNull()
    expect(extractTrackerCreate('<tracker_create>nope</tracker_create>')).toBeNull()
  })
})

describe('extractTrackerUpdate', () => {
  it('parses updates', () => {
    const text = 'Logged!\n<tracker_update>[{"tracker_id":"t1","current":13}]</tracker_update>'
    expect(extractTrackerUpdate(text)).toEqual([{ tracker_id: 't1', current: 13 }])
  })
  it('drops entries without a numeric current or string id', () => {
    const text =
      '<tracker_update>[{"tracker_id":"t1","current":"13"},{"tracker_id":"t2","current":4}]</tracker_update>'
    expect(extractTrackerUpdate(text)).toEqual([{ tracker_id: 't2', current: 4 }])
  })
  it('returns null when absent or malformed', () => {
    expect(extractTrackerUpdate('hi')).toBeNull()
    expect(extractTrackerUpdate('<tracker_update>{}</tracker_update>')).toBeNull()
  })
})

describe('extractTrackerDelete', () => {
  it('parses a delete', () => {
    expect(
      extractTrackerDelete('<tracker_delete>{"id":"t1","name":"Module 21"}</tracker_delete>')
    ).toEqual({ id: 't1', name: 'Module 21' })
  })
  it('returns null when absent or malformed', () => {
    expect(extractTrackerDelete('hi')).toBeNull()
    expect(extractTrackerDelete('<tracker_delete>nope</tracker_delete>')).toBeNull()
  })
})

describe('stripTags (tracker tags)', () => {
  it('removes all three tracker tags', () => {
    const text =
      'Before <tracker_create>[1]</tracker_create> mid <tracker_update>[2]</tracker_update> and <tracker_delete>{}</tracker_delete> after'
    expect(stripTags(text)).toBe('Before  mid  and  after')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/advisorParse.test.ts`
Expected: FAIL — new extractor functions don't exist.

- [ ] **Step 3: Implement the extractors**

Append to `lib/advisorParse.ts` (and extend `stripTags`):

```ts
export interface ParsedTrackerCreate {
  goal_id: string
  name: string
  kind: 'steps' | 'counter'
  total?: number
  unit?: string
  step_labels?: string[]
  source_url?: string
}

export interface ParsedTrackerUpdate {
  tracker_id: string
  current: number
}

export interface ParsedTrackerDelete {
  id: string
  name: string
}

export function extractTrackerCreate(text: string): ParsedTrackerCreate[] | null {
  const match = text.match(/<tracker_create>([\s\S]*?)<\/tracker_create>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return null
    const valid = parsed.filter(
      (t): t is ParsedTrackerCreate =>
        !!t &&
        typeof t.goal_id === 'string' &&
        typeof t.name === 'string' &&
        (t.kind === 'steps' || t.kind === 'counter') &&
        (typeof t.total === 'number' ||
          (Array.isArray(t.step_labels) && t.step_labels.length > 0))
    )
    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

export function extractTrackerUpdate(text: string): ParsedTrackerUpdate[] | null {
  const match = text.match(/<tracker_update>([\s\S]*?)<\/tracker_update>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed)) return null
    const valid = parsed.filter(
      (t): t is ParsedTrackerUpdate =>
        !!t && typeof t.tracker_id === 'string' && typeof t.current === 'number'
    )
    return valid.length > 0 ? valid : null
  } catch {
    return null
  }
}

export function extractTrackerDelete(text: string): ParsedTrackerDelete | null {
  const match = text.match(/<tracker_delete>([\s\S]*?)<\/tracker_delete>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.name !== 'string') return null
    return { id: parsed.id, name: parsed.name }
  } catch {
    return null
  }
}
```

Replace the existing `stripTags` body with:

```ts
export function stripTags(text: string): string {
  return text
    .replace(/<goal_data>[\s\S]*?<\/goal_data>/g, '')
    .replace(/<delete_goal>[\s\S]*?<\/delete_goal>/g, '')
    .replace(/<check_in>[\s\S]*?<\/check_in>/g, '')
    .replace(/<tracker_create>[\s\S]*?<\/tracker_create>/g, '')
    .replace(/<tracker_update>[\s\S]*?<\/tracker_update>/g, '')
    .replace(/<tracker_delete>[\s\S]*?<\/tracker_delete>/g, '')
    .trim()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/advisorParse.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/advisorParse.ts lib/advisorParse.test.ts
git commit -m "feat: advisor tag extractors for tracker create/update/delete"
```

---

### Task 3: Page fetching (`lib/fetchPage.ts`)

**Files:**
- Create: `lib/fetchPage.ts`
- Test: `lib/fetchPage.test.ts` (pure functions only; `fetchPageText` does network and is not unit-tested)

- [ ] **Step 1: Write the failing tests**

Create `lib/fetchPage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { extractFirstUrl, htmlToText } from './fetchPage'

describe('extractFirstUrl', () => {
  it('finds an https url in prose', () => {
    expect(extractFirstUrl('check out https://example.com/course please')).toBe(
      'https://example.com/course'
    )
  })
  it('returns the first of several', () => {
    expect(extractFirstUrl('https://a.com and https://b.com')).toBe('https://a.com')
  })
  it('trims trailing punctuation', () => {
    expect(extractFirstUrl('see https://example.com/path.')).toBe('https://example.com/path')
    expect(extractFirstUrl('(https://example.com/path)')).toBe('https://example.com/path')
  })
  it('returns null when there is none', () => {
    expect(extractFirstUrl('no links here')).toBeNull()
    expect(extractFirstUrl('ftp://old.school')).toBeNull()
  })
})

describe('htmlToText', () => {
  it('strips tags, scripts, and styles', () => {
    const html =
      '<html><head><style>.x{color:red}</style><script>alert(1)</script></head>' +
      '<body><h1>Course</h1><ul><li>Unit 1</li><li>Unit 2</li></ul></body></html>'
    expect(htmlToText(html)).toBe('Course Unit 1 Unit 2')
  })
  it('decodes common entities and collapses whitespace', () => {
    expect(htmlToText('<p>A &amp; B&nbsp;&mdash; &quot;C&quot;</p>\n\n<p>D</p>')).toBe(
      'A & B — "C" D'
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/fetchPage.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `lib/fetchPage.ts`**

```ts
/**
 * Server-side page fetching for the advisor's course-link intake.
 * Public pages only — no JS rendering, no auth. Unreadable pages surface an
 * error string the advisor uses to ask for pasted text instead.
 */

const URL_RE = /https?:\/\/[^\s<>"')\]]+/

export function extractFirstUrl(text: string): string | null {
  const m = text.match(URL_RE)
  if (!m) return null
  return m[0].replace(/[.,;:!?]+$/, '')
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/\s+/g, ' ')
    .trim()
}

const MAX_HTML_CHARS = 200_000
const MAX_TEXT_CHARS = 10_000
const TIMEOUT_MS = 10_000

export type FetchPageResult = { ok: true; text: string } | { ok: false; error: string }

export async function fetchPageText(url: string): Promise<FetchPageResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SummitBot/1.0)',
        Accept: 'text/html,text/plain',
      },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('text/html') && !type.includes('text/plain')) {
      return { ok: false, error: `not a readable page (${type || 'unknown content type'})` }
    }
    const raw = (await res.text()).slice(0, MAX_HTML_CHARS)
    const text = htmlToText(raw).slice(0, MAX_TEXT_CHARS)
    if (!text) return { ok: false, error: 'page contained no readable text' }
    return { ok: true, text }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return { ok: false, error: aborted ? `timed out after ${TIMEOUT_MS / 1000}s` : String(err) }
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/fetchPage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/fetchPage.ts lib/fetchPage.test.ts
git commit -m "feat: server-side page fetch + html-to-text for course links"
```

---

### Task 4: DB accessors + schema file

**Files:**
- Modify: `lib/db.ts` (append before the `getConversationState` section)
- Modify: `supabase/schema.sql`

No unit tests — these are thin Supabase wrappers, matching the rest of `lib/db.ts` (which has none). Validation lives in `lib/tracker.ts` (tested in Task 1).

- [ ] **Step 1: Add accessors to `lib/db.ts`**

Add `Tracker` to the type import at the top:

```ts
import type { Goal, DailyTask, DailyLog, CalendarMark, ConversationState, Tracker } from './types'
```

Append before `getConversationState`:

```ts
export async function getTrackers(): Promise<Tracker[]> {
  const { data } = await db().from('trackers').select('*').order('created_at')
  return data ?? []
}

export async function getTrackersForGoal(goalId: string): Promise<Tracker[]> {
  const { data } = await db()
    .from('trackers')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at')
  return data ?? []
}

export async function getTracker(id: string): Promise<Tracker | null> {
  const { data } = await db().from('trackers').select('*').eq('id', id).single()
  return data
}

export async function createTrackers(
  rows: Array<Omit<Tracker, 'id' | 'created_at' | 'updated_at'>>
): Promise<Tracker[]> {
  const { data, error } = await db().from('trackers').insert(rows).select()
  if (error) throw error
  return data ?? []
}

export async function updateTracker(
  id: string,
  patch: Partial<Pick<Tracker, 'current' | 'name' | 'total' | 'unit'>>
): Promise<Tracker> {
  const { data, error } = await db()
    .from('trackers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTracker(id: string) {
  const { error } = await db().from('trackers').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Add the table to `supabase/schema.sql`**

Append after the `conversation_state` block (before the `alter table` lines):

```sql
-- Fine-grained per-goal progress: steps (position in an ordered series) and
-- counters (numeric value toward a target). Edited in the UI and by the advisor.
create table trackers (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('steps', 'counter')),
  total numeric not null,
  current numeric not null default 0,
  unit text,
  step_labels jsonb,
  source_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

And add to the RLS block at the bottom:

```sql
alter table trackers disable row level security;
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm vitest run && npx tsc --noEmit`
Expected: tests PASS, no type errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db.ts supabase/schema.sql
git commit -m "feat: trackers table schema and db accessors"
```

---

### Task 5: API routes

**Files:**
- Create: `app/api/trackers/route.ts`
- Create: `app/api/trackers/[id]/route.ts`

No route-level unit tests (no precedent in the codebase; validation logic is the tested `lib/tracker.ts`).

- [ ] **Step 1: Create `app/api/trackers/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getGoals, getTrackers, createTrackers } from '@/lib/db'
import { normalizeNewTracker, type NewTracker } from '@/lib/tracker'

export async function GET() {
  try {
    return NextResponse.json({ trackers: await getTrackers() })
  } catch (err) {
    console.error('List trackers error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const input = body?.trackers
    if (!Array.isArray(input) || input.length === 0) {
      return NextResponse.json({ error: 'trackers array required' }, { status: 400 })
    }

    const goalIds = new Set((await getGoals()).map(g => g.id))
    const rows: NewTracker[] = []
    for (const t of input) {
      const res = normalizeNewTracker(t, goalIds)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      rows.push(res.value)
    }

    const created = await createTrackers(rows)
    return NextResponse.json({ trackers: created })
  } catch (err) {
    console.error('Create trackers error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `app/api/trackers/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getTracker, updateTracker, deleteTracker } from '@/lib/db'
import { normalizeTrackerPatch } from '@/lib/tracker'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const existing = await getTracker(id)
    if (!existing) return NextResponse.json({ error: 'tracker not found' }, { status: 404 })

    const body = await req.json().catch(() => null)
    const res = normalizeTrackerPatch(body, existing)
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })

    const tracker = await updateTracker(id, res.value)
    return NextResponse.json({ tracker })
  } catch (err) {
    console.error('Update tracker error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteTracker(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Delete tracker error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build 2>&1 | tail -5`
Expected: build succeeds (route table includes `/api/trackers` and `/api/trackers/[id]`).

- [ ] **Step 4: Commit**

```bash
git add app/api/trackers
git commit -m "feat: tracker CRUD API routes"
```

---

### Task 6: Prompt updates (`lib/prompts.ts`)

**Files:**
- Modify: `lib/prompts.ts`

Text-only changes; verified by typecheck (callers updated in Task 7) and the live advisor later.

- [ ] **Step 1: Extend `ADVISOR_SYSTEM`**

Add `trackers: string` to the ctx type:

```ts
export const ADVISOR_SYSTEM = (ctx: {
  date: string
  time: string
  goals: string
  trackers: string
  todayTasks: string
  recentLogs: string
  lightDays: string
  summary: string
}) => `...
```

Insert a new context section directly after the `## Goals` block:

```
## Trackers
${ctx.trackers}
```

Then add these capability blocks inside "## What you can do", after the **Log a check-in** block (keep existing text untouched):

```
**Create trackers:** When the user wants to track structured progress (modules with parts, problem counts, prep percentages) — or pastes a course link — propose one or more trackers. If the user's message contains a <fetched_page> block, that is the page they linked: extract the course's ordered unit/module structure from it and use the real unit names as step_labels. If the block has an error attribute or no usable structure, say you couldn't read the page and ask them to paste the module/syllabus list instead. Describe what you'll create in plain language, then at the very END of your message append:
<tracker_create>
[{"goal_id":"<id from Goals>","name":"Module 21","kind":"steps","total":22,"unit":"parts","step_labels":["..."],"source_url":"https://..."}]
</tracker_create>
- kind "steps" = an ordered sequence with a current position (unit is the step noun, default "parts"). kind "counter" = a number toward a target (unit like "tests", "problems", "%").
- step_labels is optional — only when you know the real step names; total then equals the label count. unit and source_url are also optional.
- If no existing goal fits, run goal intake first; propose trackers after the goal is saved.
- The user confirms with a button before anything is created, so don't ask "should I?" — propose.

**Update trackers:** When a genuine recap of completed work tells you a tracker position moved ("finished part 12", "did two more practice tests"), append at the very END of your message:
<tracker_update>
[{"tracker_id":"<tid from Trackers>","current":13}]
</tracker_update>
- current is the new ABSOLUTE position/value, not a delta. Use exact tids.
- This fires automatically with no confirmation, so be conservative: only trackers the recap clearly speaks to, never plans or intentions. If you can't tell the new position ("did some of module 21"), ask instead of guessing.
- Usually emitted alongside a <check_in> tag for the same message.

**Delete a tracker:** Confirm once ("Drop the Module 21 tracker?"), then respond with:
<tracker_delete>{"id":"<tid>","name":"<tracker name>"}</tracker_delete>
```

- [ ] **Step 2: Extend `ADVISOR_BRIEF_SYSTEM`**

Add `trackers: string` to its ctx type, and insert after its `## Goals` block:

```
## Trackers
${ctx.trackers}
```

(The brief never emits tags; the listing just lets it reference real positions — "you're on part 13".)

- [ ] **Step 3: Extend `ADJUSTMENT_SYSTEM`**

In the "You receive:" list, after the `futureTasks` line, add:

```
- trackers: the goal's progress trackers (current position / total). When present, treat tracker positions as the authoritative measure of where the user actually is; the logs add color and constraints.
```

- [ ] **Step 4: Verify nothing broke**

Run: `npx tsc --noEmit`
Expected: errors ONLY about missing `trackers` in `ADVISOR_SYSTEM`/`ADVISOR_BRIEF_SYSTEM` call sites (`app/api/advisor/chat/route.ts`, `app/api/advisor/brief/route.ts`) — fixed in Task 7. If other errors appear, fix them now.

- [ ] **Step 5: Commit**

```bash
git add lib/prompts.ts
git commit -m "feat: tracker context + tag instructions in advisor prompts"
```

---

### Task 7: Route wiring (chat, brief, adjust)

**Files:**
- Modify: `app/api/advisor/chat/route.ts`
- Modify: `app/api/advisor/brief/route.ts`
- Modify: `app/api/adjust/route.ts`

- [ ] **Step 1: Chat route — trackers context + URL fetch**

In `app/api/advisor/chat/route.ts`:

Add imports:

```ts
import { getTrackers } from '@/lib/db'        // add to the existing '@/lib/db' import list
import { buildTrackersSummary } from '@/lib/tracker'
import { extractFirstUrl, fetchPageText } from '@/lib/fetchPage'
```

Extend the parallel fetch (add `getTrackers()`):

```ts
const [goals, todayTasks, recentLogs, lightDays, state, trackers] = await Promise.all([
  getGoals(),
  getTodayTasks(date),
  getRecentLogs(7),
  getLightDays(date, horizonStr),
  getConversationState(),
  getTrackers(),
])
```

After `goalsSummary`, add:

```ts
const trackersSummary = buildTrackersSummary(goals, trackers)
```

Pass it to the system prompt:

```ts
const systemPrompt = ADVISOR_SYSTEM({
  date,
  time,
  goals: goalsSummary,
  trackers: trackersSummary,
  todayTasks: tasksSummary,
  recentLogs: logsSummary,
  lightDays: lightDaySummary,
  summary: state.summary,
})
```

Replace the `messagesForApi` line with the ephemeral fetch block (the PERSISTED message stays the raw `message` — the existing persistence code already uses `message` and must not change):

```ts
// If the user pasted a link, fetch it now and show the page text to the model
// only — the persisted conversation keeps the message as typed, so page dumps
// never bloat conversation_state or the compression loop.
let modelMessage = message
const url = extractFirstUrl(message)
if (url) {
  const page = await fetchPageText(url)
  modelMessage = page.ok
    ? `${message}\n\n<fetched_page url="${url}">\n${page.text}\n</fetched_page>`
    : `${message}\n\n<fetched_page url="${url}" error="${page.error}"></fetched_page>`
}

const messagesForApi = toApiMessages(state.recent_messages, modelMessage)
```

Bump `max_tokens` in the `anthropic.messages.stream` call from `1024` to `2048` (a `tracker_create` carrying 20+ step labels plus prose can exceed 1024).

- [ ] **Step 2: Brief route — trackers context**

In `app/api/advisor/brief/route.ts`:

Add imports (`getTrackers` joins the existing `@/lib/db` list):

```ts
import { getTrackers } from '@/lib/db'
import { buildTrackersSummary } from '@/lib/tracker'
```

Extend the parallel fetch:

```ts
const [goals, todayTasks, recentLogs, lightDays, trackers] = await Promise.all([
  getGoals(),
  getTodayTasks(date),
  getRecentLogs(7),
  getLightDays(date, horizonStr),
  getTrackers(),
])
```

After `goalsSummary`, add `const trackersSummary = buildTrackersSummary(goals, trackers)` and pass `trackers: trackersSummary` into the `ADVISOR_BRIEF_SYSTEM({...})` call.

- [ ] **Step 3: Adjust route — include trackers**

In `app/api/adjust/route.ts`:

Add `getTrackersForGoal` to the `@/lib/db` import. Extend the parallel fetch:

```ts
const [goal, logs, futureTasks, trackers] = await Promise.all([
  getGoal(goal_id),
  getLogsForGoal(goal_id, 7),
  getFutureTasksForGoal(goal_id),
  getTrackersForGoal(goal_id),
])
```

And include trackers in the model input (slim the rows so the prompt stays lean):

```ts
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
    })),
  }),
}],
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: clean typecheck, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/advisor/chat/route.ts app/api/advisor/brief/route.ts app/api/adjust/route.ts
git commit -m "feat: wire trackers into chat/brief context, adjustment loop, and URL fetch"
```

---

### Task 8: AdvisorChat client — tag handling

**Files:**
- Modify: `components/AdvisorChat.tsx`

- [ ] **Step 1: Extend imports and pending-tag derivation**

Update the `@/lib/advisorParse` import:

```ts
import {
  extractGoalData,
  extractDeleteGoal,
  extractCheckIn,
  extractTrackerCreate,
  extractTrackerUpdate,
  extractTrackerDelete,
  stripTags,
  type CheckInEntry,
  type ParsedTrackerUpdate,
} from '@/lib/advisorParse'
```

Below the existing `pendingDeleteGoal` line add:

```ts
const pendingTrackerCreate = extractTrackerCreate(lastAssistantContent)
const pendingTrackerDelete = extractTrackerDelete(lastAssistantContent)
```

Add state next to `saveError`:

```ts
const [trackerSaving, setTrackerSaving] = useState(false)
const [trackerError, setTrackerError] = useState<string | null>(null)
```

- [ ] **Step 2: Auto-apply tracker updates BEFORE the check-in/adjust flow**

Add this function next to `runCheckIn`:

```ts
// Tracker positions must be persisted before /api/adjust runs so the
// adjustment LLM redistributes from the fresh position, not the stale one.
async function runTrackerUpdates(updates: ParsedTrackerUpdate[]) {
  await Promise.allSettled(
    updates.map(u =>
      fetch(`/api/trackers/${u.tracker_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: u.current }),
      })
    )
  )
}
```

Replace the tail of `sendMessage`:

```ts
if (ok) {
  const checkIn = extractCheckIn(text)
  if (checkIn) runCheckIn(checkIn)
}
```

with:

```ts
if (ok) {
  const trackerUpdates = extractTrackerUpdate(text)
  if (trackerUpdates) await runTrackerUpdates(trackerUpdates)
  const checkIn = extractCheckIn(text)
  if (checkIn) runCheckIn(checkIn)
  else if (trackerUpdates) router.refresh()
}
```

- [ ] **Step 3: Confirm-button handlers**

Add next to `saveGoal`/`deleteGoal`:

```ts
async function saveTrackers() {
  if (!pendingTrackerCreate) return
  setTrackerSaving(true)
  setTrackerError(null)
  try {
    const res = await fetch('/api/trackers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackers: pendingTrackerCreate }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error ?? `Server error ${res.status}`)
    }
    router.refresh()
    const n = pendingTrackerCreate.length
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: `✓ Created ${n} tracker${n === 1 ? '' : 's'} — see the Progress tab.` },
    ])
  } catch (err) {
    setTrackerError(err instanceof Error ? err.message : String(err))
  } finally {
    setTrackerSaving(false)
  }
}

async function deleteTracker() {
  if (!pendingTrackerDelete) return
  const res = await fetch(`/api/trackers/${pendingTrackerDelete.id}`, { method: 'DELETE' })
  if (res.ok) {
    router.refresh()
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: `✓ Tracker "${pendingTrackerDelete.name}" removed.` },
    ])
  }
}
```

- [ ] **Step 4: Confirm-button JSX**

After the existing "Delete goal button" block, add:

```tsx
{/* Create trackers button */}
{pendingTrackerCreate && !streaming && (
  <div className="flex flex-col items-center gap-2 pt-2">
    {trackerError && <p className="text-warn text-xs text-center">{trackerError}</p>}
    <button
      onClick={saveTrackers}
      disabled={trackerSaving}
      className="bg-moss hover:brightness-110 active:brightness-90 disabled:opacity-50 text-moss-ink font-semibold px-8 py-3 rounded-2xl transition-colors"
    >
      {trackerSaving
        ? 'Creating…'
        : trackerError
          ? 'Retry'
          : `Create ${pendingTrackerCreate.length} tracker${pendingTrackerCreate.length === 1 ? '' : 's'} ✓`}
    </button>
  </div>
)}

{/* Delete tracker button */}
{pendingTrackerDelete && !streaming && (
  <div className="flex flex-col items-center gap-2 pt-2">
    <button
      onClick={deleteTracker}
      className="bg-[#e5484d] hover:brightness-110 active:brightness-90 text-white font-semibold px-8 py-3 rounded-2xl transition-colors"
    >
      Delete tracker &quot;{pendingTrackerDelete.name}&quot;
    </button>
  </div>
)}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/AdvisorChat.tsx
git commit -m "feat: tracker tag handling in advisor chat (auto-update + confirm buttons)"
```

---

### Task 9: Progress page UI + nav

**Files:**
- Modify: `components/navItems.tsx`
- Create: `app/progress/page.tsx`
- Create: `components/ProgressPageClient.tsx`
- Create: `components/TrackerCard.tsx`
- Create: `components/AddTrackerForm.tsx`

- [ ] **Step 1: Add the nav item**

In `components/navItems.tsx`, insert between CALENDAR and ADVISOR:

```tsx
{
  href: '/progress',
  label: 'PROGRESS',
  icon: (active: boolean) => (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 3 : 2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="21" x2="5" y2="13" />
      <line x1="12" y1="21" x2="12" y2="5" />
      <line x1="19" y1="21" x2="19" y2="9" />
    </svg>
  ),
},
```

- [ ] **Step 2: Create `app/progress/page.tsx`**

```tsx
import { getGoals, getTrackers } from '@/lib/db'
import ProgressPageClient from '@/components/ProgressPageClient'

// Without this, Next prerenders at build time and the page is frozen until
// the next deploy (same reason as the home page).
export const dynamic = 'force-dynamic'

export default async function ProgressPage() {
  const [goals, trackers] = await Promise.all([getGoals(), getTrackers()])
  return <ProgressPageClient initialGoals={goals} initialTrackers={trackers} />
}
```

- [ ] **Step 3: Create `components/TrackerCard.tsx`**

```tsx
'use client'
import { useState } from 'react'
import type { Tracker } from '@/lib/types'
import { pipTapTarget, clampCurrent, trackerFraction, nextStepLabel } from '@/lib/tracker'

interface TrackerCardProps {
  tracker: Tracker
  /** Apply an updated row to the page's tracker list (optimistic + server echo). */
  onSaved: (t: Tracker) => void
  onDelete: (id: string) => void
}

export default function TrackerCard({ tracker, onSaved, onDelete }: TrackerCardProps) {
  const [pending, setPending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingValue, setEditingValue] = useState(false)
  const [error, setError] = useState(false)

  async function patch(body: Record<string, unknown>) {
    if (pending) return
    setPending(true)
    setError(false)
    onSaved({ ...tracker, ...body } as Tracker) // optimistic
    try {
      const res = await fetch(`/api/trackers/${tracker.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      const { tracker: updated } = await res.json()
      onSaved(updated) // server echo (clamped values win)
    } catch {
      onSaved(tracker) // revert
      setError(true)
    } finally {
      setPending(false)
    }
  }

  function commitValue(raw: string) {
    setEditingValue(false)
    const n = Number(raw)
    if (!Number.isFinite(n) || n === tracker.current) return
    patch({ current: clampCurrent(n, tracker.total) })
  }

  const next = nextStepLabel(tracker)

  return (
    <div className="bg-panel border border-line rounded-2xl p-3.5 mb-2">
      <div className="flex items-baseline gap-2 mb-2.5">
        <span className="text-[14px] font-bold">{tracker.name}</span>
        {error && <span className="text-warn text-[10px] font-mono">SAVE FAILED</span>}
        <button
          onClick={() => { setMenuOpen(o => !o); setConfirmDelete(false) }}
          className="ml-auto text-mut hover:text-fg px-1.5 font-bold tracking-wider"
          aria-label="Tracker options"
        >
          ⋯
        </button>
      </div>

      {tracker.kind === 'steps' ? (
        <>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {Array.from({ length: tracker.total }, (_, i) => {
              const n = i + 1
              const cls =
                n === tracker.current
                  ? 'bg-ember shadow-[0_0_6px_#ff7847]'
                  : n < tracker.current
                    ? 'bg-moss'
                    : 'bg-line hover:bg-[#2a4060]'
              return (
                <button
                  key={n}
                  onClick={() => patch({ current: pipTapTarget(tracker.current, n) })}
                  disabled={pending}
                  title={tracker.step_labels?.[i] ?? `${n}`}
                  aria-label={`Set position to ${n}`}
                  className={`w-4 h-4 rounded-[5px] transition-colors ${cls}`}
                />
              )
            })}
          </div>
          <p className="font-mono text-[11px] text-mut">
            {tracker.current} / {tracker.total} {tracker.unit ?? 'parts'}
            {next && (
              <>
                {' '}· <span className="text-ice">next: {next}</span>
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <div className="h-2 rounded-full bg-line overflow-hidden mb-2.5">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-ember to-ember2"
              style={{ width: `${trackerFraction(tracker) * 100}%` }}
            />
          </div>
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => patch({ current: clampCurrent(tracker.current - 1, tracker.total) })}
              disabled={pending || tracker.current <= 0}
              className="w-7 h-7 rounded-lg border border-line bg-panel2 text-fg disabled:opacity-40 font-bold"
              aria-label="Decrease by one"
            >
              −
            </button>
            <button
              onClick={() => patch({ current: clampCurrent(tracker.current + 1, tracker.total) })}
              disabled={pending || tracker.current >= tracker.total}
              className="w-7 h-7 rounded-lg border border-line bg-panel2 text-fg disabled:opacity-40 font-bold"
              aria-label="Increase by one"
            >
              +
            </button>
            {editingValue ? (
              <input
                type="number"
                autoFocus
                defaultValue={tracker.current}
                onBlur={e => commitValue(e.currentTarget.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                className="w-20 bg-panel2 border border-line rounded-lg px-2 py-0.5 font-mono text-[13px] outline-none focus:border-ember"
              />
            ) : (
              <button
                onClick={() => setEditingValue(true)}
                className="font-mono text-[13px] border-b border-dashed border-mut"
                aria-label="Edit value"
              >
                {tracker.current}{' '}
                <span className="text-mut">
                  / {tracker.total}
                  {tracker.unit ? ` ${tracker.unit}` : ''}
                </span>
              </button>
            )}
          </div>
        </>
      )}

      {menuOpen && (
        <div className="mt-3 pt-3 border-t border-line/60 space-y-2.5">
          <div className="flex gap-2">
            <input
              defaultValue={tracker.name}
              onBlur={e => {
                const v = e.currentTarget.value.trim()
                if (v && v !== tracker.name) patch({ name: v })
              }}
              className="flex-1 min-w-0 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-ember"
              aria-label="Tracker name"
            />
            <input
              type="number"
              defaultValue={tracker.total}
              onBlur={e => {
                const v = Number(e.currentTarget.value)
                if (Number.isFinite(v) && v >= 1 && v !== tracker.total) patch({ total: v })
              }}
              className="w-20 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 font-mono text-sm outline-none focus:border-ember"
              aria-label="Tracker total"
            />
          </div>
          <button
            onClick={() => (confirmDelete ? onDelete(tracker.id) : setConfirmDelete(true))}
            className={`text-[12px] font-semibold ${confirmDelete ? 'text-[#e5484d]' : 'text-mut hover:text-warn'}`}
          >
            {confirmDelete ? 'Tap again to delete' : 'Delete tracker'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `components/AddTrackerForm.tsx`**

```tsx
'use client'
import { useState } from 'react'
import type { TrackerKind } from '@/lib/types'

interface AddTrackerFormProps {
  goalId: string
  onCreated: () => void
  onCancel: () => void
}

export default function AddTrackerForm({ goalId, onCreated, onCancel }: AddTrackerFormProps) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TrackerKind>('steps')
  const [total, setTotal] = useState('')
  const [unit, setUnit] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    const totalNum = Number(total)
    if (!name.trim() || !Number.isFinite(totalNum) || totalNum < 1) {
      setError('Name and a total of at least 1 are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/trackers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackers: [
            { goal_id: goalId, name: name.trim(), kind, total: totalNum, unit: unit.trim() || undefined },
          ],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Server error ${res.status}`)
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setSaving(false)
    }
  }

  const kindBtn = (k: TrackerKind, label: string) => (
    <button
      onClick={() => setKind(k)}
      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${
        kind === k ? 'bg-ember text-ember-ink' : 'bg-panel2 text-mut border border-line'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="bg-panel border border-line rounded-2xl p-3.5 mb-2 space-y-2.5">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Tracker name (e.g. Module 23)"
        autoFocus
        className="w-full bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-ember"
      />
      <div className="flex gap-2 items-center">
        {kindBtn('steps', 'STEPS')}
        {kindBtn('counter', 'COUNTER')}
        <input
          type="number"
          value={total}
          onChange={e => setTotal(e.target.value)}
          placeholder={kind === 'steps' ? '# parts' : 'target'}
          className="w-24 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 font-mono text-sm outline-none focus:border-ember"
        />
        <input
          value={unit}
          onChange={e => setUnit(e.target.value)}
          placeholder={kind === 'steps' ? 'parts' : 'unit'}
          className="flex-1 min-w-0 bg-panel2 border border-line rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-ember"
        />
      </div>
      {error && <p className="text-warn text-xs">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={saving}
          className="bg-moss text-moss-ink disabled:opacity-50 text-[13px] font-bold px-4 py-2 rounded-xl"
        >
          {saving ? 'Saving…' : 'Add tracker'}
        </button>
        <button onClick={onCancel} className="text-mut text-[13px] font-semibold px-3">
          Cancel
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `components/ProgressPageClient.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Goal, Tracker } from '@/lib/types'
import { blendedPct } from '@/lib/tracker'
import TrackerCard from '@/components/TrackerCard'
import AddTrackerForm from '@/components/AddTrackerForm'

interface ProgressPageClientProps {
  initialGoals: Goal[]
  initialTrackers: Tracker[]
}

export default function ProgressPageClient({ initialGoals, initialTrackers }: ProgressPageClientProps) {
  const router = useRouter()
  const [trackers, setTrackers] = useState(initialTrackers)
  const [serverTrackers, setServerTrackers] = useState(initialTrackers)
  const [addingFor, setAddingFor] = useState<string | null>(null)

  // Re-sync local state when router.refresh() delivers new server props
  // (same adjust-during-render pattern as TaskItem).
  if (initialTrackers !== serverTrackers) {
    setServerTrackers(initialTrackers)
    setTrackers(initialTrackers)
  }

  function applyTracker(updated: Tracker) {
    setTrackers(prev => prev.map(t => (t.id === updated.id ? updated : t)))
  }

  async function removeTracker(id: string) {
    const prev = trackers
    setTrackers(p => p.filter(t => t.id !== id))
    try {
      const res = await fetch(`/api/trackers/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      router.refresh()
    } catch {
      setTrackers(prev) // revert
    }
  }

  return (
    <div className="px-4 pt-safe pb-24 md:pb-8 max-w-2xl">
      <div className="pt-5 pb-3">
        <div className="font-mono text-[11px] tracking-[0.18em] text-mut">SUMMIT</div>
        <h1 className="text-[32px] font-bold tracking-tight mt-2.5 leading-none">Progress</h1>
      </div>

      {initialGoals.map(goal => {
        const goalTrackers = trackers.filter(t => t.goal_id === goal.id)
        return (
          <section key={goal.id} className="mt-5">
            <div className="flex items-baseline gap-2.5 mb-2.5">
              <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ backgroundColor: goal.color }} />
              <h2 className="font-mono text-[12px] tracking-[0.16em] text-mut font-semibold uppercase truncate">
                {goal.title}
              </h2>
              {goalTrackers.length > 0 && (
                <span className="font-mono text-[11px] text-moss">{blendedPct(goalTrackers)}%</span>
              )}
              <button
                onClick={() => setAddingFor(addingFor === goal.id ? null : goal.id)}
                className="ml-auto font-mono text-[11px] tracking-[0.08em] text-ember hover:text-ember2 font-bold"
              >
                + ADD
              </button>
            </div>

            {addingFor === goal.id && (
              <AddTrackerForm
                goalId={goal.id}
                onCreated={() => { setAddingFor(null); router.refresh() }}
                onCancel={() => setAddingFor(null)}
              />
            )}

            {goalTrackers.map(t => (
              <TrackerCard key={t.id} tracker={t} onSaved={applyTracker} onDelete={removeTracker} />
            ))}

            {goalTrackers.length === 0 && addingFor !== goal.id && (
              <p className="text-mut text-[12.5px] bg-panel/60 border border-line/60 rounded-2xl px-3.5 py-3">
                No trackers yet — tap <span className="text-ember font-semibold">+ ADD</span> or ask your advisor.
              </p>
            )}
          </section>
        )
      })}

      {initialGoals.length === 0 && (
        <div className="bg-panel border border-line rounded-2xl p-8 text-center mt-6">
          <p className="text-mut text-sm mb-5">No goals yet. Talk to your advisor to add one.</p>
          <Link
            href="/advisor"
            className="inline-block bg-ember hover:bg-ember2 text-ember-ink text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
          >
            Open Advisor
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && pnpm vitest run && pnpm build 2>&1 | tail -5`
Expected: all clean; build route table includes `/progress`.

- [ ] **Step 7: Commit**

```bash
git add components/navItems.tsx app/progress components/ProgressPageClient.tsx components/TrackerCard.tsx components/AddTrackerForm.tsx
git commit -m "feat: Progress tab — tracker page with steps pips, counters, add form"
```

---

### Task 10: Full verification + manual smoke test

**Files:** none new.

- [ ] **Step 1: Full suite**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all pass/clean.

- [ ] **Step 2: Dev-server smoke test**

The `trackers` table does NOT exist yet, so tracker reads return empty and writes fail — verify graceful behavior plus zero regressions:

Run: `pnpm dev` (background), then with curl:
- `curl -s localhost:3000/progress` → 200, page HTML renders (empty tracker states under each goal).
- `curl -s localhost:3000/` → 200 (home unchanged).
- `curl -s localhost:3000/api/trackers` → `{"trackers":[]}`.
- `curl -s -X POST localhost:3000/api/trackers -H 'Content-Type: application/json' -d '{"trackers":[{"goal_id":"00000000-0000-0000-0000-000000000000","name":"x","kind":"steps","total":3}]}'` → 400 `unknown goal_id` (validation fires before the DB).

Kill the dev server when done.

- [ ] **Step 3: Commit any fixes, then write the morning handoff note**

If smoke tests surfaced fixes, commit them. The final summary for Harrison must list: run `dummy.txt` SQL in Supabase SQL editor → merge `worktree-progress-trackers` → push → verify `/progress` on prod.
