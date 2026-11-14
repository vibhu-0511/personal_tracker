-- Per-user usage log for the /api/agent rate limit (R5-07, used by R5-08).
-- Run once in the Supabase SQL editor before R5-08 is deployed.
-- The API handler queries this table with the caller's own JWT, so row level
-- security applies and no service-role key is needed.

create table if not exists public.agent_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);

alter table public.agent_usage enable row level security;

-- A user can read and insert only their own rows. There is deliberately no
-- update or delete policy, so a client cannot erase its own usage history.
drop policy if exists "read own usage" on public.agent_usage;
create policy "read own usage" on public.agent_usage
  for select using (auth.uid() = user_id);

drop policy if exists "insert own usage" on public.agent_usage;
create policy "insert own usage" on public.agent_usage
  for insert with check (auth.uid() = user_id);

-- Serves the sliding-window lookup: rows for one user since a timestamp.
create index if not exists agent_usage_user_id_at_idx
  on public.agent_usage (user_id, at);

-- Housekeeping: rows older than a day no longer affect the limit. Because
-- clients cannot delete, prune occasionally from the SQL editor (or pg_cron):
--   delete from public.agent_usage where at < now() - interval '2 days';
