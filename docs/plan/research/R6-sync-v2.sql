-- Forge sync v2 -- generic per-record table. Run in the Supabase SQL editor, in order.
-- Sections: 0 backup | 1 schema | 2 RLS | 3 push RPC | 4 realtime | 5 tombstone GC
--           6 backfill from kv_store (idempotent, re-runnable) | 7 verification | 8 rollback
-- Validated against a throwaway PostgreSQL 16 with a stubbed auth schema (see R6-report.md, Facts).
-- NOT validated: Supabase Realtime delivery, pg_cron, the real auth.uid().

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

-- 6. Backfill from kv_store ------------------------------------------------------------------------
-- hlc is derived from kv_store.updated_at with device suffix 'backfill', so every run yields the same value
-- (idempotent) and any real client edit (newer hlc) always beats it. DISTINCT ON guards legacy duplicate ids
-- (ids were Date.now() before commit deb249f, so two adds in one ms collided).
create or replace function public.forge_backfill(only_user uuid default null) returns table(coll text, n bigint)
language plpgsql security definer set search_path = public as $$
begin
  create temp table _bf (user_id uuid, collection text, id text, body jsonb, pos double precision, hlc text) on commit drop;

  -- A. ordered lists of id'd records
  insert into _bf
  select distinct on (k.user_id, k.key, e.elem->>'id')
    k.user_id, k.key, e.elem->>'id', e.elem, e.ord * 1000.0, null
  from kv_store k, jsonb_array_elements(k.value) with ordinality as e(elem, ord)
  where k.key in ('notes','expenses','goals','examNotes','watchlist','tasks','reminders','loans','checklists')
    and jsonb_typeof(k.value) = 'array' and e.elem ? 'id'
    and (only_user is null or k.user_id = only_user)
  order by k.user_id, k.key, e.elem->>'id', e.ord;

  -- B. habits: checkins[] split out into collection habitCheckins (id = habitId:YYYY-MM-DD)
  insert into _bf
  select distinct on (k.user_id, e.elem->>'id')
    k.user_id, 'habits', e.elem->>'id', e.elem - 'checkins', e.ord * 1000.0, null
  from kv_store k, jsonb_array_elements(k.value) with ordinality as e(elem, ord)
  where k.key = 'habits' and jsonb_typeof(k.value) = 'array' and e.elem ? 'id'
    and (only_user is null or k.user_id = only_user)
  order by k.user_id, e.elem->>'id', e.ord;

  insert into _bf
  select distinct on (k.user_id, (e.elem->>'id') || ':' || c.day)
    k.user_id, 'habitCheckins', (e.elem->>'id') || ':' || c.day,
    jsonb_build_object('habitId', e.elem->'id', 'date', c.day), null, null
  from kv_store k,
       jsonb_array_elements(k.value) as e(elem),
       jsonb_array_elements_text(coalesce(e.elem->'checkins', '[]'::jsonb)) as c(day)
  where k.key = 'habits' and jsonb_typeof(k.value) = 'array' and e.elem ? 'id'
    and (only_user is null or k.user_id = only_user);

  -- C. moodLog: one record per date
  insert into _bf
  select distinct on (k.user_id, e.elem->>'date')
    k.user_id, 'moodLog', e.elem->>'date', e.elem, null, null
  from kv_store k, jsonb_array_elements(k.value) as e(elem)
  where k.key = 'moodLog' and jsonb_typeof(k.value) = 'array' and e.elem ? 'date'
    and (only_user is null or k.user_id = only_user)
  order by k.user_id, e.elem->>'date';

  -- D. flat maps: entry id = map key, body = value (may be a bare boolean or number)
  insert into _bf
  select k.user_id, k.key, m.key, m.value, null, null
  from kv_store k, jsonb_each(k.value) as m
  where k.key in ('progress','examProgress','puzzleProgress','budgets') and jsonb_typeof(k.value) = 'object'
    and (only_user is null or k.user_id = only_user);

  -- E. investProgress {done:{}, quiz:{}, tasks:{}, current}: one record per leaf, id = '<group>:<key>', plus 'current'
  insert into _bf
  select k.user_id, 'investProgress', g.key || ':' || m.key, m.value, null, null
  from kv_store k, jsonb_each(k.value) as g, jsonb_each(g.value) as m
  where k.key = 'investProgress' and jsonb_typeof(k.value) = 'object'
    and g.key in ('done','quiz','tasks') and jsonb_typeof(g.value) = 'object'
    and (only_user is null or k.user_id = only_user);
  insert into _bf
  select k.user_id, 'investProgress', 'current', k.value->'current', null, null
  from kv_store k
  where k.key = 'investProgress' and k.value ? 'current' and jsonb_typeof(k.value->'current') <> 'null'
    and (only_user is null or k.user_id = only_user);

  -- F. single objects: one record, id '_'
  insert into _bf
  select k.user_id, k.key, '_', k.value, null, null
  from kv_store k
  where k.key = 'settings' and jsonb_typeof(k.value) = 'object' and (only_user is null or k.user_id = only_user);

  -- hlc from the source key's updated_at (checkins/investProgress/etc. inherit the parent key's stamp)
  update _bf b set hlc = lpad((extract(epoch from k.updated_at) * 1000)::bigint::text, 15, '0') || '-0000-backfill'
  from kv_store k
  where k.user_id = b.user_id
    and k.key = case b.collection when 'habitCheckins' then 'habits' else b.collection end;

  insert into public.records as t (user_id, collection, id, body, pos, hlc, device_id)
  select user_id, collection, id, body, pos, hlc, 'backfill' from _bf
  on conflict (user_id, collection, id) do update
    set body = excluded.body, pos = excluded.pos, hlc = excluded.hlc, device_id = excluded.device_id, deleted_at = null
    where t.hlc < excluded.hlc;

  return query select collection, count(*) from _bf group by 1 order by 1;
