# Runbook: sync v2 cutover (backup, migrate, backfill, verify, roll out, roll back)

Task R6-10. Documentation and SQL files only. **Nothing in this runbook has been run against the live Supabase project, and nothing is applied automatically.** No agent has dashboard access and none may attempt these steps. The SQL was validated only on a throwaway local PostgreSQL 16 with stubbed `auth` objects (see "What was and was not tested").

## Approval rule (decision D16)

**Every step below marked OWNER ACTION needs the owner's explicit approval at the time it is run (OPEN-DECISIONS D16).** An earlier "default assumed" for D16 is not approval. Do not run a step because an earlier step succeeded; ask again for each step, and stop at any step whose output differs from "Expected". Nothing here is wired into CI, a migration runner, a scheduled job or an agent. The files only run when the owner pastes them into the Supabase SQL editor.

Marker: **OWNER ACTION** = needs the owner's Supabase dashboard (SQL Editor), Vercel dashboard or signed-in app. Never paste the anon key, the service role key, `CRON_SECRET`, a session token or an `.env` file into a log, a chat or this repo.

## Files

| File | What it does | Writes data? |
|---|---|---|
| `supabase/migrations/0001_sync_v2.sql` (X1-17) | Section 0 copies `kv_store` to `kv_store_backup_20261112`; then creates `records`, the rev trigger, RLS, `forge_push`, the realtime publication entry and `forge_gc_tombstones`. | Creates the backup copy. Never alters `kv_store`. |
| `supabase/migrations/0002_sync_v2_backfill.sql` | Creates the function `forge_backfill(uuid)` only. | No. The backfill is a separate step (step 7). |
| `supabase/migrations/0003_sync_v2_verify.sql` | Creates the read-only view `v2_verify`. API roles have no access to it. | No. |
| `supabase/rollback/sync_v2_down.sql` | Drops everything 0001-0003 created, except `kv_store` and the backup table. | Drops `records`. Guarded (see Rollback). |

All three migrations are idempotent: applying them twice is safe. `kv_store` stays in place permanently because `public/dsa/mastery-map.html` writes it directly.

## Step 0. Preconditions (OWNER ACTION, approval required)

Do not start until all of these are true. Record each answer in `docs/runbooks/sync-v2-cutover-log.md` (R6-16).

1. Supabase dashboard: the project status is Active (not Paused), the plan tier is known, and Realtime is enabled for the project. Expected: Active; tier noted. (Not verified by the author: live project state.)
2. The live `kv_store` matches the spec in `docs/superpowers/specs/2026-09-15-cloud-sync-design.md` (columns `user_id`, `key`, `value jsonb`, `updated_at`, primary key `(user_id, key)`). In the SQL editor run `select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = 'kv_store' order by ordinal_position;`. Expected: 4 rows: `user_id uuid`, `key text`, `value jsonb`, `updated_at timestamp with time zone`.
3. R6-01 (v1 write errors are no longer swallowed) is merged and deployed. Reason: before it, a failed upload counted as success, so `kv_store` can be missing edits that exist only on a device.
4. A JSON export exists and passes its completeness check: follow `docs/runbooks/supabase-free-tier.md` section 2 (Method 1, 2 or 3) and the "Completeness check". Expected last line: `all 17 keys present`. Take the export from the device with the freshest data, and also run Method 3 on any device that showed a failed sync banner.
5. Every device you use has opened the v2-capable app once so `seedFromLocalBlob` ran (R6-11), or you accept that edits that exist only on a device and never reached `kv_store` will be missing from the backfill. Compare the cloud counts from step 3 with that device's export before you trust the backfill.

## Step 1. Record the baseline (OWNER ACTION, approval required)

Read-only. In the SQL editor:

```sql
select count(*) as kv_store_rows, count(distinct user_id) as users from public.kv_store;
```

Expected: one row. Write both numbers in the log. The fixture used for validation gave `21 | 2`; your numbers will differ.

