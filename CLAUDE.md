# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Summit** is a PWA (Progressive Web App) for LLM-mediated summer goal tracking. Goals are entered conversationally (not via forms), daily check-ins are free-form text logs, and an LLM continuously adjusts the schedule based on actual progress. Data syncs across phone and laptop via Supabase.

### Core Functionality

**Goal types:**
- **Continuous goals** (e.g., "practice calculus daily") — LLM distributes work into daily/near-daily to-dos across the summer based on scope, available time, and deadlines.
- **One-shot projects** (e.g., "build a personal website") — sit in a separate queue; app surfaces ~weekly reminders to choose when to slot them in.

**Goal intake:** Conversational LLM prompt. User describes in natural language → LLM asks clarifying questions → extracts scope, deadline, goal type → confirms before saving.

**Daily check-ins:** Free-form text only (what I did, what I didn't, anything that came up). No checkboxes or star ratings.

**LLM-mediated adjustment:** LLM reads logs and redistributes remaining work dynamically. Ahead → lighter upcoming days. Lighter progress than planned → re-spread remaining work across the days left (no "days behind" framing; missed daily/open-ended work is skipped, not carried forward as a backlog). Schedule always reflects actual progress.

## Stack

- **Framework**: Next.js (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Database**: Supabase (Postgres)
- **Notifications**: Pushcut (webhook-triggered)
- **Hosting**: Vercel (with Vercel Cron for the 7 PM daily notification)

## Commands

```bash
pnpm dev        # Start dev server
pnpm build      # Production build
pnpm lint       # ESLint
```

## Architecture

- `app/` — Next.js App Router pages and layouts
- `app/api/` — API routes (Supabase mutations, Pushcut webhook trigger, cron endpoint)
- `components/` — Shared UI components
- `lib/supabase.ts` — Supabase client (browser + server)
- `lib/pushcut.ts` — Pushcut webhook helper

## PWA Setup

- `app/manifest.ts` — PWA manifest (display: standalone), served at `/manifest.webmanifest`
- `app/icon.tsx` / `app/apple-icon.tsx` — generated app icons (192px PNG / 180px apple-touch-icon)
- `public/sw.js` — service worker (network-first; offline fallback to last cached page), registered by `components/ServiceWorkerRegistrar.tsx` in `app/layout.tsx`
- `viewportFit: 'cover'` in `app/layout.tsx` is required for iOS safe-area insets (`pt-safe`/`pb-safe` in `globals.css`)
- Must be served over HTTPS (Vercel handles this)

## Notifications

Tri-daily Pushcut focus reminders (8 AM / 12 PM / 6 PM ET) fire from a GitHub Actions schedule (`.github/workflows/reminders.yml` — cron lines are UTC and assume EDT; shift +1h when EST returns). Each run hits `GET /api/cron/checkin` with `CRON_SECRET` as a Bearer token (mirrored as a GitHub Actions secret). The route picks the slot message (morning / midday / evening focus reminders; evening deep-links to the advisor) from the current ET hour; `?slot=` overrides for testing. Vercel Cron is NOT used — the Hobby plan allows only 2 jobs at once-per-day.

## Deployment

- Production URL: `https://lockin-lake.vercel.app`
- Vercel project: `bingst0ns-projects/lockin`
- Reminder schedule lives in GitHub Actions, not `vercel.json` (kept as an empty `crons` array)

## Environment Variables

All 8 vars must be set in Vercel dashboard (Settings → Environment Variables) AND `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=        # base URL only, no /rest/v1/ suffix
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PUSHCUT_API_KEY=
PUSHCUT_NOTIFICATION_NAME=summit-checkin
NEXT_PUBLIC_APP_URL=             # https://lockin-lake.vercel.app in prod
CRON_SECRET=                     # random secret; Vercel passes it as Bearer token to cron route
ANTHROPIC_API_KEY=               # Anthropic API key for Claude chat, schedule generation, adjustment
```

## Supabase Schema

Five tables: `goals`, `daily_tasks` (FK → goals), `daily_logs` (FK → goals, unique on date+goal_id), `calendar_marks` (light days, PK on date), `conversation_state` (single row, id=1 — advisor chat history + rolling summary).

## Timezone Rule

All "what day is it" logic must use `today()`/`localDate()` from `lib/utils.ts` (America/New_York), never `new Date().toISOString()` — the server runs in UTC and rolls over to tomorrow at ~8 PM ET.

## Phase Status

- Phase 1: complete — Supabase tables, env vars, cron notification ✓
- Phase 2: complete — conversational advisor (goal intake, check-ins, deletion), schedule generation + adjustment loop, daily briefs, calendar with light days ✓
- Phase 3: weekly summary notification, pacing warnings, heatmap
