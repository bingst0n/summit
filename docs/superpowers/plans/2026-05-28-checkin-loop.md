# Check-in Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the advisor check-in → save `daily_logs` → rewrite the affected goals' upcoming `daily_tasks`, fully automatically, reusing the existing `/api/checkin` and `/api/adjust` routes.

**Architecture:** The advisor emits a hidden `<check_in>[{goal_id, notes}]</check_in>` tag after a day-recap. The client (`AdvisorChat`) parses it (via a new pure `lib/advisorParse` module), POSTs the logs to `/api/checkin`, then fires `/api/adjust` for each mentioned goal in parallel, surfacing a subtle status indicator. No DB or route changes.

**Tech Stack:** Next.js 15 App Router, TypeScript, Anthropic SDK, Supabase, Vitest (new — for the pure parsers).

**Reference spec:** `docs/superpowers/specs/2026-05-28-checkin-loop-design.md`

---

## File Structure

**Create**
- `lib/advisorParse.ts` — pure tag parsers: `extractGoalData`, `extractDeleteGoal`, `extractCheckIn`, `stripTags` (single responsibility: parse advisor output). Extracted from `AdvisorChat` so they're testable.
- `lib/advisorParse.test.ts` — vitest unit tests (co-located; imports the module relatively, so no path-alias config is needed).
- `vitest.config.ts` — minimal vitest config (test glob only).

**Modify**
- `package.json` — add `"test": "vitest run"` script + `vitest` devDependency.
- `lib/prompts.ts` — rewrite the check-in section of `ADVISOR_SYSTEM`.
- `components/AdvisorChat.tsx` — import the shared parsers, replace the dead stub with the check-in loop, add the inline status indicator, extend the `scheduleStatus` union.

**Reused unchanged**
- `app/api/checkin/route.ts` — `POST {date, logs:[{goal_id,notes}]}` → `upsertLog` per entry.
- `app/api/adjust/route.ts` — `POST {goal_id}` → rewrites that goal's future tasks (no-ops for oneshot / no future tasks / bad JSON).

---

## Task 1: Add vitest tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest**

Run: `pnpm add -D vitest`
Expected: `vitest` appears under `devDependencies`; lockfile updates.

- [ ] **Step 2: Add the test script**

In `package.json`, add a `test` line to `scripts` (after `"lint": "eslint"`):

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Verify vitest is wired**

Run: `pnpm vitest --version`
Expected: prints a version like `vitest/3.x` with no error. (Do not run `pnpm test` yet — there are no tests; that comes in Task 2.)

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore: add vitest for unit testing"
```

---

## Task 2: Pure parser module + tests (TDD)

**Files:**
- Test: `lib/advisorParse.test.ts`
- Create: `lib/advisorParse.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/advisorParse.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractGoalData, extractDeleteGoal, extractCheckIn, stripTags } from './advisorParse'

describe('extractCheckIn', () => {
  it('parses a single-goal check-in', () => {
    const text = 'Nice work today!\n<check_in>[{"goal_id":"g1","notes":"did 3 parts"}]</check_in>'
    expect(extractCheckIn(text)).toEqual([{ goal_id: 'g1', notes: 'did 3 parts' }])
  })
  it('parses a multi-goal check-in', () => {
    const text = '<check_in>[{"goal_id":"g1","notes":"a"},{"goal_id":"g2","notes":"b"}]</check_in>'
    expect(extractCheckIn(text)).toEqual([
      { goal_id: 'g1', notes: 'a' },
      { goal_id: 'g2', notes: 'b' },
    ])
  })
  it('returns null when no tag present', () => {
    expect(extractCheckIn('just a normal reply')).toBeNull()
  })
  it('returns null on malformed JSON', () => {
    expect(extractCheckIn('<check_in>[not json]</check_in>')).toBeNull()
  })
  it('returns null on an empty array', () => {
    expect(extractCheckIn('<check_in>[]</check_in>')).toBeNull()
  })
})

