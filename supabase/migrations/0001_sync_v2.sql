-- 0001_sync_v2.sql -- Forge sync v2: generic per-record table `public.records`.
--
-- STATUS: NOT APPLIED. File only. Do not run against the live Supabase project until the owner approves
-- (OPEN-DECISIONS D16, runbook task R6-16). Nothing in the app reads or writes `records`; v2 stays off.
--
-- Contents: 0 backup of kv_store | 1 schema + rev trigger | 2 RLS | 3 push RPC | 4 realtime | 5 tombstone GC
-- Backfill, verification and rollback SQL are a separate task (R6-10), not part of this file.
--
-- Design notes
--  * rev is taken from a sequence by a BEFORE INSERT OR UPDATE trigger, so every write (including a tombstone)
--    moves the row past a client cursor. The blueprint's `generated always as identity` only assigns on INSERT.
--  * Commits can become visible out of rev order (a long transaction can commit a lower rev after a higher one
--    was read), so clients pull `rev > last_seen - overlap` and de-dupe by (collection, id).
--  * Conflicts are decided by hlc (X1-16 format, see src/sync/hlc.js); server_at is informational only.
--  * kv_store is only read (section 0 copies it). It is never altered: public/dsa/mastery-map.html still writes it.
--  * Idempotent: safe to run twice. Requires an existing public.kv_store, auth.users, auth.uid(), the
--    `authenticated`/`anon` roles and the `supabase_realtime` publication (all present on a Supabase project).

-- 0. Cold backup of the v1 blob table. RLS on, no policy = unreadable by the app, readable in the dashboard.
create table if not exists public.kv_store_backup_20261112 as table public.kv_store;
alter table public.kv_store_backup_20261112 enable row level security;

-- 1. Schema ---------------------------------------------------------------
create sequence if not exists public.records_rev_seq;

create table if not exists public.records (
  user_id    uuid   not null default auth.uid() references auth.users(id) on delete cascade,
  collection text   not null,                 -- e.g. 'tasks', 'expenses', 'progress'
  id         text   not null,                 -- String(item.id); map key; 'YYYY-MM-DD' for moodLog
  body       jsonb,                           -- null only on a tombstone
  pos        double precision,                -- fractional order index for ordered lists
  hlc        text collate "C" not null,       -- '<ms:15 digits>-<counter:4 hex>-<device:8>' lexicographic == causal
  device_id  text   not null,
  deleted_at timestamptz,                     -- tombstone, never a physical DELETE from the client
  rev        bigint not null default nextval('public.records_rev_seq'),  -- re-stamped on every write by trigger
  server_at  timestamptz not null default now(),
  primary key (user_id, collection, id),
  constraint records_collection_chk check (collection ~ '^[A-Za-z][A-Za-z0-9_]{0,39}$'),
  constraint records_id_chk         check (char_length(id) between 1 and 200),
  constraint records_hlc_chk        check (hlc ~ '^[0-9]{15}-[0-9a-f]{4}-.{1,32}$'),
  constraint records_body_size_chk  check (body is null or pg_column_size(body) < 262144),
  constraint records_tombstone_chk  check ((deleted_at is null) = (body is not null))
);

-- The blueprint's "rev bigint generated always as identity" only assigns on INSERT, so an UPDATE would
-- never move a row past a client's cursor. A trigger re-stamps rev on every write instead.
create or replace function public.records_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  new.rev := nextval('public.records_rev_seq');
  new.server_at := now();
  return new;
end $$;

drop trigger if exists records_stamp on public.records;
create trigger records_stamp before insert or update on public.records
  for each row execute function public.records_stamp();

create index if not exists records_delta_idx on public.records (user_id, rev);
create index if not exists records_tombstone_idx on public.records (deleted_at) where deleted_at is not null;

-- 2. RLS: owner-only; no DELETE policy, so clients cannot physically delete ---------------------
alter table public.records enable row level security;
grant select, insert, update on public.records to authenticated;   -- explicit: do not rely on dashboard default grants
grant usage on sequence public.records_rev_seq to authenticated;   -- rev default + trigger run as the caller
drop policy if exists records_select on public.records;
drop policy if exists records_insert on public.records;
drop policy if exists records_update on public.records;
create policy records_select on public.records for select to authenticated using ((select auth.uid()) = user_id);
create policy records_insert on public.records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy records_update on public.records for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 3. Push RPC: batched, idempotent, server-enforced LWW, clock-drift guard ------------------------
-- A replayed or out-of-order op has hlc <= stored hlc, so the WHERE is false and nothing changes.
-- Rows more than 24h in the future are dropped (a wrong-clock device cannot poison the HLC).
-- security invoker: RLS applies. Returns only rows that were applied.
create or replace function public.forge_push(rows jsonb)
returns table(out_collection text, out_id text, out_rev bigint)
language sql security invoker set search_path = public as $$
  insert into public.records as t (user_id, collection, id, body, pos, hlc, device_id, deleted_at)
  select auth.uid(), r.collection, r.id, r.body, r.pos, r.hlc, r.device_id, r.deleted_at
  from jsonb_to_recordset(rows) as r(collection text, id text, body jsonb, pos double precision,
                                     hlc text, device_id text, deleted_at timestamptz)
  where jsonb_array_length(rows) <= 500
    and substr(r.hlc, 1, 15)::bigint <= (extract(epoch from clock_timestamp()) * 1000)::bigint + 86400000
  on conflict (user_id, collection, id) do update
    set body = excluded.body, pos = excluded.pos, hlc = excluded.hlc,
        device_id = excluded.device_id, deleted_at = excluded.deleted_at
    where t.hlc < excluded.hlc
  returning t.collection, t.id, t.rev;
$$;
revoke all on function public.forge_push(jsonb) from public, anon;
grant execute on function public.forge_push(jsonb) to authenticated;

-- 4. Realtime: one channel, filter user_id=eq.<uid>, events INSERT/UPDATE (deletes are tombstone updates)
do $$ begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; end $$;

-- 5. Tombstone GC (user must enable pg_cron in Database > Extensions first) --------------------------
create or replace function public.forge_gc_tombstones(retain interval default interval '90 days')
returns bigint language sql security definer set search_path = public as $$
  with d as (delete from public.records where deleted_at < now() - retain returning 1)
  select count(*) from d;
$$;
revoke all on function public.forge_gc_tombstones(interval) from public, anon, authenticated;
-- select cron.schedule('forge-gc-tombstones', '17 3 * * *', $$select public.forge_gc_tombstones()$$);
