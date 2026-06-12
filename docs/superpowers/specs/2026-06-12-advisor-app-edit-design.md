# Advisor App-Edit Capability — Design

**Date:** 2026-06-12
**Status:** Approved (approach + operations + permission model chosen interactively; design details delegated — "whatever you think, just keep building")

## Summary

Give the Summit advisor full editing parity with the user: one generic `<app_edit>` tag through which it can delete/move/add/edit/complete daily tasks, toggle light days, edit trackers (rename/retotal — lifting the trackers-spec non-goal), edit goals (title/description/deadline), and trigger schedule redistribution on demand — all gated behind a single "Apply N changes ✓" confirm button. Recap-driven updates stay automatic and gain task check-off. Root-cause fix included: new schedules never start before `SEASON.start`.

This closes the gap exposed on 2026-06-12: the advisor told Harrison it "can't delete tasks from your calendar" when asked to clear pre-season (before June 15) tasks — schedule mutation previously existed only via the check-in-triggered adjustment loop.

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Operations | All: delete, move/shift, add/edit, complete, redistribute — plus full app parity (light days, trackers, goals): "everything I can edit, it can edit (with my permission)" |
| Permission model | One confirm button per advisor reply batching all edits, with a plain-language summary; recap-driven flows (check-in, tracker position, and now task check-off) stay automatic |
| Mechanism | Approach A: one generic `<app_edit>` tag + one executor route (`/api/app-edit`); existing tags unchanged |
| Root cause | `generate-schedule` clamps start date to `max(today, SEASON.start)` |

## Non-goals

- No migration to Anthropic tool use; the text-tag protocol stays.
- No advisor-initiated goal **creation** changes (existing `goal_data` intake flow stays as-is) and no goal deletion changes (existing `delete_goal` tag stays).
- No undo/history UI. The confirm button plus the advisor's visible summary is the safety net.
- Existing tags (`goal_data`, `delete_goal`, `check_in`, `tracker_create`, `tracker_update`, `tracker_delete`) are NOT migrated into `app_edit`. One new tag, zero breakage.
- The brief route does not get the upcoming-tasks context section (briefs only reference today).

## The `<app_edit>` tag

Emitted at the very end of an advisor reply when the user asks for any app state change that isn't a goal intake, goal deletion, or recap. JSON object:

```json
<app_edit>
{"summary":"Delete all tasks before Jun 15 and mark Jun 20 a light day",
 "ops":[
   {"op":"task_delete","goal_id":null,"from":"2026-06-10","to":"2026-06-14"},
   {"op":"light_day","date":"2026-06-20","light":true}
 ]}
</app_edit>
```

`summary` is a short human sentence (shown above the confirm button). `ops` is an ordered array. Operations:

| op | fields | semantics |
|---|---|---|
| `task_delete` | `goal_id` (string or null = all goals), `from`, `to` (inclusive YYYY-MM-DD), `match?` (case-insensitive substring) | Delete matching **incomplete** tasks. Completed tasks are never deleted (they feed progress stats and adjustment context). |
| `task_shift` | `goal_id` (string or null), `from`, `to`, `days` (non-zero integer, \|days\| ≤ 90), `match?` | Move matching incomplete tasks' dates by `days`. |
| `task_add` | `goal_id` (required), `date`, `description` (non-empty) | Insert one task. |
| `task_edit` | `goal_id` (required), `date`, `match?`, `description` (non-empty, the new text) | Reword a single task. Resolved by goal+date(+match); 0 or >1 matches → op fails with a message telling the advisor to be more specific. |
| `task_complete` | `goal_id` (required), `date`, `match?`, `completed` (boolean) | Set completion on matching task(s): with `match`, resolves to exactly one task (like `task_edit`); without `match`, applies to all of that goal's tasks on that date. |
| `light_day` | `date`, `light` (boolean) | Mark/unmark a calendar light day. |
| `tracker_edit` | `tracker_id` (required), `name?`, `total?`, `current?`, `unit?` (at least one) | Patch a tracker via the existing `normalizeTrackerPatch` rules (clamping, steps-integer total). |
| `goal_edit` | `goal_id` (required), `title?`, `description?`, `deadline?` (at least one; deadline = valid YYYY-MM-DD) | Patch goal fields. |
| `redistribute` | `goal_id` (required), `note?` (free-text guidance) | Run the adjustment loop for the goal on demand; `note` is passed to the adjustment LLM as an explicit instruction. |

