-- Run this in the Supabase SQL editor for a fresh project.
-- Reflects the live v2 schema (color, completed, calendar_marks, conversations).

create table goals (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('continuous', 'oneshot')),
  title text not null,
  description text,
  deadline date not null,
  raw_input text,
  color text not null default '#6366f1',
  created_at timestamptz default now()
);

create table daily_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  date date not null,
  description text not null,
  completed boolean not null default false,
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

-- Light-day marks (manual "fewer tasks" days set from the calendar).
create table calendar_marks (
  date date primary key,
  capacity text not null default 'light' check (capacity in ('light')),
  created_at timestamptz default now()
);

-- Advisor conversations — one row per ChatGPT-style thread (no rolling summary;
-- conversations are isolated, the advisor re-reads goal/task/log state each turn).
create table conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  messages jsonb not null default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index conversations_updated_at_idx on conversations (updated_at desc);

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

alter table goals disable row level security;
alter table daily_tasks disable row level security;
alter table daily_logs disable row level security;
alter table calendar_marks disable row level security;
alter table conversations disable row level security;
alter table trackers disable row level security;
