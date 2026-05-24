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

**LLM-mediated adjustment:** LLM reads logs and redistributes remaining work dynamically. Ahead → lighter upcoming days. Behind → spread backlog across remaining time. Schedule always reflects actual progress.

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

- `public/manifest.json` — PWA manifest (display: standalone)
- Service worker registered in `app/layout.tsx`
- Must be served over HTTPS (Vercel handles this)

## Notifications

Daily check-in fires at 7 PM via a Vercel Cron job hitting `GET /api/cron/checkin`, which calls the Pushcut webhook. Pushcut notification name and API secret are stored in environment variables.

## Deployment

- Production URL: `https://lockin-lake.vercel.app`
- Vercel project: `bingst0ns-projects/lockin`
- Cron fires at 23:00 UTC daily (= 7 PM ET) via `vercel.json`

## Environment Variables

All 7 vars must be set in Vercel dashboard (Settings → Environment Variables) AND `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=        # base URL only, no /rest/v1/ suffix
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
PUSHCUT_API_KEY=
PUSHCUT_NOTIFICATION_NAME=summit-checkin
NEXT_PUBLIC_APP_URL=             # https://lockin-lake.vercel.app in prod
CRON_SECRET=                     # random secret; Vercel passes it as Bearer token to cron route
```

## Supabase Schema

Three tables: `goals`, `milestones` (FK → goals, cascade delete), `daily_logs` (FK → goals, unique on date+goal_id).

## Phase Status

- Phase 1: complete — Supabase tables created, env vars in Vercel ✓ (note: schema will be reworked in Phase 2)
- Phase 2 (in design): Rearchitect around LLM — conversational goal intake, continuous vs one-shot goal types, free-form log system, dynamic schedule generation and adjustment
- Phase 3: weekly summary notification, pacing warnings, heatmap
