# Progress Trackers — Design

**Date:** 2026-06-10
**Status:** Approved (sections 1–3 reviewed interactively; remainder delegated — "execute and run overnight")

## Summary

A new **Progress** tab where Harrison and the advisor LLM can view and edit fine-grained progress on goals: discrete position steppers ("I'm on part 12 of 22 in Module 21") and counter bars ("4 of 10 practice tests"). Trackers are editable in the UI, creatable manually or conversationally, auto-updated by the advisor from check-ins, fed into the schedule-adjustment loop, and creatable from a pasted course URL (server fetches the page, advisor extracts the module structure).

## Decisions made during brainstorming

| Question | Decision |
|---|---|
| Tracker ↔ goal relationship | Attached to goals, 0–many per goal; Progress page groups by goal (goals act as categories) |
| Scheduling integration | Fully wired in: advisor auto-updates trackers from check-ins; adjustment LLM sees tracker state |
| Placement | New 5th nav tab "Progress" |
| Tracker kinds | `steps` (sequential pips) and `counter` (numeric toward target). No checklist kind. |
| Creation | Advisor chat (with confirm button) **plus** a manual "+ add" inline form on the Progress page |
| Course links | Best-effort server-side fetch; on failure the advisor asks the user to paste the syllabus text |
| Advisor mechanism | Extend the existing text-tag protocol (Approach A) — no tool-use migration |

## Non-goals

- No checklist tracker kind.
- Home page goal progress stays task-completion-based; trackers do **not** change Home's percentages.
- No headless-browser scraping; public-page fetch only.
- No advisor-driven tracker *renaming/retotaling* — that's UI-only (⋯ menu). Advisor can create, update `current`, and delete.

## Data model

New Supabase table (SQL staged in `dummy.txt`; also added to `supabase/schema.sql`):

```sql
create table trackers (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('steps', 'counter')),
  total numeric not null,
  current numeric not null default 0,
  unit text,           -- counter: "tests", "problems", "%"; steps: the step noun ("parts", "units" — default 'parts')
  step_labels jsonb,   -- steps only: optional labels array, length == total
  source_url text,     -- set when built from a pasted link
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table trackers disable row level security;
```

Semantics:
- Both kinds share `current`/`total`; fraction = `current/total` everywhere (UI, prompts, adjustment).
- `steps`: `current = 12` means parts 1–12 done, next is part 13. `total` is an integer ≥ 1. `unit` is the step noun for display ("parts", "units"), defaulting to `'parts'`.
- `counter`: `current` counts toward `total` in `unit`. A percent bar is `total = 100, unit = '%'`.
- If `step_labels` is present the server normalizes `total` to `step_labels.length`.

`lib/types.ts` gains:

```ts
export type TrackerKind = 'steps' | 'counter'
export interface Tracker {
  id: string
  goal_id: string
  name: string
  kind: TrackerKind
  total: number
  current: number
  unit: string | null
  step_labels: string[] | null
  source_url: string | null
  created_at: string
  updated_at: string
}
```

`lib/db.ts` gains: `getTrackers()`, `getTrackersForGoal(goalId)`, `createTrackers(rows)` (batch insert, returns rows), `updateTracker(id, patch)` (sets `updated_at`), `deleteTracker(id)`.

## API routes

Follow the existing route conventions (service-role client server-side, JSON errors with status codes):

- `GET /api/trackers` — all trackers, ordered by `created_at`.
- `POST /api/trackers` — body `{ trackers: [...] }` (batch; the advisor confirm button and the manual form both use it). Validation: goal exists; `kind` valid; `name` non-empty; `total ≥ 1` (and an integer when `kind = 'steps'`); `current` clamped to `[0, total]`; if `step_labels` present, `total := step_labels.length`; steps default `unit` to `'parts'`. Returns created rows.
- `PATCH /api/trackers/[id]` — partial `{ current?, name?, total?, unit? }`; `current` clamped to `[0, total]` (using the new total when both change); bumps `updated_at`.
- `DELETE /api/trackers/[id]`.

## Progress page UI