Execution is **sequential, best-effort**: each op validates and executes independently; a failed op records an error and the rest continue. The response reports per-op results so the client can show "✓ Applied 4 changes" or "Applied 3 of 4 — 1 failed: …".

## Architecture

### New pure module: `lib/appEdit.ts` (unit-tested)

- Op type definitions (`AppEditOp` discriminated union, `ParsedAppEdit { summary, ops }`).
- `validateOp(op, ctx)` where `ctx = { goalIds: Set<string>, trackerIds: Set<string> }` → `{ ok: true, value: NormalizedOp } | { ok: false, error: string }`. Validates op names, required fields, date formats (`/^\d{4}-\d{2}-\d{2}$/`), `days` bounds, non-empty strings; trims text fields.
- Date-range sanity: `from <= to` required.

### Parsing: `lib/advisorParse.ts`

- `extractAppEdit(text)` → `{ summary: string, ops: unknown[] } | null` (same null-on-malformed philosophy; ops validated server-side, not at parse time — the extractor only requires `summary` string and non-empty `ops` array).
- `CheckInEntry` gains optional `done?: boolean`; `extractCheckIn` passes it through when boolean.
- `stripTags` strips `<app_edit>`.

### Executor route: `app/api/app-edit/route.ts`

POST `{ ops: unknown[] }` →
1. Fetch `goalIds` + `trackerIds` once.
2. For each op: validate via `validateOp`; on pass, execute via `lib/db.ts` helpers; collect `{ ok, detail }` per op (detail = human-readable, e.g. `"deleted 14 tasks"`, `"unknown goal_id"`).
3. Return `{ results, applied, failed }`. HTTP 200 even with partial failures (the per-op results carry the truth); 400 only when `ops` is missing/empty/not an array.

### DB helpers: `lib/db.ts`

- `deleteTasksInRange(goalId: string | null, from: string, to: string, match?: string)` → count. Implemented as select-then-delete-by-ids so the `match` filter and completed-skip happen in JS (PostgREST `ilike` on description is avoidable complexity).
- `shiftTasks(goalId: string | null, from: string, to: string, days: number, match?: string)` → count. Select matching incomplete tasks, batch-update each `date` (per-row update loop is fine at this scale).
- `createDailyTask(goalId, date, description)` — single insert (wraps existing `createDailyTasks`).
- `updateTaskDescription(id, description)`.
- `setTasksCompleted(ids: string[], completed: boolean)`.
- `getTasksForGoalDate(goalId, date)` → tasks (resolution helper for single-task ops).
- `updateGoal(id, patch: Partial<Pick<Goal, 'title' | 'description' | 'deadline'>>)`.
- Light days reuse existing `setLightDays([date], light)`.
- Tracker edits reuse existing `updateTracker` + `normalizeTrackerPatch`.

### Adjustment extraction: `lib/adjust.ts`

Extract the body of `app/api/adjust/route.ts` into `runAdjustment(goalId: string, instruction?: string)` returning `{ ok, count?, skipped? }`. The route becomes a thin wrapper (no behavior change). `instruction`, when present, is added to the JSON payload the adjustment LLM receives (`{ goal, logs, futureTasks, trackers, instruction }`) and `ADJUSTMENT_SYSTEM` documents it: "instruction: an explicit user request — follow it even if logs suggest otherwise." The `redistribute` op calls `runAdjustment(goal_id, note)`. `/api/adjust` POST body also accepts optional `instruction` (used by nothing yet — keeps route/lib signatures aligned).

### Advisor context: upcoming schedule visibility

`ADVISOR_SYSTEM` gains a section after Today's Tasks:

```
## Upcoming Tasks (next 14 days)
2026-06-13 (Math modules M21–M23): Continue M21: parts 10-12
2026-06-13 (SAT prep): Timed reading section [done]
2026-06-14 (Physics): …
```

