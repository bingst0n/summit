# Remove "days behind" framing

**Date:** 2026-06-16
**Status:** Approved (user authorized design + implement, no review gate)

## Motivation

Missing a gym session or doing less math than planned is not a failure to be
tracked as debt. The home screen currently renders a red **"X DAYS BEHIND"**
badge (and a red progress bar) whenever a goal has incomplete tasks dated before
today. For daily habits and open-ended preparation — work that has no specific
deliverable — a missed day should simply be skipped, with the schedule updated
to reflect reality, not carried forward as a backlog to repay.

## Scope

Two coupled, low-risk changes. **No data is deleted or auto-cleared** — this is a
display + prompt-wording change. Past misses are absorbed by the existing weekly
out-of-band re-plan (`scripts/planner/`).

### 1. Home goal cards — `app/page.tsx`

- Drop the `overdue` field from the per-goal `stats` accumulator; nothing else
  reads it.
- Remove the `behind` flag and the red ember progress bar. The bar is always the
  calm `bg-moss` colour.
- Replace the `behind ? "X DAYS BEHIND" : "ON PACE"` status line with a neutral
  `{done}/{total} DONE`. Keep the existing `NO SCHEDULE YET` state for
  `total === 0`.

### 2. Adjustment prompt — `lib/prompts.ts`

- Reword the `ADJUSTMENT_SYSTEM` redistribution rule. Replace
  `Behind → spread the backlog evenly, never pile everything onto tomorrow`
  with language that frames lighter-than-planned progress as a simple re-spread,
  and states that for daily habits / open-ended prep a missed day is skipped,
  not carried forward.

### 3. Project doc — `CLAUDE.md`

- Soften the line-19 description of LLM-mediated adjustment to drop the
  "backlog" / "behind" debt framing, keeping it consistent with the above.

## Out of scope

- Auto-deletion of stale tasks (explicitly declined — planner re-absorbs).
- Calendar page styling of past-incomplete tasks (no "behind" badge there today).
- Any change to `scripts/planner/state.mjs` (its `(past)` marker is an internal
  planning cue, not user-facing).
