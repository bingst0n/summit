# Summit Rearchitect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Summit's structured form/milestone/star-rating system with LLM-mediated goal intake, dynamic daily task scheduling, and free-form text check-ins.

**Architecture:** Goals are created via a streaming Claude chat UI that extracts goal type (continuous vs one-shot), title, deadline, and daily commitment. Continuous goals get a generated schedule of daily tasks stored in `daily_tasks`. After each free-form check-in, Claude reads recent logs and redistributes the remaining schedule. One-shot goals sit in a queue with no schedule.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres), Anthropic SDK (`claude-sonnet-4-6`), Tailwind CSS, pnpm

---

## File Map

**Create:**
- `lib/claude.ts` — Anthropic client singleton
- `lib/prompts.ts` — System prompts for intake, schedule generation, adjustment
- `app/chat/page.tsx` — Goal intake streaming chat UI
- `app/api/chat/route.ts` — Streaming chat endpoint (passes messages to Claude)
- `app/api/goals/generate-schedule/route.ts` — Saves goal + generates daily_tasks for continuous goals
- `app/api/adjust/route.ts` — Post-checkin schedule redistribution

**Modify:**
- `lib/types.ts` — New Goal, DailyTask, DailyLog types
- `lib/db.ts` — New DB functions matching new schema
- `app/page.tsx` — Dashboard: today's tasks + one-shot queue + check-in banner
- `app/checkin/page.tsx` — Free-form text check-in (remove star ratings)
- `app/goals/page.tsx` — Update "Add" link to /chat
- `supabase/schema.sql` — Updated schema documentation

**Delete:**
- `app/goals/new/page.tsx`

---

## Task 1: Install Anthropic SDK and configure env

**Files:**
- Modify: `package.json` (via pnpm)
- Modify: `.env.local`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Install SDK**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm add @anthropic-ai/sdk
```
Expected: `@anthropic-ai/sdk` appears in `package.json` dependencies.

- [ ] **Step 2: Add API key to .env.local**

Open `.env.local` and add:
```
ANTHROPIC_API_KEY=sk-ant-...   # from console.anthropic.com → API Keys
```
Also add `ANTHROPIC_API_KEY=` (your key) in Vercel dashboard → Settings → Environment Variables.

- [ ] **Step 3: Update CLAUDE.md env vars section**

In `CLAUDE.md`, update the env vars block to add:
```
ANTHROPIC_API_KEY=             # Anthropic API key for Claude chat, schedule generation, adjustment
```

- [ ] **Step 4: Verify SDK loads**
```bash
cd /Users/harrisonrgreen/coding/lockin && node -e "require('@anthropic-ai/sdk'); console.log('ok')"
```
Expected: `ok`

- [ ] **Step 5: Commit**
```bash
git add package.json pnpm-lock.yaml CLAUDE.md
git commit -m "feat: add anthropic sdk"
```

---

## Task 2: Migrate schema and update types

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/migrate.sql`
- Modify: `lib/types.ts`

- [ ] **Step 1: Rewrite `supabase/schema.sql`**

Replace the entire file with:
```sql
-- Run this in Supabase SQL editor for a fresh project
create table goals (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('continuous', 'oneshot')),
  title text not null,
  description text,
  deadline date not null,
  raw_input text,
  created_at timestamptz default now()
);

create table daily_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  date date not null,
  description text not null,
  created_at timestamptz default now()
);

create table daily_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  goal_id uuid references goals(id) on delete cascade,
  notes text not null,
  created_at timestamptz default now(),
  unique(date, goal_id)
);

alter table goals disable row level security;
alter table daily_tasks disable row level security;
alter table daily_logs disable row level security;
```

- [ ] **Step 2: Write migration SQL to `dummy.txt`, then run it in Supabase SQL editor**

Write this to `dummy.txt`:
```sql
drop table if exists milestones cascade;
drop table if exists daily_logs cascade;
drop table if exists goals cascade;
drop table if exists daily_tasks cascade;

create table goals (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('continuous', 'oneshot')),
  title text not null,
  description text,
  deadline date not null,
  raw_input text,
  created_at timestamptz default now()
);

create table daily_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  date date not null,
  description text not null,
  created_at timestamptz default now()
);

create table daily_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  goal_id uuid references goals(id) on delete cascade,
  notes text not null,
  created_at timestamptz default now(),
  unique(date, goal_id)
);

alter table goals disable row level security;
alter table daily_tasks disable row level security;
alter table daily_logs disable row level security;
```
Go to supabase.com → your project → SQL Editor → paste → Run.