end $$;
revoke all on function public.forge_backfill(uuid) from public, anon, authenticated;
-- run as the dashboard role:  select * from public.forge_backfill();   (safe to repeat)

-- 7. Verification: v1 blob vs v2 live rows. Every row must have ok = true before cutting a key over. ----
create or replace view public.v2_verify as
with blob as (
  select user_id, key as collection, count(*)::bigint as n,
         md5(string_agg(e.elem->>'id', ',' order by e.elem->>'id')) as h
  from kv_store, jsonb_array_elements(value) as e(elem)
  where key in ('notes','expenses','goals','examNotes','watchlist','tasks','reminders','loans','checklists','habits')
    and jsonb_typeof(value) = 'array' and e.elem ? 'id'
  group by 1, 2
  union all
  select user_id, key, count(*), md5(string_agg(m.key, ',' order by m.key))
  from kv_store, jsonb_each(value) as m
  where key in ('progress','examProgress','puzzleProgress','budgets') and jsonb_typeof(value) = 'object'
  group by 1, 2
  union all
  select user_id, 'moodLog', count(*), md5(string_agg(e.elem->>'date', ',' order by e.elem->>'date'))
  from kv_store, jsonb_array_elements(value) as e(elem) where key = 'moodLog' and jsonb_typeof(value) = 'array' group by 1
), live as (
  select user_id, collection, count(*)::bigint as n, md5(string_agg(id, ',' order by id)) as h
  from records where deleted_at is null and collection in
    ('notes','expenses','goals','examNotes','watchlist','tasks','reminders','loans','checklists','habits',
     'progress','examProgress','puzzleProgress','budgets','moodLog')
  group by 1, 2
)
select coalesce(b.user_id, l.user_id) as user_id, coalesce(b.collection, l.collection) as collection,
       b.n as blob_n, l.n as live_n, (b.n is not distinct from l.n and b.h is not distinct from l.h) as ok
from blob b full join live l on b.user_id = l.user_id and b.collection = l.collection;
-- Note: expect ok = false for a key once v2 clients have added/deleted records after cutover; run it BEFORE flipping.
-- habitCheckins, investProgress and settings are verified by a client-side deep-equal (materialize(records) vs blob).
alter view public.v2_verify set (security_invoker = true);

-- 8. Rollback --------------------------------------------------------------------------------------
-- Per key: set the flag off in the client; kv_store is still dual-written, so v1 resumes with current data.
-- Full: drop table public.records cascade; drop function public.forge_push(jsonb), public.forge_backfill(uuid),
--       public.forge_gc_tombstones(interval), public.records_stamp(); kv_store and kv_store_backup_20261112 are untouched.
