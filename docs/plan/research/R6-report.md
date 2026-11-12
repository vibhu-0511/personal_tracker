# R6 - Data and sync v2

## Summary
- Sync v1 is whole-key last-write-wins on the client's `Date.now()` (`src/sync/logic.js:17-32`, `src/sync/engine.js:72`). Two devices editing different records of one list lose one edit, exactly as blueprint 2.4 says. The decision (per-record rows, tombstones, HLC) holds up; nothing in the code makes it hard.
- Recommended schema: ONE generic table `records(user_id, collection, id, body jsonb, pos, hlc, device_id, deleted_at, rev, server_at)`, not one table per entity. Reasons: 17 keys but only 4 shapes, fields have changed 3 times since August, no server-side querying is needed, and one table means one RLS policy set, one realtime channel and one `rev` cursor. This departs from the blueprint's "same shape for habits, expenses, loans..." sketch (flagged below).
- The full SQL is in `docs/plan/research/R6-sync-v2.sql` (222 lines: backup, schema, RLS, `forge_push` RPC, realtime, tombstone GC, backfill, verify view, rollback). I ran it end to end on a throwaway PostgreSQL 16 with a stubbed `auth` schema: backfill, verify, idempotent replay, stale reject, tombstone, 24h clock-drift reject, cross-user isolation and `rev` bump on update all behaved as designed. Not tested: real Supabase, Realtime delivery, pg_cron.
- Live bug found in v1 (fix first, task R6-01): `cloud.write` ignores the `{error}` that supabase-js returns instead of throwing, so a failed upload counts as success, the pending write is dropped and no banner shows. Any v1 data that "synced" while offline or while the JWT was expired may not be in `kv_store`; the migration must seed from each device's local copy, not only from the cloud.
- Hardest parts: (1) keeping `saveX(wholeArray)` call sites safe, because a stale component snapshot would tombstone or overwrite records that arrived by sync (design in Facts, bridge rules); (2) array order (drag-reorder) needs a `pos` column; (3) habit check-ins and task subtasks are nested arrays, so per-record LWW still loses concurrent check-ins unless check-ins become their own records (included in R6-04).
- Rollout: SQL backfill + per-key client flags + dual-write of the old blob for 14 days; rollback is flipping a flag. `kv_store` is never dropped because `public/dsa/mastery-map.html` writes it directly.
- 18 proposed tasks (R6-01..R6-18), two of them user-only. Overlaps with X1-16 (hlc.js) and X1-17 (migration SQL) are resolved by dependency, not duplication.