- [ ] **Step 3: Rewrite `lib/types.ts`**

Replace the entire file with:
```typescript
export type GoalType = 'continuous' | 'oneshot'

export interface Goal {
  id: string
  type: GoalType
  title: string
  description: string | null
  deadline: string
  raw_input: string | null
  created_at: string
}

export interface DailyTask {
  id: string
  goal_id: string
  date: string
  description: string
  created_at: string
}

export interface DailyLog {
  id: string
  date: string
  goal_id: string
  notes: string
  created_at: string
}
```

- [ ] **Step 4: Commit**
```bash
git add supabase/schema.sql lib/types.ts
git commit -m "feat: rearchitect schema — continuous/oneshot goals, daily_tasks, free-form logs"
```

---

## Task 3: Rewrite lib/db.ts

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: Replace `lib/db.ts`**

```typescript
import { supabase } from './supabase'
import type { Goal, DailyTask, DailyLog } from './types'

export async function getGoals(): Promise<Goal[]> {
  const { data } = await supabase.from('goals').select('*').order('created_at')
  return data ?? []
}

export async function getGoal(id: string): Promise<Goal | null> {
  const { data } = await supabase.from('goals').select('*').eq('id', id).single()
  return data
}

export async function createGoal(
  goal: Omit<Goal, 'id' | 'created_at'>
): Promise<Goal> {
  const { data, error } = await supabase.from('goals').insert(goal).select().single()
  if (error) throw error
  return data
}

export async function deleteGoal(id: string) {
  const { error } = await supabase.from('goals').delete().eq('id', id)
  if (error) throw error
}

export async function getTodayTasks(date: string): Promise<DailyTask[]> {
  const { data } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('date', date)
    .order('created_at')
  return data ?? []
}

export async function createDailyTasks(
  goalId: string,
  tasks: Array<{ date: string; description: string }>
) {
  const rows = tasks.map(t => ({
    goal_id: goalId,
    date: t.date,
    description: t.description,
  }))
  const { error } = await supabase.from('daily_tasks').insert(rows)
  if (error) throw error
}

export async function getFutureTasksForGoal(goalId: string): Promise<DailyTask[]> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const date = tomorrow.toISOString().split('T')[0]
  const { data } = await supabase
    .from('daily_tasks')
    .select('*')
    .eq('goal_id', goalId)
    .gte('date', date)
    .order('date')
  return data ?? []
}

export async function replaceFutureTasks(
  goalId: string,
  tasks: Array<{ date: string; description: string }>
) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const date = tomorrow.toISOString().split('T')[0]
  const { error: delErr } = await supabase
    .from('daily_tasks')
    .delete()
    .eq('goal_id', goalId)
    .gte('date', date)
  if (delErr) throw delErr
  if (tasks.length === 0) return
  const rows = tasks.map(t => ({
    goal_id: goalId,
    date: t.date,
    description: t.description,
  }))
  const { error } = await supabase.from('daily_tasks').insert(rows)
  if (error) throw error
}

export async function getLogsForDate(date: string): Promise<DailyLog[]> {
  const { data } = await supabase.from('daily_logs').select('*').eq('date', date)
  return data ?? []
}

export async function getLogsForGoal(goalId: string, days: number): Promise<DailyLog[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const date = since.toISOString().split('T')[0]
  const { data } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('goal_id', goalId)
    .gte('date', date)
    .order('date', { ascending: false })
  return data ?? []
}

export async function upsertLog(log: {
  date: string
  goal_id: string
  notes: string
}) {
  const { error } = await supabase
    .from('daily_logs')
    .upsert(log, { onConflict: 'date,goal_id' })
  if (error) throw error
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm tsc --noEmit
```
Expected: No errors related to `lib/db.ts` or `lib/types.ts`.

- [ ] **Step 3: Commit**
```bash
git add lib/db.ts
git commit -m "feat: rewrite db.ts for new schema"
```

---

## Task 4: Add Claude client and system prompts

**Files:**
- Create: `lib/claude.ts`
- Create: `lib/prompts.ts`

- [ ] **Step 1: Create `lib/claude.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic()
```

- [ ] **Step 2: Create `lib/prompts.ts`**

```typescript
export const GOAL_INTAKE_SYSTEM = `You are Summit's goal-setting assistant. Help the user define a summer goal through natural conversation.

