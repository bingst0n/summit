# Check-in Loop — Design Spec

**Date:** 2026-05-28
**Status:** Approved (brainstorming complete; ready for implementation plan)

## Problem

Summit's defining mechanic — *check-in → save daily log → LLM redistributes the remaining schedule* — is not connected end-to-end. The `ADVISOR_SYSTEM` prompt already tells the model to accept check-ins ("The client will save the log and trigger a schedule adjustment"), but:

- `AdvisorChat.tsx` only detects `<goal_data>` and `<delete_goal>` tags. There is no check-in handling; the relevant block in `sendMessage` (`AdvisorChat.tsx:110-113`) is an empty stub.
- Nothing in the live app writes to `daily_logs` or calls adjustment. `upsertLog` is only called by `/api/checkin`, and `/api/adjust` is called by nobody — both are working but orphaned routes, stranded when the old `/checkin` page was deleted in v2.

Result: when the user tells the advisor "I did X today," the model acknowledges it but nothing persists and the schedule never adapts. `recentLogs` is always empty, the Home check-in banner's `loggedToday` never flips true, and the core product promise is unmet.

## Goals

- A day-recap typed into the Advisor is automatically saved to `daily_logs` and triggers a schedule rewrite for the affected goals — with no extra taps.
- Reconnect the existing, working `/api/checkin` and `/api/adjust` routes rather than rebuild them.
- Keep the change small and consistent with the existing tag-detection pattern.

## Non-goals (out of scope)

- Travel/constraint handling ("I'm traveling Thursday") — already served conversationally + by the Calendar light-day toggle.
- Cleaning up duplicate test goals in the DB; loading real goals from `todo.txt`.
- The orphaned `/history` page; Phase 3 features (weekly summary, pacing warnings, heatmap).
- Any DB schema change — none is needed.

## Decisions (from brainstorming)

- **Automation:** Fully automatic. The advisor detects the check-in, the client silently saves the log and rewrites the upcoming schedule in the background, surfacing only a subtle status indicator.
- **Adjustment scope:** Only the goals the user actually mentions. The advisor maps the check-in to specific `goal_id`s; the client adjusts exactly those continuous goals.
- **Architecture:** Approach A — client-orchestrated, mirroring the existing `<goal_data>` / `<delete_goal>` flow.
- **Testing:** Minimal vitest covering the pure parser functions; manual smoke-test for the full loop.

## Architecture / data flow

```
User types a day-recap in Advisor
      │
      ▼
POST /api/advisor/chat  ──streams──▶  advisor reply (warm acknowledgement)
                                       + trailing <check_in> tag (hidden from UI)
      │
      ▼  (client, after the stream completes)
extractCheckIn(text) → [{goal_id, notes}, …]   (null/empty → do nothing)
      │
      ├─▶ POST /api/checkin {date: today(), logs}      → upsertLog per goal
      │
      └─▶ POST /api/adjust {goal_id}  ×N (mentioned goals, Promise.all)
                                       → rewrites future daily_tasks per goal
      │
      ▼
scheduleStatus: 'updating' → 'updated'  ; router.refresh()
```

Detection happens off the freshly streamed response text inside `sendMessage`, never off historical messages loaded via `GET /api/advisor/chat` — so re-opening the Advisor does not re-fire saved check-ins.

## Detailed changes

### `lib/prompts.ts` — rewrite the check-in section of `ADVISOR_SYSTEM`

Replace the current "**Accept a check-in**" bullet with:

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

The Goals list injected into `ADVISOR_SYSTEM` already renders each goal as `- [id:${g.id}] …`, so the model has the ids it needs.

### `lib/advisorParse.ts` — new module (pure functions)

Extract the existing parsers out of `AdvisorChat.tsx` and add the check-in parser, so all tag parsing is pure and unit-testable in one focused module:

- `extractGoalData(text): GoalData | null`
- `extractDeleteGoal(text): { id: string; title: string } | null`
- `extractCheckIn(text): Array<{ goal_id: string; notes: string }> | null` — regex-match `<check_in>…</check_in>`, `JSON.parse` the array; return `null` on no match or parse failure, and `null` for an empty array (nothing to do).
- `stripTags(text): string` — strips `<goal_data>`, `<delete_goal>`, **and** `<check_in>` blocks, then trims.

### `components/AdvisorChat.tsx`