## Facts
Observed (file:line) unless prefixed "Inference:".
- Repo claims verified: React ^18.3.1 and vite ^5.4.11, `@supabase/supabase-js` ^2.116.0 (`package.json:16,20,25`). `node --test test/sync.test.js test/syncEngine.test.js test/undo.test.js` ran 23/23 pass.
- `node_modules` IS installed in this checkout (49 entries, postgrest-js 2.116.0). The brief says it is not.
- No `supabase/` directory and no `.sql` file exists in the repo; the server schema lives only in `docs/superpowers/specs/2026-09-15-cloud-sync-design.md:51-72`.
- `SYNCED_KEYS` has 17 entries (`src/store.js:59-63`). The spec lists 15 (`...cloud-sync-design.md:74-77`); `puzzleProgress` and `checklists` are newer.
- Local value is `{data, updatedAt}` (`src/sync/logic.js:11-13`); legacy raw values read as `updatedAt: 0` (`logic.js:5-9`).
- Cloud row `updated_at` is written from the client clock, not the server (`src/store.js:35`).
- Debounce 700 ms (`src/sync/engine.js:61-64`). `pending` Map is memory-only (`engine.js:10`). A failed push sets the failed flag but schedules no retry (`engine.js:56-58`); retry happens only on the next save, reconcile or flush.
- `cloud.write` does `await supabase.from('kv_store').upsert(...)` with no error check (`src/store.js:30-37`). postgrest-js resolves fetch failures as `{error}` unless `throwOnError()` is used (`node_modules/@supabase/postgrest-js/dist/index.cjs:418`).
- `__pre_sync_backup` is written only when a pull replaces a legacy local value with `updatedAt === 0` (`engine.js:113-115`); nothing reads it or deletes it. `claimOwner` wipes the whole localforage instance when the user changes (`engine.js:138-145`).
- `mutate` is a per-key promise queue doing read-fn-save (`engine.js:85-96`); only `progress` (`store.js:86-91`) and `reminders` (`store.js:162-164`) use it. Every other write is `setX(next); saveX(next)` from a React render snapshot (e.g. `src/tabs/Life.jsx:143-158`).
- Realtime: one channel `kv_store_changes`, filter `user_id=eq.<uid>`, calls `reconcileKey` then bumps `syncTicks` (`src/App.jsx:103-127`). Render is gated on `reconcileAll` finishing (`App.jsx:86-100,172-180`).
- The remount-on-sync problem is already fixed (commit deb249f); tabs take `syncTick` and re-run `useHydrate` (`src/useHydrate.js:12-19`). But `useHydrate` sets `ready:false` first (`useHydrate.js:13`), and Life then renders "Loading..." (`Life.jsx:175-177`), which unmounts children and drops open drafts on every remote tick.
- `KEY_TO_TAB` maps keys to `'Today'`, `'Exams'`, `'Puzzles'` (`App.jsx:35-42`). These are LogicBuilding sub-views, read at `src/tabs/LogicBuilding.jsx:42`, not entries in `TABS` (`App.jsx:15-21`); the new Today home collides with the name.
- `deleteWithUndo` persists `list.filter(...)` then on undo `persist([item, ...ref.current])` (`src/undo.js:10-11`). Tests: `test/undo.test.js` (3 tests).
- Ordered arrays: `placeItem` reorders tasks (`Life.jsx:318`), habits (`Life.jsx:820`), goals (`Expenses.jsx:926`), notes (`Notes.jsx:313`); order is part of the saved value.
- Legacy ids: `Date.now()` ids were replaced by `crypto.randomUUID()` in deb249f (`src/id.js:1`), so existing arrays can hold numeric or duplicate ids.
- `public/dsa/mastery-map.html` upserts `kv_store` key `dsa_mastery_v1` with a client `updated_at` (`:1621,1652-1653`), pulls it at `:1678`, and its own comment admits no timestamp comparison (`:1615-1620`). It is not in `SYNCED_KEYS`, so the app ignores it (`App.jsx:110`).

Key inventory (shape, family, consumers; "R" = read, "W" = write):
| key | shape | family | consumers |
|---|---|---|---|
| settings | object `{cfHandle, theme}` | doc | App.jsx:92,114,138,147; store.js:69-74 |
| notes | id'd array, `parentId` tree, ordered | id-list | Notes.jsx:235 R, 239 W |
| progress | map problemId -> `{status,tags,updatedAt}` | flat map | Today.jsx:52 R, 98 W via `markProblem`; LogicBuilding.jsx:31 R |
| expenses | id'd array | id-list | Expenses.jsx:154 R, 162 W |
| budgets | map catId -> number | flat map | Expenses.jsx:155 R, 166/298/308 W |
| goals | id'd array, ordered | id-list | Expenses.jsx:156 R, 170/318 W |
| examProgress | map `exam::section::topic` -> bool | flat map | Exams.jsx:100 R, 113 W; LogicBuilding.jsx:31 R |
| examNotes | id'd array | id-list | Exams.jsx:101 R, 143/148 W |
| investProgress | object `{done:{},quiz:{},tasks:{},current}` | leaf map | Invest.jsx:33 R, 39 W |
| watchlist | id'd array | id-list | Invest.jsx:34 R, 44 W |
| tasks | id'd array, nested `subtasks[]`, ordered | id-list | Life.jsx:88 R, 145 W |
| reminders | id'd array | id-list | Life.jsx:89 R, 149 W; Expenses.jsx:275 W (`mutateReminders`) |
| habits | id'd array, nested `checkins[]` of date keys, ordered | id-list + child | Life.jsx:90 R, 153 W, 803 |
| moodLog | array keyed by `date`, no id | by date | Life.jsx:91 R, 104/157 W |
| loans | id'd array | id-list | Expenses.jsx:157 R, 174 W |
| puzzleProgress | map id -> bool | flat map | Puzzles.jsx:48 R, 71 W; LogicBuilding.jsx:31 R |
| checklists | legacy id'd array, drained to `[]` | id-list | Life.jsx:114 R, 124 W |
So: 10 id-lists, 4 flat maps, 1 by-date list, 1 leaf map, 1 doc. The blueprint SQL (`id uuid primary key`) fits only the 10 id-lists.