Built by a new helper `buildUpcomingSummary(goals, tasks)` in `lib/appEdit.ts` — one line per task, `[done]` marker on completed ones, `"No upcoming tasks."` when empty. The chat route fetches `getTasksInRange(localDate(1), localDate(14))`. No task UUIDs in context — single-task ops address by goal+date+match, which the executor resolves.

### Prompt capability block (`ADVISOR_SYSTEM`)

New block after **Delete a tracker**, documenting the op vocabulary with one realistic multi-op example, plus rules:
- Describe the planned changes in plain language in the visible reply; put the machine form only in the tag.
- The user confirms with a button — propose, don't ask "should I?".
- Dates must be exact YYYY-MM-DD; use goal ids from the Goals list and tids from the Trackers list.
- For single-task edits, include a `match` substring when the goal has more than one task that day.
- Completed tasks can't be deleted or shifted.
- Recaps still use `check_in`/`tracker_update`, never `app_edit`.

### Check-in auto check-off

`check_in` entries gain `done?: true` — emitted when the recap says the user completed that goal's work for the day. Client flow in `AdvisorChat.tsx`: after the check-in POST succeeds, for each entry with `done`, fetch today's tasks (`GET /api/tasks?start=<today>&end=<today>`, once, cached for the loop) and PATCH each incomplete task of that goal via the existing `/api/tasks/[id]/complete`. This happens before the adjust calls (same reason as tracker updates: adjustment must see fresh state). Prompt instruction added to the check-in block: set `done` only when they clearly finished the day's planned work for that goal — partial progress is notes-only.

### Client confirm button (`AdvisorChat.tsx`)

- `pendingAppEdit = extractAppEdit(lastAssistantContent)`.
- Renders below the chat like the other confirm buttons: the `summary` in small muted text, then a moss "Apply N change(s) ✓" button (disabled while applying).
- On tap → POST `/api/app-edit` → on response, `router.refresh()` + append assistant message: all ok → `"✓ Applied N changes."`; partial → `"Applied X of N — <first failure detail>"`; the message ends the pending state (same self-clearing pattern as the other buttons).
- Network failure → inline error + Retry (same as Save Goal).

### Root-cause fix: schedule start date

`app/api/goals/generate-schedule/route.ts`: start date becomes `const start = today < SEASON.start ? SEASON.start : today` (import `SEASON`), used for both the prompt's `Start date:` and implicitly the horizon. The 30-day horizon end stays anchored to `localDate(30)` — if that lands before the clamped start (creating a goal >30 days pre-season), skip generation... in practice the horizon is from *today*, so for a pre-season goal the window `[SEASON.start, today+30d]` could be thin; acceptable — the adjustment loop extends schedules as check-ins arrive. (The clamp is live immediately: today is pre-season — June 12, season starts June 15 — so any goal created now schedules from June 15 instead of recreating the bug.)

## Error handling

- Malformed `<app_edit>` JSON → extractor returns null → no button (advisor's prose still shows; user can re-ask).
- Per-op validation failures → recorded in results, surfaced in the partial-success message; never abort the batch.
- Single-task resolution ambiguity (0 or >1 matches) → op fails with `"no matching task"` / `"N tasks match — be more specific"`.
- `redistribute` failures inherit `runAdjustment`'s existing guards (unparseable LLM output → skip, never wipe the schedule).
- All dates validated server-side regardless of what the model emitted.

## Testing

- `lib/appEdit.test.ts`: `validateOp` for every op (valid + each failure mode), `buildUpcomingSummary` formatting.
- `lib/advisorParse.test.ts`: `extractAppEdit` (valid, malformed, missing summary/ops), `check_in` `done` passthrough, `stripTags` coverage.
- Existing suites stay green; `pnpm lint`, `tsc --noEmit`, `pnpm build` clean.
- Manual: dev-server smoke (page 200s, `/api/app-edit` validation 400/partial-failure paths via curl), then a live chat test on prod after deploy ("clear all tasks before June 15") — which is the very request that motivated the feature.

## Rollout

No schema changes. Feature branch → tests/review → push + PR (or merge on request). After deploy, Harrison's pre-season cleanup happens *through the feature itself* in chat.
