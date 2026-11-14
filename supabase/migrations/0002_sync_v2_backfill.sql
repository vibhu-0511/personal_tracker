-- 0002_sync_v2_backfill.sql -- Forge sync v2: backfill function (kv_store blobs -> public.records).
--
-- STATUS: NOT APPLIED. File only. Do not run against the live Supabase project until the owner approves
-- (OPEN-DECISIONS D16, runbook docs/runbooks/sync-v2-cutover.md, task R6-16).
--
-- Requires 0001_sync_v2.sql. This file only CREATES the function public.forge_backfill(uuid). Applying the
-- file copies no data: the backfill itself is a separate, separately approved step
--   select * from public.forge_backfill();            -- all users
--   select * from public.forge_backfill('<uuid>');    -- one user
-- kv_store is only read, never altered.
--
-- Design notes
--  * Idempotent and re-runnable. hlc is derived from kv_store.updated_at with device suffix 'backfill', so the same
--    blob always yields the same hlc; the upsert only writes where the stored hlc is older, so a real client edit
--    (newer hlc) always beats it and a repeat run changes nothing.
--  * DISTINCT ON guards legacy duplicate ids (ids were Date.now() before commit deb249f, so two adds in one ms
--    collided); the first occurrence in list order wins. An unguarded insert fails with "cannot affect row a
--    second time". Numeric ids (e.g. expenses) become text via ->>.
--  * Habit check-ins are split out of habits into collection habitCheckins (id = '<habitId>:<YYYY-MM-DD>').
--  * Covers all 17 synced keys (id lists, habits, moodLog, flat maps, investProgress, settings) plus the split-out
--    habitCheckins collection. Not covered, deliberately: dsa_mastery_v1 (written by public/dsa/mastery-map.html,
--    not a synced key).
--  * Run it BEFORE any key is flipped to v2. After v2 clients write, a re-run is only safe for keys still on v1
--    (see the runbook, "Re-running the backfill").
--  * security definer, executable only by the dashboard role (revoked from public, anon, authenticated).

-- 6. Backfill from kv_store ------------------------------------------------------------------------
-- hlc is derived from kv_store.updated_at with device suffix 'backfill', so every run yields the same value
-- (idempotent) and any real client edit (newer hlc) always beats it. DISTINCT ON guards legacy duplicate ids
-- (ids were Date.now() before commit deb249f, so two adds in one ms collided).
create or replace function public.forge_backfill(only_user uuid default null) returns table(coll text, n bigint)
language plpgsql security definer set search_path = public as $$
begin
  -- if-not-exists + truncate lets two calls share one transaction (e.g. one SQL editor run)
  create temp table if not exists _bf (user_id uuid, collection text, id text, body jsonb, pos double precision, hlc text) on commit drop;
  truncate _bf;

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
