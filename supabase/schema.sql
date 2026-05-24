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