describe('extractGoalData', () => {
  it('parses goal data', () => {
    const text = '<goal_data>{"type":"continuous","title":"Calc","description":"d","deadline":"2026-08-31"}</goal_data>'
    expect(extractGoalData(text)).toEqual({
      type: 'continuous',
      title: 'Calc',
      description: 'd',
      deadline: '2026-08-31',
    })
  })
  it('returns null when absent', () => {
    expect(extractGoalData('hi')).toBeNull()
  })
  it('returns null on malformed JSON', () => {
    expect(extractGoalData('<goal_data>{bad}</goal_data>')).toBeNull()
  })
})

describe('extractDeleteGoal', () => {
  it('parses delete goal', () => {
    expect(extractDeleteGoal('<delete_goal>{"id":"g1","title":"Calc"}</delete_goal>')).toEqual({
      id: 'g1',
      title: 'Calc',
    })
  })
  it('returns null when absent', () => {
    expect(extractDeleteGoal('hi')).toBeNull()
  })
})

describe('stripTags', () => {
  it('strips goal_data', () => {
    expect(stripTags('Before <goal_data>{"x":1}</goal_data> after')).toBe('Before  after')
  })
  it('strips check_in', () => {
    expect(stripTags('Logged it!\n<check_in>[{"goal_id":"g1","notes":"x"}]</check_in>')).toBe('Logged it!')
  })
  it('strips delete_goal', () => {
    expect(stripTags('Sure. <delete_goal>{"id":"g1","title":"C"}</delete_goal>')).toBe('Sure.')
  })
  it('strips multiple tag types and trims', () => {
    const text = '  Done <check_in>[{"goal_id":"g1","notes":"x"}]</check_in> <goal_data>{"a":1}</goal_data>  '
    expect(stripTags(text)).toBe('Done')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./advisorParse"` (module doesn't exist yet).

- [ ] **Step 3: Create the parser module**

Create `lib/advisorParse.ts`:

```typescript
import type { GoalType } from './types'

export interface ParsedGoalData {
  type: GoalType
  title: string
  description: string
  deadline: string
}

export interface ParsedDeleteGoal {
  id: string
  title: string
}

export interface CheckInEntry {
  goal_id: string
  notes: string
}

export function extractGoalData(text: string): ParsedGoalData | null {
  const match = text.match(/<goal_data>([\s\S]*?)<\/goal_data>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

export function extractDeleteGoal(text: string): ParsedDeleteGoal | null {
  const match = text.match(/<delete_goal>([\s\S]*?)<\/delete_goal>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

export function extractCheckIn(text: string): CheckInEntry[] | null {
  const match = text.match(/<check_in>([\s\S]*?)<\/check_in>/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed
  } catch {
    return null
  }
}

export function stripTags(text: string): string {
  return text
    .replace(/<goal_data>[\s\S]*?<\/goal_data>/g, '')
    .replace(/<delete_goal>[\s\S]*?<\/delete_goal>/g, '')
    .replace(/<check_in>[\s\S]*?<\/check_in>/g, '')
    .trim()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS — all suites green (`extractCheckIn`, `extractGoalData`, `extractDeleteGoal`, `stripTags`).

- [ ] **Step 5: Commit**

```bash
git add lib/advisorParse.ts lib/advisorParse.test.ts
git commit -m "feat: extract advisor tag parsers into tested lib/advisorParse module"
```

---

## Task 3: Rewrite the check-in section of `ADVISOR_SYSTEM`

**Files:**
- Modify: `lib/prompts.ts`

- [ ] **Step 1: Replace the check-in instructions**

In `lib/prompts.ts`, inside `ADVISOR_SYSTEM`, replace this block:

```
**Accept a check-in:** When the user shares how their day went, extract what they did toward each goal and note it. Then reply confirming you've noted it. The client will save the log and trigger a schedule adjustment.
```

with:

```
**Log a check-in:** When the user describes how their day actually went — what they did or didn't do toward their goals — first reply warmly and briefly acknowledging it. Then, at the very END of your message, append a check-in tag mapping each goal they touched to a short progress note:
<check_in>
[{"goal_id":"<id from the Goals list>","notes":"<what they did or didn't do toward this goal>"}]
</check_in>
- Use the exact ids shown as [id:...] in the Goals list above.
- Include goals they made NO progress on if they say so ("didn't get to X") — that signal matters for adjustment.
- Only include goals the user actually mentioned. Never invent progress.
- The user does NOT see this tag; your visible reply must stand on its own.
- Emit the tag ONLY for genuine recaps of what already happened — never for plans ("I'm going to..."), questions, or hypotheticals. If you're unsure whether they're logging, ask "Want me to log that?" instead of emitting the tag.
- If a log for today already appears in Recent Logs, fold that earlier progress into your notes so the new check-in doesn't erase it.
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: clean build (this is a template-string change; no type impact).

- [ ] **Step 3: Commit**

```bash
git add lib/prompts.ts
git commit -m "feat: advisor emits <check_in> tag on day-recaps with mis-detection guard"
```

---

## Task 4: Wire `AdvisorChat` to the check-in loop

**Files:**
- Modify: `components/AdvisorChat.tsx`

- [ ] **Step 1: Replace the imports and delete the local parsers**

Replace the top of the file (current lines 1-30, through the `interface AdvisorChatProps`) with:

```typescript
'use client'
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  extractGoalData,
  extractDeleteGoal,
  extractCheckIn,
  stripTags,
  type CheckInEntry,
} from '@/lib/advisorParse'
import { today } from '@/lib/utils'

type Message = { role: 'user' | 'assistant'; content: string }

interface AdvisorChatProps {
  briefText: string
}
```

This removes the local `extractGoalData`, `extractDeleteGoal`, `stripTags` definitions (now imported) and the `Message` type stays.

- [ ] **Step 2: Extend `scheduleStatus` and add a retry ref**

Change the `scheduleStatus` state declaration (currently `useState<'idle' | 'updating' | 'updated'>('idle')`) to add `'error'`, and add a ref to remember the last check-in for retry. The two lines become:

```typescript
  const [scheduleStatus, setScheduleStatus] = useState<'idle' | 'updating' | 'updated' | 'error'>('idle')
  const lastCheckInRef = useRef<CheckInEntry[] | null>(null)
```

- [ ] **Step 3: Add the `runCheckIn` function**

Add this function inside the component, immediately before `async function sendMessage()`:

```typescript
  async function runCheckIn(checkIn: CheckInEntry[]) {
    lastCheckInRef.current = checkIn
    setScheduleStatus('updating')
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: today(), logs: checkIn }),
      })
      if (!res.ok) throw new Error(`checkin ${res.status}`)

      const goalIds = [...new Set(checkIn.map(c => c.goal_id))]
      await Promise.all(
        goalIds.map(id =>
          fetch('/api/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal_id: id }),
          }).then(r => {
            if (!r.ok) throw new Error(`adjust ${r.status}`)
          })
        )
      )

      setScheduleStatus('updated')
      router.refresh()
      setTimeout(() => setScheduleStatus('idle'), 3000)
    } catch {
      setScheduleStatus('error')
    }
  }
```

- [ ] **Step 4: Replace the dead stub at the end of `sendMessage`**

Replace these current lines (the end of `sendMessage`, ~lines 108-113):

```typescript
    setStreaming(false)

    // If advisor mentioned adjusting the schedule, trigger it
    if (text.includes('Updating schedule') || text.includes('adjust')) {
      // Schedule adjustment is triggered server-side; just reflect status
    }
  }
```

with:

```typescript
    setStreaming(false)

    const checkIn = extractCheckIn(text)
    if (checkIn) runCheckIn(checkIn)
  }
```

- [ ] **Step 5: Add the inline status indicator**

In the JSX, insert this block between the message-list `</div>` and the input `<div className="shrink-0 pt-2 flex gap-2 border-t border-zinc-800">`:

```tsx
      {scheduleStatus !== 'idle' && (
        <div className="shrink-0 px-1 pb-2 text-xs">
          {scheduleStatus === 'updating' && (
            <span className="text-zinc-500 flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
              Updating your schedule…
            </span>
          )}
          {scheduleStatus === 'updated' && (
            <span className="text-green-500">Schedule updated ✓</span>
          )}
          {scheduleStatus === 'error' && (
            <button
              onClick={() => lastCheckInRef.current && runCheckIn(lastCheckInRef.current)}
              className="text-red-400 active:text-red-300"
            >
              Couldn&apos;t update schedule · Retry
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 6: Verify lint + build**

Run: `pnpm lint && pnpm build`
Expected: no ESLint errors (the previously-unused `scheduleStatus` is now used; no unused vars), clean build.

- [ ] **Step 7: Commit**

```bash
git add components/AdvisorChat.tsx
git commit -m "feat: wire AdvisorChat check-in loop — save log + adjust mentioned goals with status indicator"
```

---

## Task 5: Full automated verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `pnpm test`
Expected: all `lib/advisorParse.test.ts` suites PASS.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: clean build; route list still shows `/advisor`, `/api/checkin`, `/api/adjust`.

---

## Task 6: Live Supabase smoke-test + cleanup

**Files:** none (verification only). This task writes to the real Supabase using the service-role key, then deletes everything it created.

- [ ] **Step 1: Start the dev server in the background**

Run (background): `pnpm dev`
Wait until it logs `Ready` / listening on `http://localhost:3000`.

- [ ] **Step 2: Load env and create a throwaway continuous goal with two future tasks**

```bash
set -a; . ./.env.local; set +a
SB="$NEXT_PUBLIC_SUPABASE_URL"; SRK="$SUPABASE_SERVICE_ROLE_KEY"
TODAY=$(date +%F); FUT1=$(date -v+1d +%F); FUT2=$(date -v+2d +%F)

GID=$(curl -s -X POST "$SB/rest/v1/goals" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d "{\"type\":\"continuous\",\"title\":\"__CHECKIN_TEST__\",\"description\":\"throwaway\",\"deadline\":\"2026-08-31\",\"color\":\"#6366f1\"}" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['id'])")
echo "Test goal: $GID"

curl -s -X POST "$SB/rest/v1/daily_tasks" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK" \
  -H "Content-Type: application/json" \
  -d "[{\"goal_id\":\"$GID\",\"date\":\"$FUT1\",\"description\":\"orig task 1\"},{\"goal_id\":\"$GID\",\"date\":\"$FUT2\",\"description\":\"orig task 2\"}]" >/dev/null
echo "Seeded 2 future tasks."
```

Expected: prints a UUID for `Test goal:` and `Seeded 2 future tasks.`

- [ ] **Step 3: Exercise the real routes (the wiring under test)**

```bash
curl -s -X POST http://localhost:3000/api/checkin \
  -H "Content-Type: application/json" \
  -d "{\"date\":\"$TODAY\",\"logs\":[{\"goal_id\":\"$GID\",\"notes\":\"Got way ahead today — finished a big chunk.\"}]}"
echo " <- checkin"

curl -s -X POST http://localhost:3000/api/adjust \
  -H "Content-Type: application/json" \
  -d "{\"goal_id\":\"$GID\"}"
echo " <- adjust"
```

Expected: each returns `{"ok":true}`.

- [ ] **Step 4: Verify the writes**

```bash
echo "daily_logs for test goal:"
curl -s "$SB/rest/v1/daily_logs?goal_id=eq.$GID&select=date,notes" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
echo ""
echo "daily_tasks for test goal (should differ from 'orig task' descriptions):"
curl -s "$SB/rest/v1/daily_tasks?goal_id=eq.$GID&select=date,description&order=date" \
  -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
echo ""
```

Expected: one `daily_logs` row with today's date and the notes; `daily_tasks` rewritten by the adjustment (descriptions no longer the literal `orig task 1/2`, or redistributed).

- [ ] **Step 5: Clean up (delete throwaway data)**

```bash
curl -s -X DELETE "$SB/rest/v1/daily_logs?goal_id=eq.$GID" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" >/dev/null
curl -s -X DELETE "$SB/rest/v1/daily_tasks?goal_id=eq.$GID" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" >/dev/null
curl -s -X DELETE "$SB/rest/v1/goals?id=eq.$GID" -H "apikey: $SRK" -H "Authorization: Bearer $SRK" >/dev/null
echo "Verifying cleanup (all three should be []):"
curl -s "$SB/rest/v1/goals?id=eq.$GID&select=id" -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
curl -s "$SB/rest/v1/daily_tasks?goal_id=eq.$GID&select=id" -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
curl -s "$SB/rest/v1/daily_logs?goal_id=eq.$GID&select=id" -H "apikey: $SRK" -H "Authorization: Bearer $SRK"
echo ""
```

Expected: all three queries return `[]`. Stop the dev server afterward.

- [ ] **Step 6: Note result**

No commit. Record in the final summary whether the live loop wrote a log and rewrote tasks, and that cleanup succeeded.

---

## Task 7: Merge to main + deploy

**Files:** none (integration). Only do this once Tasks 5 and 6 are fully green.

- [ ] **Step 1: Confirm clean state on the feature branch**

```bash
git status
git log --oneline main..feat/checkin-loop
```

Expected: working tree clean (aside from the pre-existing untracked `dummy.txt`/`goals_rows.csv`/`todo.txt`); the branch shows the spec + Task 1-4 commits.

- [ ] **Step 2: Merge into main**

```bash
git checkout main
git merge --no-ff feat/checkin-loop -m "feat: wire the check-in → log → schedule-adjustment loop"
```

- [ ] **Step 3: Push (triggers Vercel production deploy)**

```bash
git push origin main
```

Expected: push succeeds; Vercel begins a production deploy of `lockin-lake.vercel.app`.

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| Advisor emits `<check_in>` tag on day-recaps | Task 3 |
| Mis-detection guard (no logging plans/questions) | Task 3 |
| Merge same-day logs via prompt | Task 3 |
| Pure `extractCheckIn` + `stripTags` strips `<check_in>` | Task 2 |
| Parsers extracted to `lib/advisorParse` | Task 2 |
| Vitest covering the parsers | Tasks 1, 2 |
| Client saves log via `/api/checkin` | Task 4 (`runCheckIn`) |
| Client adjusts only mentioned goals (parallel) | Task 4 (`goalIds` set) |
| Fully automatic, non-blocking | Task 4 (`runCheckIn` not awaited in `sendMessage`) |
| Subtle status indicator (updating/updated/error+retry) | Task 4 (Step 5) |
| Revive unused `scheduleStatus` | Task 4 (Step 2) |
| No DB / route changes | reused unchanged |
| Build + lint + unit verification | Task 5 |
| Live smoke-test with cleanup | Task 6 |

All spec requirements map to a task.

### Type consistency
- `CheckInEntry { goal_id, notes }` — defined Task 2; consumed in Task 4 (`lastCheckInRef`, `runCheckIn` param, `checkIn.map(c => c.goal_id)`). ✓
- `extractCheckIn` returns `CheckInEntry[] | null` — Task 2; Task 4 guards `if (checkIn)`. ✓
- `today()` returns `YYYY-MM-DD` (`lib/utils`) — matches `/api/checkin` `date` field. ✓
- `/api/checkin` body `{date, logs:[{goal_id,notes}]}` — matches `runCheckIn` POST body. ✓
- `/api/adjust` body `{goal_id}` — matches `runCheckIn` POST body. ✓
- `scheduleStatus` union extended to include `'error'` before the indicator references it. ✓

### Placeholder scan
No TBD/TODO; every code step contains complete code; every command has expected output. ✓
