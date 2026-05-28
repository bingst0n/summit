# Summit v2 Design Spec

**Date:** 2026-05-27  
**Status:** Approved

## Overview

Summit is a personal summer planning PWA where an LLM advisor manages your schedule. The core interaction is conversational: you talk to the advisor, it plans and adjusts your summer. The calendar provides temporal context. The home screen shows what to do today.

---

## Navigation

Three bottom tabs replace the current page-link structure:

| Tab | Route | Purpose |
|-----|-------|---------|
| Home | `/` | Today's tasks, check-in banner, upcoming preview |
| Calendar | `/calendar` | Month view, goal dots, light-day marking |
| Advisor | `/advisor` | Persistent LLM chat, proactive briefing |

The `/goals` page is removed. Goal management (add via advisor, delete via advisor) lives entirely in conversation. The `/chat` route is retired — intake moves into the Advisor tab.

---

## Home Tab (`/`)

**Header:** Today's date, "N days left this summer."

**Check-in banner:** If the user has not checked in today, shows "Tell the advisor how your day went" with a "Log Now" button that opens the Advisor tab. If checked in, shows green "Logged" state.

**Today's tasks:** Flat list of all daily tasks scheduled for today across all goals. Each task has:
- A checkbox — tapping marks the task done (updates `daily_tasks.completed`)
- Task description
- Goal label (color-coded per goal)

Completed tasks render with strikethrough and muted color.

**Coming up:** Collapsed rows for the next 2–3 days showing date and task count (e.g. "Wed 28 · 3 tasks"). Tapping a row navigates to the Calendar tab with that day selected.

**No extra "Add Goal" button** — the Advisor tab is always one tap away in the nav bar.

---

## Calendar Tab (`/calendar`)

**Month view:** Standard calendar grid, swipe or arrow buttons to navigate months. Today is highlighted.

**Day cells:** Each day shows small colored dots — one per goal that has a task scheduled on that day. Each goal gets a consistent color (assigned at goal creation). Days with no tasks show no dots. Light days show a subtle warm tint behind the date number with a "light" label.

**Day-detail sheet:** Tapping a day opens a bottom sheet showing:
- Date header
- Light-day toggle (off by default; toggling on inserts a row in `calendar_marks`; toggling off deletes it)
- Task list for that day: task description + goal label per task

**Light-day semantics:** A light day is fed to the LLM as a soft constraint when generating or adjusting the schedule. The LLM schedules fewer or shorter tasks on light days. No "fully blocked" state exists — travel or full conflicts are communicated to the advisor in conversation.

---

## Advisor Tab (`/advisor`)

### Opening state

Every time the tab is opened (or the page is freshly loaded), the advisor generates a **proactive briefing** based on current state:
- Today's tasks and their checkbox state
- Whether the user has logged today
- Anything notable (tasks not done yesterday, schedule shifts, upcoming light days)

The briefing is the first assistant message in the conversation for that session. It is generated server-side on tab load via a dedicated `/api/advisor/brief` endpoint so it streams in immediately. On completion, the briefing text is saved as the first entry in `conversation_state.recent_messages` for the session, so subsequent `/api/advisor/chat` calls see it as part of the conversation history.

### Persistent chat

Standard chat UI: user messages on the right, advisor on the left. The advisor can:
- **Add goals** — intake flow (existing: clarifying questions → `<goal_data>` block → confirm → save + generate schedule)
- **Adjust the schedule** — user describes a constraint or change; advisor calls `/api/adjust` and shows "Updating schedule…" while it runs
- **Answer questions** — about the schedule, goals, progress
- **Accept check-ins** — user says how the day went; advisor saves a log and fires adjustment
- **Delete goals** — user asks to drop a goal; advisor confirms, then calls `DELETE /api/goals/:id`

### Memory model

Each session, the LLM is initialized with a system prompt containing:
1. All goals (title, type, deadline, description)
2. Today's tasks and their completion state
3. Last 7 days of logs (date + notes)
4. Light-day marks for the next 30 days
5. A compressed text summary of past conversations (stored in `conversation_state.summary`)
6. The last 10 messages verbatim (stored in `conversation_state.recent_messages`)

