# Runbook: Supabase free tier (keep-alive, JSON export, restore drill)

Task B1-09. Documentation only. Nothing in this file has been run against a live project, and no step here was executed by the author.

Marker used below: **OWNER ACTION** means a step that needs the owner's Supabase dashboard, Vercel dashboard or signed-in app. An agent has no access to these and must not attempt them.

Sources: docs/superpowers/specs/2026-09-15-cloud-sync-design.md (table and RLS), src/store.js (`SYNCED_KEYS`), src/sync/engine.js and src/sync/cloudKv.js (value shape), docs/adr/0003-sync-v2.md (backup and rollback), docs/plan/blueprint-errata.md E-14 and E-12, docs/plan/plan.json tasks X1-07, X1-08, P5-U2, R6-16.

## Why this exists

The blueprint (docs/plan/blueprint.txt line 113) states that free Supabase projects pause after about a week idle. A paused project means the app cannot sync and the owner cannot reach the data until it is restored. Forge is offline-first (IndexedDB is the local copy), so a pause is not instant data loss, but a cleared browser plus a paused or lost project would be. This runbook covers three things: keeping the project awake, taking a full JSON export, and proving that an export restores into an empty project.

The exact pause threshold and the restore window for a paused project are Supabase's to define and can change. Check the dashboard and Supabase's current documentation rather than trusting "about a week" from the blueprint.

## 1. Keep-alive scheduler options

Status: **OPEN (D16, who runs the keep-alive).** Default assumed in docs/plan/OPEN-DECISIONS.md is Vercel cron. Work proceeds on that default. The owner confirms or changes it; if changed, update docs/plan/blueprint-errata.md E-14 and this table.

| Option | How it works | Needs | Trade-offs | Choice |
|---|---|---|---|---|
| A. Vercel cron calling `api/keepalive.js` | A daily entry in `vercel.json` `crons` calls a CRON_SECRET-protected function that runs one light Supabase query. Built by task X1-08 (P5). | `CRON_SECRET` set in the Vercel project env (task P5-U2, OWNER ACTION). Hobby plan crons are daily with hour precision per the X1-08 notes, which fits a roughly weekly window. | Lives in the repo and deploys with the app. Silent if the Vercel project is paused, removed or the env var is missing. Does not exist yet: `vercel.json` has no `crons` today and `api/keepalive.js` is not written. | **CHOSEN (default, pending D16)** |
| B. GitHub Actions scheduled workflow | A workflow in `.github/workflows/` with a `schedule:` trigger calls the same endpoint or the Supabase REST API. | A repository secret holding the credential (OWNER ACTION). | Independent of Vercel. GitHub may disable scheduled workflows in repositories with no activity; confirm the current rule before relying on it. Not planned in plan.json. | Not chosen |
| C. External pinger (any uptime or cron service) | The service requests a URL on a timer. | An account on that service, and an endpoint it may call (the CRON_SECRET header or token must be configurable on that service). | Adds a third-party account and a stored secret. Independent of Vercel and GitHub. Not planned in plan.json. | Not chosen |
| D. Manual | The owner opens the app and signs in at least once a week. | Discipline only. | Zero setup, easy to forget. Acts as the fallback for every other option. | Fallback only |

Unverified and must be checked by the owner or by task X1-08 before it is trusted: whether a query that RLS filters down to zero rows counts as activity for the pause timer. X1-08 therefore queries `kv_store` with the owner's service role or a signed-in owner token. The service role key must only ever live in server-side env vars (Vercel, never a `VITE_` variable, never the repo).

Owner check after option A is live (OWNER ACTION):

1. Vercel dashboard, project, Cron Jobs: the `/api/keepalive` job is listed and has a recent successful run.
2. Supabase dashboard, project home: the project status is Active, not Paused.
3. Put a recurring reminder (monthly) to repeat checks 1 and 2.

## 2. JSON export

### What is exported: the 17 keys

These are `SYNCED_KEYS` in src/store.js, in that order. Each is one row in `public.kv_store` (primary key `user_id, key`). Locally each key sits in the IndexedDB database named `forge` as the wrapper `{ data, updatedAt }` (src/sync/engine.js, `wrapForSave`). In the cloud the `value` column holds only `data`, and `updated_at` holds the timestamp. An export is complete only if all 17 are present, even if a key is empty.

| # | Key | Empty value (fallback in src/store.js) | Shape family (ADR-0003) |
|---|---|---|---|
| 1 | settings | `{}` | settings document |
| 2 | notes | `[]` | id list |
| 3 | progress | `{}` | flat map |
| 4 | expenses | `[]` | id list |
| 5 | budgets | `{}` | flat map |
| 6 | goals | `[]` | id list |
| 7 | examProgress | `{}` | flat map |
| 8 | examNotes | `[]` | id list |
| 9 | investProgress | `{ done: {}, quiz: {}, tasks: {}, current: null }` | leaf map |
| 10 | watchlist | `[]` | id list |
| 11 | tasks | `[]` | id list |
| 12 | reminders | `[]` | id list |
| 13 | habits | `[]` | id list |
| 14 | moodLog | `[]` | by date |
| 15 | loans | `[]` | id list |
| 16 | puzzleProgress | `{}` | flat map |
| 17 | checklists | `[]` | id list |