- `app/progress/page.tsx` — server component; fetches goals + trackers via `lib/db`, passes to client (same pattern as `CalendarPageClient`).
- `components/ProgressPageClient.tsx` — groups trackers under goal headers (goal `created_at` order, matching Home). Each header: goal title, blended % (unweighted mean of that goal's tracker fractions), "+ add" button.
- `components/TrackerCard.tsx` — two render modes:
  - **steps**: row of pips (done = moss, current position glow = ember, rest = line). Tap pip *n* → `current = n`; tapping the currently-last-done pip steps back to *n − 1* (tapping pip 1 when current = 1 → 0). Meta line: `12 / 22 parts · next: part 13` — or the label (`next: Differentiation basics`) when `step_labels` exists.
  - **counter**: gradient bar (ember → ember2), − / + buttons (±1, clamped), tap the number → inline numeric input to set an exact value.
  - ⋯ menu: rename, edit total/target, delete (single confirm tap: menu item becomes "Delete?" on first tap).
- **Add form** (inline under the goal header when "+ add" tapped): name, kind toggle (steps/counter), total/target, unit (counter only). POSTs to `/api/trackers`.
- All edits are optimistic: instant UI, request in background, revert + brief error note on failure (same feel as task check-off on Home).
- New nav item PROGRESS in `components/navItems.tsx` (mountain-flag icon, 5 tabs mobile / 5 sidebar items desktop), placed between CALENDAR and ADVISOR.

## Advisor integration (tag protocol — Approach A)

New tags in `lib/advisorParse.ts`, with extractors + `stripTags` coverage:

- `<tracker_create>[{goal_id, name, kind, total, unit?, step_labels?, source_url?}]</tracker_create>`
  Proposed when the user describes trackable structure or pastes a course link. Client renders a **confirm button** ("Create N trackers ✓", Save-Goal pattern). On tap → `POST /api/trackers`, then `router.refresh()` and a ✓ message.
- `<tracker_update>[{tracker_id, current}]</tracker_update>`
  Emitted at the END of a check-in style reply when the recap implies movement. **Automatic** (no confirm), like `<check_in>`.
- `<tracker_delete>{"id":"...","name":"..."}</tracker_delete>`
  Confirm button, same as goal deletion.

**Client ordering in `AdvisorChat.tsx`:** after a completed stream, extract `tracker_update` first and await all PATCHes, **then** run the check-in flow (which triggers `/api/adjust`) — so adjustment always sees fresh tracker state.

**`ADVISOR_SYSTEM` changes:**
- New context section `## Trackers` listing every tracker grouped by goal: `- [tid:<id>] Module 21 (steps, 12/22 parts, next: part 13)` / `- [tid:<id>] Practice tests (counter, 4/10 tests)`. "No trackers." when empty.
- New capability blocks for create / update / delete with the check-in guardrails: update only on genuine recaps of completed work, never plans or hypotheticals; if it's unclear which part was reached, ask instead of guessing; use exact `tid:` ids; the user never sees tags, so the visible reply must stand alone.
- Course-link guidance: when fetched page content is present, extract the ordered unit/module structure into `step_labels`; if no goal fits, run goal intake first, then propose trackers after the goal saves; if the fetch failed or the structure isn't extractable, say so and ask the user to paste the module list.

**`ADVISOR_BRIEF_SYSTEM`:** gets the same `## Trackers` section so briefs can reference real position.

**`ADJUSTMENT_SYSTEM` / `/api/adjust`:** the adjustment payload includes the goal's trackers (name, kind, current/total, unit, next-step label) so redistribution works from true position, not just log prose.

## URL fetching (chat route)

In `app/api/advisor/chat/route.ts` POST, before calling Claude:

1. Regex-detect `https?://` URLs in the user message (first URL only).
2. Fetch server-side: 10 s timeout via `AbortController`, follow redirects, reject non-HTML/oversize (~200 KB cap), strip tags/scripts/styles to text, collapse whitespace, truncate to ~10 k chars.
3. Inject as an **ephemeral** block appended to the final user message in `messagesForApi` only: `<fetched_page url="...">…</fetched_page>` — or `<fetched_page url="..." error="...">` on failure so the model knows to ask for a paste.
4. The **persisted** conversation keeps the user message exactly as typed — page dumps never enter `conversation_state` or the compression loop.

Helper lives in a new `lib/fetchPage.ts` (pure: URL detection + HTML→text), unit-testable without network.

## Error handling

- API validation errors → 400 with `{ error }`; unknown tracker → 404.
- Malformed tag JSON → extractor returns `null`, tag ignored (existing pattern).
- `current` always clamped server-side; UI also clamps locally.
- Optimistic update failure → revert state + inline error note.
- Page fetch failure → ephemeral error block; advisor falls back to asking for pasted text; chat keeps working.

## Testing

Vitest, matching existing test layout:
- `lib/advisorParse.test.ts` — extractors for all three new tags (valid, malformed JSON, missing fields) + `stripTags` removes them.
- `lib/fetchPage.test.ts` — URL detection (none/one/many, punctuation trailing), HTML→text stripping, truncation, non-HTML rejection.
- `lib/trackerMath.test.ts` (pure helpers used by UI/api) — fraction calc, blended goal %, pip-tap semantics (tap n → n; tap current → n−1; clamping), step_labels/total normalization.
- API route validation covered through the pure validators it delegates to.
- `pnpm lint` and `pnpm build` green; manual verification of the page + advisor flows via dev server.

## Rollout

1. Implementation on a feature branch in an isolated worktree — **not merged to main** until the `trackers` table exists in Supabase.
2. Morning steps for Harrison: run `dummy.txt` SQL in the Supabase SQL editor → merge/push → verify on prod.
