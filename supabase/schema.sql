-- Run this in the Supabase SQL editor for a fresh project.
-- Reflects the live v2 schema (color, completed, calendar_marks, conversation_state).

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

-- Single-row advisor conversation memory (always upserted on id = 1).
create table conversation_state (
  id integer primary key default 1,
  summary text not null default '',
  recent_messages jsonb not null default '[]',
  updated_at timestamptz default now()
);

alter table goals disable row level security;
alter table daily_tasks disable row level security;
alter table daily_logs disable row level security;
alter table calendar_marks disable row level security;
alter table conversation_state disable row level security;
