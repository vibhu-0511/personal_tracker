-- sync_v2_down.sql -- Forge sync v2: full rollback of 0001-0003 (drops everything sync v2 created).
--
-- STATUS: NOT APPLIED. File only. Never run it without the owner's explicit approval (OPEN-DECISIONS D16,
-- runbook docs/runbooks/sync-v2-cutover.md, "Rollback"). It is not wired into any migration runner.
--
-- Prefer the per-key rollback first: remove the key from VITE_SYNC_V2_KEYS and clear the device override. While the
-- 14-day dual-write window is open, kv_store still holds current data and v1 resumes. This file is the last resort.
--
-- Drops:   public.v2_verify, public.forge_backfill(uuid), public.forge_gc_tombstones(interval),
--          public.forge_push(jsonb), public.records (cascades to its policies, trigger, indexes and its
--          supabase_realtime publication membership), public.records_stamp(), public.records_rev_seq.
-- Keeps:   public.kv_store (never touched; public/dsa/mastery-map.html writes it) and
--          public.kv_store_backup_20261112 (the cold backup). Both are left exactly as they are.
-- Idempotent: safe to run twice (the second run finds nothing to drop).
--
-- Data-loss guard: records written by a real client (device_id <> 'backfill') exist only in v2 once the dual-write
-- window has ended. Dropping them is irreversible, so the script aborts while such rows exist. To proceed anyway
-- (after a JSON export, runbook step "Export before rollback"), run with the guard released for this session:
--   PGOPTIONS='-c forge.allow_drop_with_v2_data=on' psql -v ON_ERROR_STOP=1 -f supabase/rollback/sync_v2_down.sql
-- or, in the SQL editor, first run:  set forge.allow_drop_with_v2_data = 'on';

begin;

do $$
declare n bigint;
begin
  if to_regclass('public.records') is not null
     and coalesce(current_setting('forge.allow_drop_with_v2_data', true), '') <> 'on' then
    execute 'select count(*) from public.records where device_id <> $1' into n using 'backfill';
    if n > 0 then
      raise exception 'sync_v2_down aborted: % record(s) written by v2 clients exist only in public.records. Export them first, then set forge.allow_drop_with_v2_data = ''on'' to proceed.', n;
    end if;
  end if;
end $$;

drop view if exists public.v2_verify;
drop function if exists public.forge_backfill(uuid);
drop function if exists public.forge_gc_tombstones(interval);
drop function if exists public.forge_push(jsonb);
drop table if exists public.records cascade;
drop function if exists public.records_stamp();
drop sequence if exists public.records_rev_seq;

-- kv_store and kv_store_backup_20261112 are intentionally NOT dropped. To remove the backup later, only after the
-- owner has confirmed v1 is healthy and has a JSON export, run this by hand:
--   drop table public.kv_store_backup_20261112;

commit;