Gather:
- What they want to accomplish (title + short description)
- Goal type: "continuous" (daily or near-daily practice — e.g. exercise, studying, language learning) or "oneshot" (a defined project with a clear deliverable — e.g. build a website, read a book)
- Deadline (default: 2025-08-31 if not specified)
- For continuous goals only: roughly how many minutes per day they want to commit

Ask one or two short questions at a time. Be warm and direct. Don't ask for information you already have.

When you have enough information, output the following block and ask the user to confirm:

<goal_data>
{"type":"continuous","title":"...","description":"...","deadline":"YYYY-MM-DD","daily_minutes":30}
</goal_data>

For oneshot goals omit "daily_minutes". Then ask: "Does that capture it? Say yes to save, or tell me what to change."`

export const SCHEDULE_GENERATION_SYSTEM = `You generate daily task schedules for summer goals.

Given a continuous goal, generate a specific task for each day from the start date through the deadline. Tasks should:
- Be concrete and actionable (1–2 sentences)
- Build progressively (foundational early, more advanced later)
- Reflect the daily time commitment

Output ONLY a valid JSON array, no markdown fences, no other text:
[{"date":"YYYY-MM-DD","description":"..."},...]`

export const ADJUSTMENT_SYSTEM = `You adjust goal schedules based on actual progress from a user's check-in logs.

You receive:
- goal: the goal object
- logs: recent daily check-in notes (newest first)
- futureTasks: the currently scheduled tasks from tomorrow onwards

Redistribute futureTasks across the same date range based on what the logs reveal:
- Ahead of pace → lighter or fewer tasks on upcoming days
- Behind → spread the backlog evenly, never pile everything onto tomorrow
- Notes about upcoming conflicts (travel, busy days) → account for them

Output ONLY a valid JSON array for all remaining dates, no markdown fences, no other text:
[{"date":"YYYY-MM-DD","description":"..."},...]`
```

- [ ] **Step 3: Commit**
```bash
git add lib/claude.ts lib/prompts.ts
git commit -m "feat: add anthropic client and system prompts"
```

---

## Task 5: Streaming chat API route

**Files:**
- Create: `app/api/chat/route.ts`

- [ ] **Step 1: Create `app/api/chat/route.ts`**

```typescript
import { anthropic } from '@/lib/claude'
import { GOAL_INTAKE_SYSTEM } from '@/lib/prompts'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: GOAL_INTAKE_SYSTEM,
    messages,
  })

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(new TextEncoder().encode(chunk.delta.text))
          }
        }
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm tsc --noEmit
```
Expected: No errors in `app/api/chat/route.ts`.

- [ ] **Step 3: Commit**
```bash
git add app/api/chat/route.ts
git commit -m "feat: add streaming chat API route"
```

---

## Task 6: Goal intake chat page

**Files:**
- Create: `app/chat/page.tsx`
- Delete: `app/goals/new/page.tsx`

- [ ] **Step 1: Create `app/chat/page.tsx`**

