-- 0003_sync_v2_verify.sql -- Forge sync v2: verification view comparing the v1 blobs with the v2 rows.
--
-- STATUS: NOT APPLIED. File only. Do not run against the live Supabase project until the owner approves
-- (OPEN-DECISIONS D16, runbook docs/runbooks/sync-v2-cutover.md, task R6-16).
--
-- Requires 0001_sync_v2.sql. Read-only view: it never writes. Idempotent (create or replace).
--   select * from public.v2_verify order by user_id, collection;
-- Every row must show ok = true before the matching key is flipped to v2.
--
-- What it checks: per user and collection, the count and an md5 of the sorted distinct ids in the kv_store blob
-- versus the live (non-tombstoned) rows in records. 15 collections: the 10 id-list keys (including habits), the
-- 4 flat maps and moodLog. checklists is part of the id-list set.
-- What it does NOT check: habitCheckins, investProgress and settings. Those are verified by the client-side
-- deep-equal (materialize(records) vs blob, task R6-11), and the runbook lists the manual spot checks.
-- Caveat: expect ok = false for a key once v2 clients have added or deleted records after cutover. Run it BEFORE
-- flipping. A blob key with no records (or the reverse) shows as a row with a null count and ok = false.
-- Access: security_invoker, and all access is revoked from the API roles; use it from the dashboard SQL editor.

create or replace view public.v2_verify as
with blob as (
  select user_id, key as collection, count(distinct e.elem->>'id')::bigint as n,
         md5(string_agg(distinct e.elem->>'id', ',' order by e.elem->>'id')) as h
  from kv_store, jsonb_array_elements(value) as e(elem)
  where key in ('notes','expenses','goals','examNotes','watchlist','tasks','reminders','loans','checklists','habits')
    and jsonb_typeof(value) = 'array' and e.elem ? 'id'
  group by 1, 2
  union all
  select kv.user_id, kv.key, count(*), md5(string_agg(m.key, ',' order by m.key))
  from kv_store kv, jsonb_each(kv.value) as m
  where kv.key in ('progress','examProgress','puzzleProgress','budgets') and jsonb_typeof(kv.value) = 'object'
  group by 1, 2
  union all
  select user_id, 'moodLog', count(distinct e.elem->>'date'), md5(string_agg(distinct e.elem->>'date', ',' order by e.elem->>'date'))
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
revoke all on public.v2_verify from public, anon, authenticated;