Design: schema (see SQL file for exact DDL).
- PK `(user_id, collection, id)`, `id` is text (`String(item.id)`, map key, `YYYY-MM-DD` for moodLog, `habitId:YYYY-MM-DD` for check-ins). Map entries and leaves are records too; a bare `false` is a value, not a delete.
- `hlc text collate "C"`: `<15-digit ms>-<4-hex counter>-<node 8>`; string order equals causal order in JS and SQL. Server-side CHECK enforces the format.
- `rev` comes from a sequence and a BEFORE INSERT OR UPDATE trigger, because the blueprint's identity column only fires on INSERT.
- RLS: select/insert/update `(select auth.uid()) = user_id`; no DELETE policy, so clients cannot physically delete. GC runs as `security definer` via pg_cron (90 days).
- `forge_push(rows jsonb)` (security invoker): batched upsert guarded by `where records.hlc < excluded.hlc`, so replays and reordered retries are no-ops, which is the idempotency key. Rows with hlc more than 24 h ahead of the server clock are dropped.
- Realtime: `alter publication supabase_realtime add table records`, one channel, filter `user_id=eq.<uid>`; deletes are tombstone UPDATEs, so default replica identity is enough.
- Indexes: `(user_id, rev)` for the delta pull; partial index on `deleted_at` for GC. Pull is `rev > cursor - 50` (overlap window, de-dupe by hlc) because sequence values can commit out of order.