After each assistant turn, if `recent_messages` exceeds 20 messages, the oldest 10 are compressed into the running summary via a background call to Claude (short prompt: "Summarize these messages into 2–3 sentences, preserving any goals added, schedule changes made, or constraints mentioned.").

### Schedule update UX

When the advisor decides to update the schedule, it:
1. Calls `/api/adjust` (or `/api/goals/generate-schedule` for new goals) from within the API route
2. Responds with a brief inline indicator: a small "Updating schedule…" chip in the chat
3. Replaces the chip with "Schedule updated" on completion

---

## Check-in Flow

The Pushcut notification fires at 7 PM (existing cron). Tapping it opens the app to the Advisor tab. The advisor's proactive briefing for that session is check-in-aware: if it's evening and the user hasn't logged, the opening message prompts them to share how the day went.

The user responds conversationally. The advisor extracts the log, calls `upsertLog` for each goal mentioned (or for all goals if general), then fires `/api/adjust` for continuous goals.

No separate `/checkin` page is needed.

---

## Data Model Changes

### New table: `calendar_marks`

```sql
create table calendar_marks (
  date date primary key,
  capacity text not null default 'light' check (capacity in ('light')),
  created_at timestamptz default now()
);
```

### New table: `conversation_state`

```sql
create table conversation_state (
  id integer primary key default 1,  -- single-user; always upsert on id=1
  summary text not null default '',
  recent_messages jsonb not null default '[]',
  updated_at timestamptz default now()
);
```

### Modified table: `daily_tasks`

Add a `completed` boolean column:

```sql
alter table daily_tasks add column completed boolean not null default false;
```

### Removed

- `milestones` table (already dropped in Phase 2)
- `/goals` page and route
- `/chat` route (absorbed into Advisor tab at `/advisor`)
- `/checkin` page and route

---

## API Surface

### New endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/advisor/brief` | Generate proactive briefing (streaming) |
| GET/POST | `/api/advisor/chat` | Persistent chat (streaming, loads + saves conversation_state) |
| GET | `/api/calendar-marks` | Fetch all calendar marks |
| POST | `/api/calendar-marks` | Toggle a light-day mark |
| PATCH | `/api/tasks/:id/complete` | Mark a task complete/incomplete |

### Existing endpoints retained

- `POST /api/goals/generate-schedule` — goal creation + schedule gen
- `POST /api/adjust` — post-checkin schedule redistribution
- `GET /api/dashboard` — dashboard data (add `completed` to task response)
- `DELETE /api/goals/:id` — goal deletion

### Retired

- `POST /api/chat` — replaced by `/api/advisor/chat`

---

## Goal Color Assignment

Each goal gets a color from a fixed palette assigned at creation time and stored in `goals.color`. The palette uses Tailwind CSS color hex values (indigo, violet, emerald, amber, rose, sky — 6 colors, cycling if more goals exist).

```sql
alter table goals add column color text not null default '#6366f1';
```

---

## Components

### New

- `components/TabBar.tsx` — bottom nav with Home / Calendar / Advisor tabs, active state per route
- `components/TaskItem.tsx` — checkbox + description + goal label, calls PATCH on toggle
- `components/CalendarGrid.tsx` — month grid with dot rendering and light-day tinting
- `components/DaySheet.tsx` — bottom sheet: light-day toggle + task list for selected day
- `components/AdvisorChat.tsx` — chat UI: message list + streaming input, loads conversation_state

### Modified

- `app/page.tsx` — Home tab: uses TaskItem, adds "Coming up" section, check-in banner opens Advisor
- `app/layout.tsx` — wraps all pages in TabBar

### New pages

- `app/calendar/page.tsx` — Calendar tab
- `app/advisor/page.tsx` — Advisor tab

### Removed

- `app/goals/page.tsx`
- `app/goals/new/page.tsx` (already deleted)
- `app/chat/page.tsx`
- `app/checkin/page.tsx`