## Step 2. Apply 0001 (OWNER ACTION, approval required)

Paste the full contents of `supabase/migrations/0001_sync_v2.sql` into the SQL editor and run it. This creates the backup table first, then the schema.

Expected output: `Success. No rows returned`. Notices such as `relation ... already exists, skipping` appear only on a repeat run. If an error appears, stop; do not run 0002.

Then check the backup (this is the R6-16 acceptance line):

```sql
select (select count(*) from public.kv_store) as kv_store_rows,
       (select count(*) from public.kv_store_backup_20261112) as backup_rows;
```

Expected: both numbers equal, and equal to step 1. If they differ, stop. Note that 0001 uses `create table if not exists`: if the backup table already existed from an earlier run, it is not refreshed, so a stale backup shows up here as a smaller `backup_rows`. Do not drop the old backup yourself; ask for a decision.

Also confirm the table exists and is empty: `select count(*) from public.records;` Expected: `0`.

## Step 3. Apply 0002 (OWNER ACTION, approval required)

Paste `supabase/migrations/0002_sync_v2_backfill.sql` and run it. It only defines a function.

Expected output: `Success. No rows returned`. Then:

```sql
select to_regprocedure('public.forge_backfill(uuid)') as fn, (select count(*) from public.records) as records;
```

Expected: `forge_backfill(uuid) | 0`. A `records` count above 0 here means data already moved; stop.

## Step 4. Apply 0003 (OWNER ACTION, approval required)

Paste `supabase/migrations/0003_sync_v2_verify.sql` and run it.

Expected output: `Success. No rows returned`. Then:

```sql
select count(*) from public.v2_verify;
```

Expected: a number greater than 0 (one row per user and collection that holds data in `kv_store`). Before the backfill every row shows `live_n` empty and `ok = false`; that is correct. Check with `select count(*) filter (where ok) from public.v2_verify;`, expected `0`.

## Step 5. Pre-backfill decision (OWNER ACTION, approval required)

Ask for explicit approval to copy data into `records`. The backfill reads `kv_store` and inserts rows into `records` only. It is safe to repeat (idempotent) and it never alters `kv_store`. Rolling it back means `sync_v2_down.sql` (no partial undo of the rows).

## Step 6. Run the backfill (OWNER ACTION, approval required)

Run exactly this, one statement:

```sql
select * from public.forge_backfill();
```

Expected output: a table `coll | n`, one row per collection that has data, sorted by name. Possible collections (up to 16): `budgets`, `checklists`, `examNotes`, `examProgress`, `expenses`, `goals`, `habitCheckins`, `habits`, `investProgress`, `loans`, `moodLog`, `notes`, `progress`, `puzzleProgress`, `reminders`, `settings`, `tasks`, `watchlist`. An empty key (`[]` or `{}`) produces no row. `n` counts distinct records after duplicate ids were collapsed, so `tasks` can show fewer than the raw blob length. Sample on the validation fixture (2 users, a duplicate-id task list, numeric-id expenses): 16 rows, for example `expenses | 3`, `habitCheckins | 2`, `tasks | 4`, `settings | 1`.

Run it a second time. Expected: the same table, and:

```sql
select count(*) from public.records;
```

returns the same number after the second run as after the first. The second run changes no row (verified on the fixture: a checksum of all rows, `rev` included, was identical). `n` in the output is the number of rows the function considered, not the number it changed.

To backfill one user only: `select * from public.forge_backfill('<user uuid>');`.

## Step 7. Verify (OWNER ACTION, approval required)

7a. The id-set comparison for 15 collections:

```sql
select user_id, collection, blob_n, live_n, ok from public.v2_verify order by user_id, collection;
```

Expected: every row has `ok = true` and `blob_n = live_n`. One-line check:

```sql
select count(*) as verify_rows, count(*) filter (where ok is not true) as not_ok from public.v2_verify;
```

Expected: `not_ok = 0`. The R6-16 acceptance is that you paste the full 7a output into the log.