- Import the parsers from `lib/advisorParse` (remove the local copies).
- Extend the existing `scheduleStatus` state union from `'idle' | 'updating' | 'updated'` to add `'error'` (the state already exists but is currently unused).
- Replace the dead stub at `sendMessage` lines 110-113 with the check-in loop, operating on the just-streamed `text`:
  1. `const checkIn = extractCheckIn(text)`; if falsy, return.
  2. `setScheduleStatus('updating')`.
  3. `await fetch('/api/checkin', { POST, body: { date: today(), logs: checkIn } })` (`today()` from `lib/utils`).
  4. `await Promise.all(uniqueGoalIds.map(id => fetch('/api/adjust', { POST, body: { goal_id: id } })))`.
  5. On success: `setScheduleStatus('updated')`, `router.refresh()`, then reset to `'idle'` after a short delay (~3s).
  6. On any thrown/`!ok` failure: `setScheduleStatus('error')`.
- Render a **subtle inline status indicator** (distinct from the full-screen `saving` takeover used for goal creation), shown just above the input bar when `scheduleStatus !== 'idle'`:
  - `'updating'` → "Updating your schedule…" with animated dots.
  - `'updated'` → "Schedule updated ✓" (auto-fades via the reset to `'idle'`).
  - `'error'` → "Couldn't update schedule · Retry" where Retry re-runs the loop for the last check-in.
- The chat input is never disabled by this flow — it is fully background.

### Reused unchanged

- `app/api/checkin/route.ts` — `POST {date, logs:[{goal_id,notes}]}` → `upsertLog` per entry. No change.
- `app/api/adjust/route.ts` — `POST {goal_id}` → reads goal + last-7-day logs + future tasks, calls Claude `ADJUSTMENT_SYSTEM`, `replaceFutureTasks`. Already no-ops for oneshot goals, goals with no future tasks, and unparseable model output. No change.

## Error handling

Because the loop is fully automatic and runs in the background, no failure interrupts the conversation. Logs persist independently of adjustment, so a failed `/api/adjust` still leaves the check-in saved — the schedule simply doesn't change and the indicator shows `'error'` with a Retry. `/api/adjust` already swallows JSON-parse failures and returns `{ok:true}`, so a malformed model adjustment leaves the existing schedule intact rather than wiping it.

## Edge cases

- **No goal mapping:** general reflection not tied to a goal yields an empty/absent `<check_in>` → nothing saved (acceptable; `daily_logs` requires a `goal_id`).
- **Oneshot goal in the check-in:** log saves; `/api/adjust` no-ops for it. Matches "only goals you mention" without rewriting a non-scheduled goal.
- **Second check-in same day, same goal:** `upsertLog` replaces on `(date, goal_id)`. The prompt instructs the advisor to fold prior progress (visible in Recent Logs) into the new note, so nothing is lost in practice.
- **Historical messages:** detection runs only on freshly streamed responses, so loading conversation history never re-fires a check-in.

## Testing

### `vitest` setup
- Add `vitest` as a devDependency, a `"test": "vitest run"` script to `package.json`, and a minimal `vitest.config.ts` (with the `@/` path alias so test imports match app imports).

### `lib/advisorParse.test.ts`
- `extractCheckIn`: valid single/multi-goal arrays; missing tag → `null`; malformed JSON → `null`; empty array → `null`.
- `extractGoalData` / `extractDeleteGoal`: present vs absent vs malformed.
- `stripTags`: removes each of the three tag types (and combinations) while preserving surrounding prose; trims.

### Manual smoke-test
1. In Advisor, type a recap mentioning one continuous goal.
2. Confirm a `daily_logs` row appears for today with that `goal_id`.
3. Confirm that goal's future `daily_tasks` are rewritten.
4. Confirm the Home banner flips to "Logged for today" and the inline indicator transitions updating → updated.
5. Type a non-recap ("what should I do today?") and confirm no log/adjustment fires.

## File map

**Modify**
- `lib/prompts.ts` — rewrite check-in section of `ADVISOR_SYSTEM`
- `components/AdvisorChat.tsx` — use shared parsers, replace dead stub with the check-in loop, add inline status indicator, extend `scheduleStatus` union
- `package.json` — add `test` script + `vitest` devDependency

**Create**
- `lib/advisorParse.ts` — pure tag parsers (`extractGoalData`, `extractDeleteGoal`, `extractCheckIn`, `stripTags`)
- `lib/advisorParse.test.ts` — vitest unit tests
- `vitest.config.ts` — minimal config with `@/` alias

**Reused unchanged**
- `app/api/checkin/route.ts`, `app/api/adjust/route.ts`