Not part of the 17 but also stored in `kv_store`: `dsa_mastery_v1`, written directly by public/dsa/mastery-map.html. Include it in any cloud-side export (Method 2). The local `{key}__pre_sync_backup` entries (written by src/sync/engine.js when a pull replaces a legacy local value) are also not among the 17; they exist only in the browser that wrote them and are only captured by Method 3.

Never export or paste: the anon key, the service role key, `CRON_SECRET`, the Supabase session token held in `localStorage`, or any `.env` file. The export file contains the owner's personal data (money, loans, notes), so store it as private data (encrypted disk or private storage) and never commit it to the repo.

### Method 1: in-app export (preferred once it exists)

Task X1-07 adds src/backup/backup.js and a BackupPanel with Export and Import buttons, mounted from the Settings sheet by R6-14. Until X1-07 and R6-14 are merged, this method does not exist; use Method 2.

1. Sign in on the device that has the freshest data. Wait for the sync status to show no failed banner.
2. Settings, Backup, Export. The file downloads. Its format and version field are defined by X1-07; this runbook does not restate them.
3. Run the completeness check at the end of this section on the file, adapting it to the X1-07 format if that differs from the one shown.

### Method 2: cloud-side export from the dashboard (OWNER ACTION)

Works today. Gets what the cloud holds, which can lag a device by a few seconds, or longer if the device is offline or a push failed (the failed banner means the push did not land).

1. Supabase dashboard, Authentication, Users: copy the owner's user id (a uuid).
2. SQL Editor, run the following with the uuid filled in. It builds one JSON object keyed by `kv_store.key`, each value in the same `{ data, updatedAt }` wrapper the app uses locally (`updatedAt` in epoch milliseconds, matching src/sync/cloudKv.js).

```sql
select jsonb_pretty(
  jsonb_object_agg(
    key,
    jsonb_build_object(
      'data', value,
      'updatedAt', (extract(epoch from updated_at) * 1000)::bigint
    )
  )
) as forge_export
from public.kv_store
where user_id = '<OWNER-UUID>';
```