`blob_n` counts distinct ids, so a blob with duplicate legacy ids matches `live_n` after the backfill kept one record per id. A numeric id (for example `101`) is compared as the text `'101'` on both sides.

7b. The three collections `v2_verify` does not cover (habitCheckins, settings, investProgress). Expected: each pair of numbers is equal.

```sql
select (select count(*) from public.records where collection = 'habitCheckins' and deleted_at is null) as live_checkins,
       (select count(*) from (select distinct k.user_id, (e.elem->>'id') || ':' || c.day
          from public.kv_store k, jsonb_array_elements(k.value) as e(elem),
               jsonb_array_elements_text(coalesce(e.elem->'checkins', '[]'::jsonb)) as c(day)
          where k.key = 'habits' and jsonb_typeof(k.value) = 'array' and e.elem ? 'id') x) as blob_checkins;

select (select count(*) from public.records where collection = 'settings' and deleted_at is null) as live_settings,
       (select count(*) from public.kv_store where key = 'settings' and jsonb_typeof(value) = 'object') as blob_settings;

select (select count(*) from public.records where collection = 'investProgress' and deleted_at is null) as live_invest,
       (select count(*) from public.kv_store k, jsonb_each(k.value) g, jsonb_each(g.value) m
          where k.key = 'investProgress' and jsonb_typeof(k.value) = 'object'
            and g.key in ('done','quiz','tasks') and jsonb_typeof(g.value) = 'object')
     + (select count(*) from public.kv_store
          where key = 'investProgress' and value ? 'current' and jsonb_typeof(value->'current') <> 'null') as blob_invest;
```

These count checks do not compare values. The value-level deep-equal for these three is the client-side `verify(key)` (R6-11); run it on a device before stage 3 flips them.

7c. Compare the cloud counts against the export from Step 0: for a few keys, the number of items in the export file should equal `blob_n`. A higher number in the export means edits that never reached `kv_store` (v1 silent failure); let the device seed them (`seedFromLocalBlob`) before cutover.

If any `ok` is false: do not flip that key. Typical causes: the blob changed after the backfill (a v1 device wrote it; run Step 6 again, it is safe while that key is still on v1), or a stale or failed v1 upload. Record the row and ask.

Interpretation caveat: once a key is on v2 and clients add or delete records, `ok` becomes false for that key by design. Run the verification before flipping, not after.

## Step 8. Optional: tombstone garbage collection (OWNER ACTION, approval required)

Tombstones are never deleted from the client. `forge_gc_tombstones()` removes tombstones older than 90 days. To schedule it, enable `pg_cron` in the dashboard (Database, Extensions), then run the commented line at the end of 0001:

```sql
select cron.schedule('forge-gc-tombstones', '17 3 * * *', $$select public.forge_gc_tombstones()$$);
```

Expected: one row with a job id. Skipping this step is fine (GC is then manual). Not verified by the author: `pg_cron` on the real project.

## Step 9. Roll out per key (OWNER ACTION, approval for each stage; task R6-17)

Prerequisite: R6-14, R6-15 and Step 7 `not_ok = 0`. The flag is the Vercel environment variable `VITE_SYNC_V2_KEYS`, a comma-separated key list; a key not in the list keeps using v1 exactly as today. Each device can override it in localStorage (R6-11). Vite inlines `VITE_` variables at build time, so a change needs a new deploy before devices see it (not verified here; confirm on the first stage).

| Stage | Add to `VITE_SYNC_V2_KEYS` |
|---|---|
| 1 | `puzzleProgress,examProgress,examNotes,watchlist,progress` |
| 2 | `loans,goals,budgets,expenses,reminders,notes,tasks,investProgress` |
| 3 | `habits,moodLog,settings` |

Before each stage, re-run Step 7a for the keys in that stage (Expected: `ok = true`). After each stage, open the app once on every device and wait; then:

```sql
select count(distinct device_id) as devices from public.records where device_id <> 'backfill';
```