Design: client.
- Hybrid logical clock from X1-16: `send()` = max(wall, last)+counter; `receive(remote)` = max(wall, last, remote)+counter. Remote hlc more than 24 h ahead is rejected, so one wrong-clock device cannot poison the clock. A phone with a wrong clock no longer wins forever once the others have seen its stamp.
- Local store (localforage `forge` instance): `r2:<collection>` = `{recs:{id:{b,h,d,p}}}`, `r2:outbox` (set of dirty `(collection,id)`), `r2:meta` `{cursor, userId, deviceId, lastPullAt}`. The outbox stores no payloads; they are read at send time, so 3 edits coalesce into 1 op and replay is idempotent. Outbox is persisted (v1's `pending` was memory-only).
- Per-record merge on pull or realtime: apply iff `incoming.hlc > local.hlc`. Equal hlc is a no-op, so own echoes cost nothing. moodLog adds a `resolve` hook: `source:'logged'` beats `'derived'` regardless of hlc (otherwise two devices deriving the same date overwrite a manual entry).
- Diff-based save keeps `getX/saveX/mutateX` signatures. Rules (the "bridge", needed while call sites still pass whole arrays): (a) emit an op only for records changed against the version the item was read at (items carry an enumerable `__v` = hlc read, which survives `{...spread}`); unchanged records emit nothing, because stamping untouched records is exactly the whole-key failure; (b) tombstone only ids that were previously served to the UI, so a record that arrived by pull after the caller's last `get()` is never deleted by a stale save; (c) order changes become one fractional `pos` change (midpoint, renumber on exhaustion); (d) re-adding a tombstoned id (undo) upserts with a newer hlc and resurrects it. Residual risk: two live components holding stale copies of one key; the fix is `useSynced(key).update(fn)`, which runs inside the per-key `mutate` queue against fresh state.
- Drain: 700 ms debounce, batches of 200, retry with 1 s, 2 s, 4 s ... cap 300 s plus jitter, on `online`, `visibilitychange`, auth change and realtime reconnect. A constraint error rejects the whole batch (verified in psql), so the client bisects to isolate and quarantine one bad record.
- Tombstone GC at 90 days. A device offline longer than 60 days does a full pull and drops local records that are absent from the cloud, older than the pull start and not in the outbox.
- `useSynced(key)` via `useSyncExternalStore` over an in-memory cache: synchronous `ready` once cached (no Loading flash on route changes), `save`, `update(fn)`; `useSyncStatus()` returns `{failed, pending, lastSyncedAt}`. This replaces `KEY_TO_TAB`/`syncTicks`; a shim keeps `syncTick` props working during migration.

Design: migration from kv_store.
1. Backup: `create table kv_store_backup_20261112 as table kv_store` (RLS on, no policy), plus the JSON export from X1-07, plus untouched `__pre_sync_backup` keys.
2. SQL `forge_backfill()` explodes each blob into records, with `hlc` derived from `kv_store.updated_at` and node `backfill`, so re-runs are idempotent and any real edit beats it. `DISTINCT ON` guards duplicate legacy ids (an unguarded insert fails with "cannot affect row a second time"; I hit this class on the test fixture).
3. Dual-write: a v2 client also rewrites the v1 `{data,updatedAt}` local shape and the `kv_store` blob (debounced) for 14 days. A v1 device's blob writes are imported additively (no tombstones); deletes made on a stale v1 device are lost, which is accepted and flagged.
4. First v2 launch on each device runs `seedFromLocalBlob`, pushing local records missing or newer in the cloud (covers edits v1 never uploaded).
5. Per-key flag `VITE_SYNC_V2_KEYS` (Vercel env) with a per-device localStorage override. Order: puzzleProgress, examProgress, examNotes, watchlist, progress; then loans, goals, budgets, expenses, reminders, notes, tasks, investProgress; then habits, moodLog, settings.
6. Verify: `v2_verify` view (count and md5 of ids per key, blob vs live; `ok` must be true before a key flips) plus a client-side deep-equal for habitCheckins, investProgress and settings. Rollback per key = remove it from the env var; full rollback = SQL section 8; `kv_store` and the backup table are never touched.
7. Coexistence: `claimOwner` still wipes the one localforage instance, which now also holds records, outbox, cursor and device id, so they stay consistent; `r2:meta.userId` is checked before any push. `__pre_sync_backup` keys stay as-is until `claimOwner` clears them.

Interplay.
- Undo: no change to `undo.js`; add-back is an upsert with newer hlc (test in R6-15).
- mutate queues: kept per key; habits and habitCheckins share the `habits` queue.
- useHydrate: stays for non-synced loaders; synced screens use `useSynced`. The "derive mood once, gated on ready" fix from deb249f maps to `ready` from all four keys.
- Level/XP: derive from `habits` and `habitCheckins` (`streaks()`/`earnings()` in `src/life/logic.js`); persisting it would add a synced key and a double-count risk, so do not.

Tests: pure (`records`, `diff`, `adapters`, `outbox`), engine with fakes (`fakeCloudV2` mirrors the SQL vectors, `fakeDb`), two-device simulation (all 16 edit combinations x 2 "edited last" values from blueprint Lab 1 at `docs/forge-blueprint.html:1167-1226`, plus wrong clock, habit check-ins, undo). Existing 23 tests stay green.

## Gaps and contradictions
- Blueprint 2.4 schema `rev bigint generated always as identity` (`docs/plan/blueprint.txt:104`) is assigned on INSERT only, so `where rev > last_seen_rev` never sees an update. Fixed with sequence plus trigger (verified: rev increased on update). Same finding as R2 and X1-17.
- Blueprint 2.4 says "server clock wins ties" (`blueprint.txt:101`) and the table has no HLC. The client clock decides today (`store.js:35`); v2 needs `hlc` plus `device_id`.
- Blueprint sketches `id uuid primary key` per entity (`blueprint.txt:98-106`). 7 of 17 keys have no id (maps, by-date list, objects), and legacy ids can be numeric or duplicated. Generic `records` with text ids instead; this is a deliberate deviation from "schema per entity".
- Blueprint says per-record rows fix lost edits. True for list membership, not for nested arrays: `habits.checkins[]` and `tasks.subtasks[]` still collide inside one record. Habit check-ins are split out in this plan; subtasks are deferred (Needs).
- Blueprint is silent on array order, but order is saved data (`placeItem` call sites above); `pos` was added.
- Spec says one `kv_store` and 15 keys (`...cloud-sync-design.md:74-77`); code has 17 and the DSA key. The spec's non-goal "LWW per data key" (`:35-38`) is what v2 supersedes.
- Brief says "tab remounting" via `KEY_TO_TAB`; that was removed in deb249f, but the `ready:false` flash still drops drafts.
- Brief says node_modules is not installed; it is.
- X1-16 (hlc.js) and X1-17 (`supabase/migrations/0001_sync_v2.sql`, "per-record tables") overlap this work. R6-02 pins the hlc string format X1-16 must emit; R6-10 requires 0001 to contain sections 0-5 of `R6-sync-v2.sql`. Synthesis must keep that order.
- R2-04 (mutate wrappers) and R2-07 (LifeData provider) assume the current `mutate*` API. They stay valid: `mutate` is kept and `useSynced.update` is additive.
- Not checkable here: live Supabase project state (kv_store DDL drift, plan tier, pause history, Postgres version, Realtime enabled). SQL was validated on PG16 only.
- `docs/plan/blueprint.txt` has no text for the learning-graph nodes or Lab 1 code; I read them in `docs/forge-blueprint.html:1018-1034,1167-1226`. Lab 1's `>=` tie rule (phone wins) is replaced by a total order (hlc, then node id).

## Risks
- Stale whole-array save tombstones or reverts records that arrived by sync. Mitigation: bridge rules (a)-(d), `useSynced.update(fn)`, R6-03 and R6-15 tests; migrate call sites off `saveX(array)`.
- v1 silent write failure means `kv_store` may be missing edits, so a backfill from the cloud alone could lose data. Mitigation: R6-01 now; `seedFromLocalBlob` on every device before cutover; run `v2_verify` and compare against a local export.
- Backfill duplicates or bad ids abort the SQL insert. Mitigation: `DISTINCT ON`, tested on a duplicate-id fixture.
- Out-of-order `rev` visibility hides a row from a cursor pull. Mitigation: 50-row overlap, idempotent merge.
- Wrong device clock. Mitigation: HLC receive rule, 24 h drift guard in client and in `forge_push`.
- Two browser tabs read-modify-write the same IndexedDB item and lose a write (v1 has the same issue). Mitigation: Web Locks around writes, BroadcastChannel to refresh other tabs; the lock and bus are injected so tests cover them. This is the least proven part; spike it first in R6-07.
- One constraint-violating row blocks every later push. Mitigation: bisect and quarantine in the outbox (R6-05).
- A device offline for more than 90 days resurrects deleted records. Mitigation: 60-day full-resync rule.
- A stale PWA or device still on v1 during dual-write; its deletes are lost. Mitigation: additive blob import, 14-day window, per-device check `count(distinct device_id)` before retiring v1.
- `claimOwner` clear erases an unsynced outbox when another user signs in on a shared device (same as v1). Mitigation: acceptable for a single-owner app; document in the runbook.
- Free-tier pause stops sync (blueprint 2.6). Mitigation: X1-08 keep-alive and X1-07 export; out of my lane.
- Breaking `public/dsa/mastery-map.html` by touching `kv_store`. Mitigation: never drop or rename it; R6-18 acceptance forbids it.
- Dual-write doubles local and cloud writes for 14 days. Mitigation: debounce the blob mirror at 5 s; volume is one user.

## Write-set map
New, no contention: `src/sync/{records,diff,adapters,outbox,cloudV2,cloudKv,migrate,router,snapshotStore}.js`, `src/useSynced.js`, `src/sync/engine2.js` (two sequential writers: R6-07 then R6-08), `test/sync*.test.js` for each, `test/helpers/fakeCloudV2.js`, `test/helpers/fakeDb.js`, `test/fixtures/sync-v1-blobs.json`, `supabase/migrations/0002..0003*.sql`, `supabase/rollback/sync_v2_down.sql`, `docs/runbooks/sync-v2-cutover*.md`.
Hot spots (many tasks edit):
- `src/store.js`: R2-04, R6-01, R6-12, R6-18 (and any R3/R4 wrapper work). Serialised by deps R2-04 -> R6-01 -> R6-12 -> R6-18.
- `src/App.jsx`: R1-09 then R6-14. R6-14 must follow the shell rewrite.
- `src/sync/engine.js`: only R6-01 (v1 retry); v2 never edits it.
- `src/tabs/Life.jsx`, `Expenses.jsx`, `Invest.jsx`, `Notes.jsx` (call-site migration to `useSynced`/`update`): owned by R2/R4 tasks; no R6 task writes them. Synthesis should add a deps edge from their data-wiring tasks to R6-13.
- `package.json`: R6 adds no dependency (node:test, localforage and supabase-js already present).
- `docs/runbooks/sync-v2-cutover-log.md`: R6-16 then R6-17 (dep).

## Needs from the user
- Supabase dashboard (only you can): confirm plan tier and project status; confirm the live `kv_store` DDL and RLS match the spec (`...cloud-sync-design.md:51-72`); confirm Realtime is enabled; run the migrations and `forge_backfill()` in the SQL editor (R6-16); optionally enable `pg_cron` for tombstone GC (otherwise GC is manual).
- Vercel: set and later edit `VITE_SYNC_V2_KEYS` per rollout stage (R6-17).
- Device facts: how many devices and which (iPhone/iPad Safari, desktop browsers), whether any runs an old home-screen PWA, and the longest a device stays offline.
- Decisions: (1) split habit check-ins into their own records (recommended yes); (2) subtasks stay nested for now (recommended); (3) tombstone retention 90 days; (4) 14-day dual-write window; (5) accept that deletes made on a stale v1 device during that window are lost.
- No keys needed: the anon key and project URL are already in the repo (`public/dsa/mastery-map.html:1613-1614`) and are not secrets; no service-role key is used.

## Proposed tasks
S = under half a day, M = about a day. Details, write-sets and acceptance commands are in `R6.tasks.json`.
- R6-01 (S) Make kv_store writes throw on error and add push retry/backoff to v1. Deps R2-04.
- R6-02 (S) Record merge primitives and the HLC format contract. Deps X1-16.
- R6-03 (M) List diff, fractional positions and the stale-snapshot guard. Deps R6-02.
- R6-04 (M) Per-key adapters for all 17 keys, with habit check-ins split. Deps R6-02.
- R6-05 (S) Outbox: coalescing, batching, backoff, poison isolation. Deps R6-02.
- R6-06 (M) Fakes of the v2 cloud and db that mirror the SQL. Deps R6-02.
- R6-07 (M) engine2 local half (record store, get/save/update, subscribe, tab lock). Deps R6-03, R6-04, R6-05, R6-06.
- R6-08 (M) engine2 network half (drain, delta pull, realtime, long-offline resync). Deps R6-07.
- R6-09 (S) Supabase glue: forge_push RPC, delta pull, realtime. Deps R6-06.
- R6-10 (S) Backfill, verify and rollback SQL plus the cutover runbook. Deps X1-17.
- R6-11 (M) Migration helpers: flags, blob mirror, additive import, seed, verifier. Deps R6-08, X1-07.
- R6-12 (M) Route store.js per key behind flags. Deps R6-01, R6-08, R6-09, R6-11.
- R6-13 (S) `useSynced` and `useSyncStatus` hooks over a snapshot store. Deps R6-12.
- R6-14 (M) App.jsx: engine subscriptions replace the kv_store channel and KEY_TO_TAB. Deps R6-13, R1-09.
- R6-15 (M) Two-device simulation and undo-resurrection tests. Deps R6-08.
- R6-16 (S, user) Backup, apply SQL, backfill, record `v2_verify`. Deps R6-10.
- R6-17 (S, user) Staged per-key rollout and device confirmation. Deps R6-14, R6-15, R6-16.
- R6-18 (S, P4) Retire the v1 mirror after the rollback window; keep `kv_store`. Deps R6-17.