3. Copy the single result cell (or use the dashboard's result download if it offers one) into a file named like `forge-export-YYYY-MM-DD.json`. Large cells may be truncated by the dashboard UI. If the file fails the completeness check or does not parse as JSON, export key by key with `select value from public.kv_store where user_id = '<OWNER-UUID>' and key = '<KEY>';` for each of the 17 keys plus `dsa_mastery_v1`.
4. Run the completeness check.

### Method 3: per-device export from the browser (OWNER ACTION, owner is the person at the device)

Use this when the cloud copy is suspect, for example a failed banner, an offline device, or before wiping a browser. It reads the local IndexedDB database `forge` directly and never talks to Supabase. Open the app, open the browser developer console, paste the snippet. Not run or tested by the author of this runbook; if it prints an error or fewer than 17 keys, stop and do not wipe anything.

```js
(async () => {
  const keys = ['settings','notes','progress','expenses','budgets','goals','examProgress','examNotes','investProgress','watchlist','tasks','reminders','habits','moodLog','loans','puzzleProgress','checklists']
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('forge')
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const store = db.objectStoreNames[0] // localforage keeps everything in one object store
  const get = (k) => new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).get(k)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
  const out = {}
  for (const k of keys) out[k] = await get(k)
  for (const k of keys) { const b = await get(k + '__pre_sync_backup'); if (b !== undefined) out[k + '__pre_sync_backup'] = b }
  const missing = keys.filter((k) => out[k] === undefined)
  console.log('keys present:', keys.length - missing.length, 'of 17; missing:', missing)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }))
  a.download = 'forge-local-export-' + new Date().toISOString().slice(0, 10) + '.json'
  a.click()
})()
```

A key that is missing here is a key never written on that device (the app then shows its empty fallback from the table above). That is normal for a new device and is not an error by itself, but note it in the drill log.

### Completeness check (any method, after the file is saved)

Run on the machine holding the file. Reads only the local file, no network. Replace the path.

```sh
node -e '
const keys = ["settings","notes","progress","expenses","budgets","goals","examProgress","examNotes","investProgress","watchlist","tasks","reminders","habits","moodLog","loans","puzzleProgress","checklists"];
const f = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const missing = keys.filter((k) => !(k in f));
for (const k of keys) if (k in f) console.log(k.padEnd(16), Array.isArray(f[k]?.data) ? f[k].data.length + " items" : typeof f[k]?.data);
console.log(missing.length ? "MISSING: " + missing.join(", ") : "all 17 keys present");
process.exit(missing.length ? 1 : 0);
' forge-export-YYYY-MM-DD.json
```

Pass means all 17 keys are present. It does not prove the contents are current; compare the item counts to what the app shows (for example the number of expenses) before trusting the file.

### Cadence

Export monthly, and always before: any SQL change on the live project, the sync v2 cutover (R6-16 requires the export plus the `kv_store_backup_20261112` table copy, see docs/adr/0003-sync-v2.md), clearing browser data, or switching or wiping a device. Keep at least the last three exports. Record each export (date, method, 17 of 17) in a log you control; do not commit the exports themselves.

## 3. Restore drill

Goal: prove that an export restores into an empty project and that all 17 keys come back. Run it once before the sync v2 cutover (R6-16) and then at least twice a year. Always restore into a scratch project, never into the live one. Every step needs the owner (OWNER ACTION) except where stated.

1. OWNER ACTION. In the Supabase dashboard create a new scratch project (free tier, any region, name it so it cannot be confused with the live one, for example `forge-restore-drill`). Record its project URL and anon key somewhere private. Do not use the live project's URL or keys anywhere in this drill.
2. OWNER ACTION. In the scratch project SQL Editor run the `kv_store` DDL from docs/superpowers/specs/2026-09-15-cloud-sync-design.md (table, `enable row level security`, the four policies, and the Realtime publication line). Then Authentication: enable email and password sign-in and create one user. Copy that user's uuid.
3. OWNER ACTION. Pick the export to test (Method 1, 2 or 3) and run the completeness check on it. Do not continue unless it prints `all 17 keys present`.
4. OWNER ACTION. Load the data into the scratch project by one of two paths.
   - Path A (once X1-07 is merged): run the app locally with a `.env` pointing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at the scratch project, in a fresh browser profile so the live project's session and IndexedDB are not involved. Sign in as the scratch user, Settings, Backup, Import the file. X1-07 writes `{ data, updatedAt: Date.now() }` so the next reconcile pushes every key up.
   - Path B (works today, for a file in the `{ key: { data, updatedAt } }` shape from Method 2 or 3): in the scratch project SQL Editor, paste the file contents where marked and run. Remove any `__pre_sync_backup` entries from the file first (they are local-only and do not belong in `kv_store`); `dsa_mastery_v1` may stay.

     ```sql
     insert into public.kv_store (user_id, key, value, updated_at)
     select '<SCRATCH-USER-UUID>', t.key, t.value -> 'data',
            to_timestamp(((t.value ->> 'updatedAt')::bigint) / 1000.0)
     from jsonb_each($forge$ PASTE THE WHOLE JSON FILE HERE $forge$::jsonb) as t(key, value)
     on conflict (user_id, key) do update
       set value = excluded.value, updated_at = excluded.updated_at;
     ```
5. OWNER ACTION. Verify the cloud side. In the scratch project SQL Editor run `select key, jsonb_typeof(value) as type, updated_at from public.kv_store where user_id = '<SCRATCH-USER-UUID>' order by key;` and confirm that all 17 keys from the table in section 2 appear (18 rows if `dsa_mastery_v1` was included). Compare each list key's item count with the completeness check output.
6. OWNER ACTION. Verify the app side. Point a local dev build at the scratch project (as in step 4 Path A) in a fresh browser profile, sign in as the scratch user, and wait for the sync status to settle. Confirm each tab shows the exported data: Life (tasks, reminders, habits, notes), Money (expenses, budgets, goals, loans), Invest (watchlist, investProgress), Logic (progress, puzzleProgress, examProgress, examNotes), checklists, mood log and settings (theme). Spot-check at least three records per list key against the original.
7. OWNER ACTION. Write down the result: date, export method and file name, source of the export, `17 of 17` yes or no, any key that differed and why, how long the drill took. Pass means all 17 keys restored and the spot checks matched. Any miss is a bug to file before the sync v2 cutover, not something to fix silently.
8. OWNER ACTION. Delete the scratch project from the Supabase dashboard, remove the scratch `.env` values, and delete the fresh browser profile. Confirm the live project's `VITE_SUPABASE_URL` in Vercel and your real `.env` were never changed.

If the live project itself is paused rather than lost, do not run the drill; use the restore option in the Supabase dashboard first and check the current restore window in Supabase's documentation (not verified here). Only if the project is unrecoverable do you restore from the latest export into a new project by repeating steps 2 to 6 against the new project and then updating `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel and `.env` (OWNER ACTION), followed by one sign-in per device. Note that `vercel.json` has the project host in its `connect-src` Content-Security-Policy entries, so a new project also needs those two hostnames updated in `vercel.json` (a code change for a normal task, not part of this runbook).

## Open items

- D16: who runs the keep-alive. OPEN, default Vercel cron.
- Unverified: whether a zero-row RLS query counts as activity for the pause timer (also noted in X1-08).
- Unverified: current pause threshold and the restore window for a paused free project.
- Method 3 snippet and the Method 2 SQL have not been run by the author.
- X1-07 (export and import UI), X1-08 (keep-alive) and P5-U2 (CRON_SECRET) do not exist yet; Method 1, Path A and option A are descriptions of the plan, not of shipped code.