Expected: equals the number of devices you used. Then: no failed sync banner for 48 hours. Only then start the next stage. Paste the outputs into `docs/runbooks/sync-v2-cutover-log.md`.

While the 14-day dual-write window is open, v2 clients also write the `kv_store` blob, so a stage can be undone per key (below). After the window, task R6-18 retires the mirror; `kv_store` stays.

## Re-running the backfill

Safe and idempotent while every key you re-run for is still on v1 (the backfill hlc comes from `kv_store.updated_at`, and the upsert only writes where the stored hlc is older). Once a key is on v2, do not re-run it casually: a blob that a dual-write rewrote later than a record edit would carry a newer hlc than that record. If you must, back up first and use `forge_backfill('<user uuid>')`, then re-run Step 7.

## Rollback

Rollback needs the owner's explicit approval too (D16). Use the smallest one that works.

### A. One key (preferred)

1. Vercel: remove the key from `VITE_SYNC_V2_KEYS` and deploy. On each device clear the localStorage override.
2. Expected: the key behaves as in v1 with current data, because the blob was dual-written during the window. Records stay in `records` and are ignored.

### B. Everything (last resort), OWNER ACTION

1. Empty `VITE_SYNC_V2_KEYS` and deploy, so no client writes to `records`.
2. Export first (`docs/runbooks/supabase-free-tier.md` section 2). Check what exists only in v2:

   ```sql
   select count(*) as v2_only_rows from public.records where device_id <> 'backfill';
   ```

3. Paste `supabase/rollback/sync_v2_down.sql` and run it. It aborts with `sync_v2_down aborted: N record(s) written by v2 clients exist only in public.records` while `v2_only_rows > 0`. To proceed after export and approval, release the guard in the same session first: `set forge.allow_drop_with_v2_data = 'on';`, then run the file. (From psql: `PGOPTIONS='-c forge.allow_drop_with_v2_data=on' psql -f ...`.)
4. Expected: `Success. No rows returned`; running it again is also harmless. Confirm:

   ```sql
   select to_regclass('public.records') as records, to_regclass('public.v2_verify') as v2_verify;
   select (select count(*) from public.kv_store) as kv_store_rows, (select count(*) from public.kv_store_backup_20261112) as backup_rows;
   ```

   Expected: `records` and `v2_verify` are null; `kv_store` and the backup still hold their rows (nothing touched them).

The script keeps `kv_store` and `kv_store_backup_20261112`. Dropping the backup is a separate manual line in the script's comment, to be run only with approval after v1 is confirmed healthy.

## What was and was not tested

Executed by the author, on a local throwaway PostgreSQL 16.15 (own temporary cluster, unix socket only, no network, no credentials) with stubs for `auth.users`, `auth.uid()`, the `anon` and `authenticated` roles, a `supabase_realtime` publication and a `kv_store` fixture (2 users; duplicate-id task list; numeric-id expenses; habits with check-ins; moodLog with a duplicate date; investProgress; settings; an unrelated `dsa_mastery_v1` key):

- 0001, 0002, 0003 applied in order, twice, with `ON_ERROR_STOP=1`: no errors.
- `forge_backfill()` returned 16 per-collection counts; a repeat left all rows unchanged (identical checksum).
- `v2_verify` returned 15 rows, all `ok = true`; after adding a blob record without re-running the backfill the row turned `ok = false`.
- A row with a newer hlc (a real client edit) survived a repeat backfill.
- The `authenticated` role was denied on `v2_verify` and `forge_backfill`.
- `sync_v2_down.sql`: aborted while v2-written rows existed, dropped everything with the guard released, was harmless on a second run, left `kv_store` and the backup intact.
- The Step 7b queries returned equal pairs on the fixture.

Not tested: the real Supabase project (live `kv_store` DDL, RLS defaults, Postgres version, plan, Realtime delivery, `pg_cron`, the SQL editor's behaviour with long pastes), the real `auth.uid()`, any client code path, and every OWNER ACTION above.