```typescript
'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Message = { role: 'user' | 'assistant'; content: string }

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: "What do you want to accomplish this summer? Describe it in your own words.",
}

function extractGoalData(text: string) {
  const match = text.match(/<goal_data>([\s\S]*?)<\/goal_data>/)
  if (!match) return null
  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}

function stripGoalData(text: string) {
  return text.replace(/<goal_data>[\s\S]*?<\/goal_data>/g, '').trim()
}

export default function ChatPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [saving, setSaving] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const lastAssistantContent = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const pendingGoalData = extractGoalData(lastAssistantContent)

  async function sendMessage() {
    if (!input.trim() || streaming) return
    const userMessage: Message = { role: 'user', content: input.trim() }
    // Exclude hardcoded initial greeting; build proper alternating history for API
    const historyForApi = [...messages.slice(1), userMessage]
    setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: historyForApi }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let text = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: text }])
    }

    setStreaming(false)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  async function saveGoal() {
    if (!pendingGoalData) return
    setSaving(true)
    const rawInput = messages.find(m => m.role === 'user')?.content ?? ''
    await fetch('/api/goals/generate-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalData: pendingGoalData, rawInput }),
    })
    router.push('/')
  }

  return (
    <div className="flex flex-col min-h-screen px-4 pt-safe">
      <div className="py-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">New Goal</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Describe what you want to accomplish</p>
        </div>
        <Link href="/" className="text-zinc-500 text-sm">Cancel</Link>
      </div>

      <div className="flex-1 space-y-3 pb-4 overflow-y-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-100'
              }`}
            >
              {m.role === 'assistant' ? stripGoalData(m.content) : m.content}
              {m.role === 'assistant' && streaming && i === messages.length - 1 && (
                <span className="inline-block w-1 h-4 bg-zinc-400 ml-1 animate-pulse align-middle" />
              )}
            </div>
          </div>
        ))}

        {pendingGoalData && !streaming && (
          <div className="flex justify-center pt-2">
            <button
              onClick={saveGoal}
              disabled={saving}
              className="bg-green-600 active:bg-green-700 text-white font-semibold px-8 py-3 rounded-2xl disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving & generating schedule...' : 'Save Goal ✓'}
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="pb-safe pt-2 flex gap-2 border-t border-zinc-800">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          placeholder="Type here..."
          disabled={streaming}
          className="flex-1 bg-zinc-900 border border-zinc-700 focus:border-indigo-500 rounded-2xl px-4 py-3 text-sm outline-none disabled:opacity-40"
        />
        <button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          className="bg-indigo-500 active:bg-indigo-600 text-white font-semibold px-5 py-3 rounded-2xl disabled:opacity-40 transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Delete old goal creation page**
```bash
rm /Users/harrisonrgreen/coding/lockin/app/goals/new/page.tsx
```

- [ ] **Step 3: Verify build**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**
```bash
git add app/chat/page.tsx
git rm app/goals/new/page.tsx
git commit -m "feat: goal intake chat page"
```

---

## Task 7: Schedule generation API route

**Files:**
- Create: `app/api/goals/generate-schedule/route.ts`

- [ ] **Step 1: Create `app/api/goals/generate-schedule/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { SCHEDULE_GENERATION_SYSTEM } from '@/lib/prompts'
import { createGoal, createDailyTasks } from '@/lib/db'

export async function POST(req: Request) {
  const { goalData, rawInput } = await req.json()

  const goal = await createGoal({
    type: goalData.type,
    title: goalData.title,
    description: goalData.description ?? null,
    deadline: goalData.deadline,
    raw_input: rawInput ?? null,
  })

  if (goalData.type === 'oneshot') {
    return NextResponse.json({ goal })
  }

  const today = new Date().toISOString().split('T')[0]
  const userPrompt = `Goal: ${goalData.title}
Description: ${goalData.description ?? ''}
Deadline: ${goalData.deadline}
Daily time commitment: ${goalData.daily_minutes ?? 30} minutes
Start date: ${today}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SCHEDULE_GENERATION_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let tasks: Array<{ date: string; description: string }> = []
  try {
    tasks = JSON.parse(text)
  } catch {
    console.error('Failed to parse schedule JSON:', text)
  }

  if (tasks.length > 0) {
    await createDailyTasks(goal.id, tasks)
  }

  return NextResponse.json({ goal })
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm tsc --noEmit
```
Expected: No errors.

- [ ] **Step 3: Commit**
```bash
git add app/api/goals/generate-schedule/route.ts
git commit -m "feat: schedule generation API — saves goal and generates daily_tasks"
```

---

## Task 8: Rewrite check-in page (free-form text)

**Files:**
- Modify: `app/checkin/page.tsx`

- [ ] **Step 1: Replace `app/checkin/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getGoals, getLogsForDate, getTodayTasks, upsertLog } from '@/lib/db'
import { today } from '@/lib/utils'
import type { Goal, DailyTask } from '@/lib/types'

export default function CheckinPage() {
  const router = useRouter()
  const [goals, setGoals] = useState<Goal[]>([])
  const [todayTasks, setTodayTasks] = useState<DailyTask[]>([])
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const date = today()

  useEffect(() => {
    async function load() {
      const [allGoals, existing, tasks] = await Promise.all([
        getGoals(),
        getLogsForDate(date),
        getTodayTasks(date),
      ])
      setGoals(allGoals)
      setTodayTasks(tasks)
      const map: Record<string, string> = {}
      for (const log of existing) map[log.goal_id] = log.notes
      for (const g of allGoals) if (!map[g.id]) map[g.id] = ''
      setLogs(map)
      setLoading(false)
    }
    load()
  }, [date])

  async function handleSubmit() {
    setSaving(true)
    try {
      await Promise.all(
        goals.map(g => upsertLog({ date, goal_id: g.id, notes: logs[g.id] ?? '' }))
      )
      // Fire-and-forget schedule adjustment for continuous goals
      goals
        .filter(g => g.type === 'continuous')
        .forEach(g => {
          fetch('/api/adjust', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goal_id: g.id }),
          }).catch(() => {})
        })
      setDone(true)
      setTimeout(() => router.push('/'), 1500)
    } catch {
      alert('Failed to save. Try again.')
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-20 h-20 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-xl font-bold">Logged!</p>
        <p className="text-zinc-500 text-sm">Schedule adjusting in the background</p>
      </div>
    )
  }

  return (
    <div className="px-4 pt-safe">
      <div className="py-6">
        <p className="text-zinc-500 text-sm">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-3xl font-bold mt-1 tracking-tight">Check In</h1>
        <p className="text-zinc-500 text-sm mt-1">What did you work on today?</p>
      </div>

      {goals.length === 0 ? (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm">Add some goals first before checking in.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {goals.map(goal => {
            const task = todayTasks.find(t => t.goal_id === goal.id)
            return (
              <div key={goal.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm">{goal.title}</h3>
                  <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded-full">
                    {goal.type}
                  </span>
                </div>
                {task && (
                  <p className="text-xs text-indigo-400 mb-3 leading-relaxed">{task.description}</p>
                )}
                <textarea
                  placeholder="What did you do? What didn't happen? Anything come up?"
                  value={logs[goal.id] ?? ''}
                  onChange={e => setLogs(prev => ({ ...prev, [goal.id]: e.target.value }))}
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-sm placeholder:text-zinc-600 outline-none resize-none transition-colors"
                />
              </div>
            )
          })}

          <div className="pb-safe pt-2">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="w-full bg-indigo-500 active:bg-indigo-600 text-white font-semibold py-4 rounded-2xl disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Check-in'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add app/checkin/page.tsx
git commit -m "feat: rewrite check-in page with free-form text and task display"
```

---

## Task 9: Post-checkin adjustment API route

**Files:**
- Create: `app/api/adjust/route.ts`

- [ ] **Step 1: Create `app/api/adjust/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/claude'
import { ADJUSTMENT_SYSTEM } from '@/lib/prompts'
import { getGoal, getLogsForGoal, getFutureTasksForGoal, replaceFutureTasks } from '@/lib/db'

export async function POST(req: Request) {
  const { goal_id } = await req.json()

  const [goal, logs, futureTasks] = await Promise.all([
    getGoal(goal_id),
    getLogsForGoal(goal_id, 7),
    getFutureTasksForGoal(goal_id),
  ])

  if (!goal || goal.type !== 'continuous' || futureTasks.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: ADJUSTMENT_SYSTEM,
    messages: [{
      role: 'user',
      content: JSON.stringify({ goal, logs, futureTasks }),
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let adjustedTasks: Array<{ date: string; description: string }> = []
  try {
    adjustedTasks = JSON.parse(text)
  } catch {
    console.error('Failed to parse adjustment JSON:', text)
    return NextResponse.json({ ok: true })
  }

  await replaceFutureTasks(goal_id, adjustedTasks)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add app/api/adjust/route.ts
git commit -m "feat: post-checkin schedule adjustment API"
```

---

## Task 10: Redesign dashboard

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```typescript
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getGoals, getLogsForDate, getTodayTasks } from '@/lib/db'
import { today, daysUntil } from '@/lib/utils'
import type { Goal, DailyTask, DailyLog } from '@/lib/types'

const SUMMER_END = '2025-08-31'

export default function Dashboard() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [todayTasks, setTodayTasks] = useState<DailyTask[]>([])
  const [todayLogs, setTodayLogs] = useState<DailyLog[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const date = today()
    Promise.all([getGoals(), getTodayTasks(date), getLogsForDate(date)]).then(
      ([g, t, l]) => {
        setGoals(g)
        setTodayTasks(t)
        setTodayLogs(l)
        setLoading(false)
      }
    )
  }, [])

  const continuousGoals = goals.filter(g => g.type === 'continuous')
  const oneshotGoals = goals.filter(g => g.type === 'oneshot')
  const loggedIds = new Set(todayLogs.map(l => l.goal_id))
  const allLogged = continuousGoals.length > 0 && continuousGoals.every(g => loggedIds.has(g.id))
  const daysLeft = daysUntil(SUMMER_END)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="px-4 pt-safe">
      {/* Header */}
      <div className="py-6">
        <p className="text-zinc-500 text-sm">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
        <h1 className="text-3xl font-bold mt-1 tracking-tight">Summit</h1>
        <p className="text-zinc-500 text-sm mt-1">{daysLeft} days left this summer</p>
      </div>

      {/* Check-in banner */}
      {continuousGoals.length > 0 && (
        <div
          className={`rounded-2xl p-4 mb-6 border ${
            allLogged
              ? 'bg-green-950/40 border-green-900/50'
              : 'bg-indigo-950/40 border-indigo-900/50'
          }`}
        >
          {allLogged ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-green-300 text-sm">Logged for today</p>
                <p className="text-xs text-green-600 mt-0.5">Schedule adjusting in the background</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-indigo-300 text-sm">Check in for today</p>
                <p className="text-xs text-indigo-600 mt-0.5">Log your progress</p>
              </div>
              <Link
                href="/checkin"
                className="bg-indigo-500 active:bg-indigo-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
              >
                Log Now
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Today's tasks */}
      {todayTasks.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-zinc-300 mb-3">Today</h2>
          <div className="space-y-2">
            {todayTasks.map(task => {
              const goal = goals.find(g => g.id === task.goal_id)
              const logged = loggedIds.has(task.goal_id)
              return (
                <div
                  key={task.id}
                  className={`bg-zinc-900 rounded-2xl p-4 border ${
                    logged ? 'border-green-900/40' : 'border-zinc-800'
                  }`}
                >
                  <p className={`text-sm leading-relaxed ${logged ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>
                    {task.description}
                  </p>
                  {goal && (
                    <p className="text-xs text-zinc-600 mt-1.5">{goal.title}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* One-shot projects queue */}
      {oneshotGoals.length > 0 && (
        <div className="mb-6">
          <h2 className="text-base font-semibold text-zinc-300 mb-3">Projects</h2>
          <div className="space-y-2">
            {oneshotGoals.map(goal => (
              <div key={goal.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                <p className="font-semibold text-sm">{goal.title}</p>
                {goal.description && (
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{goal.description}</p>
                )}
                <p className="text-xs text-zinc-600 mt-1.5">
                  Due {new Date(goal.deadline + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' · '}{daysUntil(goal.deadline)}d left
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {goals.length === 0 && (
        <div className="bg-zinc-900 rounded-2xl p-8 text-center border border-zinc-800">
          <p className="text-zinc-400 text-sm mb-4">No goals yet. Add one to get started.</p>
          <Link
            href="/chat"
            className="bg-indigo-500 text-white text-sm font-semibold px-5 py-2.5 rounded-xl"
          >
            Add First Goal
          </Link>
        </div>
      )}

      {/* Add goal */}
      {goals.length > 0 && (
        <div className="flex justify-center pb-safe pt-2">
          <Link href="/chat" className="text-indigo-400 text-sm font-medium">
            + Add Goal
          </Link>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**
```bash
git add app/page.tsx
git commit -m "feat: redesign dashboard — today's tasks, one-shot queue, check-in banner"
```

---

## Task 11: Cleanup and smoke test

**Files:**
- Modify: `app/goals/page.tsx`

- [ ] **Step 1: Update `app/goals/page.tsx` — change "Add" link to `/chat`**

In `app/goals/page.tsx`, find any `href="/goals/new"` and replace with `href="/chat"`.

- [ ] **Step 2: Run dev server and smoke test**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm dev
```
Open http://localhost:3000 and verify:
1. Dashboard loads with empty state, "Add First Goal" links to `/chat`
2. `/chat` shows initial greeting and accepts input
3. Submitting a message calls `/api/chat` and streams a response
4. After Claude outputs `<goal_data>`, "Save Goal ✓" button appears
5. Clicking save POSTs to `/api/goals/generate-schedule` and redirects to `/`
6. New goal appears on dashboard; continuous goal shows today's task if schedule generated
7. `/checkin` shows goals with task descriptions and free-form text areas
8. Saving check-in redirects to `/` with "Logged" state

- [ ] **Step 3: Verify production build**
```bash
cd /Users/harrisonrgreen/coding/lockin && pnpm build
```
Expected: Build completes with no errors.

- [ ] **Step 4: Final commit**
```bash
git add app/goals/page.tsx
git commit -m "feat: update goals page link to /chat"
```
