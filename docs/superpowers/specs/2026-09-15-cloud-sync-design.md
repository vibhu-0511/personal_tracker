# Cloud sync for Forge (Supabase)

## Context

Forge currently stores everything — habits, expenses, tasks, invest watchlist,
exam progress, mood log, loans, notes, everything in `store.js` — in
IndexedDB via `localforage`, scoped to one browser on one device. There is no
backup anywhere. Clearing browser data, switching devices, or iOS evicting
storage under pressure loses it permanently with no recovery path.

This surfaced while adding a large personal DSA study tool
(`logic_building/mastery_map_DSA_v11.html`, ~8,300 lines of curated
algorithms/tricks/problem tracking) under the Code tab — the user does not
want to lose that data, and on reflection wants the same guarantee for the
whole app, with live sync across devices (phone + laptop), not just periodic
backup.

The user has created a Supabase project (`vibhu-0511's Project`,
`ap-northeast-2`, free tier) for this.

## Goals

- No Forge data is ever unrecoverable, even if local browser storage is wiped.
- Edits made on one device appear on another within a few seconds, without a
  manual refresh (Supabase Realtime, not polling).
- The DSA tool's own data rides the same system — no separate backend.
- Every existing tab keeps working exactly as it does today from the UI's
  perspective; the sync layer is invisible to `Today.jsx`, `Expenses.jsx`,
  `Life.jsx`, etc. They still just call `getExpenses()` / `saveExpenses()`.
- Works offline: reads/writes never block on network; sync catches up when
  connectivity returns.

## Non-goals

- Field-level / operational-transform merging. Conflict resolution is
  **last-write-wins per data key** (e.g. the whole `habits` blob, not
  individual habit fields) — the right trade-off for a single-person tool,
  not a real-time collaborative document.
- Multi-user support. One Supabase Auth user (the app owner). RLS scopes rows
  to that user, but there's no concept of sharing or multiple accounts.
- Syncing ephemeral UI state (active tab, open filters, form drafts) — only
  the persisted data keys already in `store.js` today.
- Migrating away from IndexedDB. It stays as the fast, offline-capable local
  cache; Supabase is the durable backup + sync channel underneath it.

## Data model

One generic table. It mirrors `store.js`'s existing key/value shape — no
per-feature schema needed, and it gives the DSA tool a natural home too.

```sql
create table public.kv_store (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.kv_store enable row level security;

create policy "read own data" on public.kv_store
  for select using (auth.uid() = user_id);
create policy "write own data" on public.kv_store
  for insert with check (auth.uid() = user_id);
create policy "update own data" on public.kv_store
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own data" on public.kv_store
  for delete using (auth.uid() = user_id);

alter publication supabase_realtime add table public.kv_store;
```

Existing `store.js` keys become rows: `settings`, `notes`, `progress`,
`expenses`, `budgets`, `goals`, `examProgress`, `examNotes`,
`investProgress`, `watchlist`, `tasks`, `reminders`, `habits`, `moodLog`,
`loans`, plus a new `dsa_mastery_v1` for the DSA tool's snapshot.

## Auth

Real Supabase email/password auth — one account, the app owner's. An
anonymous/device-bound session won't work here because live cross-device
sync needs a persistent identity to log into from both the phone and the
laptop.

`App.jsx` gets a login gate ahead of the existing app shell, same pattern as
the current "set your Codeforces handle" first-run prompt: if there is no
active Supabase session, show a minimal email + password form (sign up or
sign in); once authenticated, render the app exactly as today. The Supabase
JS client persists the session in `localStorage` and auto-refreshes it, so
this is a one-time action per browser, not a login-every-visit flow.

## Sync layer (`store.js` rewrite)

**Local value shape changes.** Today each key stores its raw value directly.
To make last-write-wins comparable against the cloud row's `updated_at`,
each key now stores `{ data, updatedAt }` locally instead of the raw value.

**Migrating existing local data.** A read that finds the *old* unwrapped
shape (no `updatedAt` field) treats it as legacy data and wraps it with
`updatedAt: 0` on the fly — it is never dropped, just treated as "old" once
a cloud row exists to compare against. On first sign-in, if a key has local
data but no cloud row yet, local data is pushed up (seeded), regardless of
its timestamp — this is what prevents day-one data loss on first login.

**Two generic functions replace the pattern**, and the existing ~15 exported
`getX`/`saveX` pairs become thin wrappers over them (smaller diff, one place
to get the sync logic right, instead of duplicating it 15 times):

```js
// src/store.js (sketch)
async function readLocal(key) {
  const raw = await db.getItem(key)
  if (raw == null) return null
  if (raw && typeof raw === 'object' && 'updatedAt' in raw) return raw
  return { data: raw, updatedAt: 0 } // legacy unwrapped value
}

async function getSynced(key, fallback) {
  const local = await readLocal(key)
  return local ? local.data : fallback
}

async function saveSynced(key, data) {
  const wrapped = { data, updatedAt: Date.now() }
  await db.setItem(key, wrapped)
  schedulePush(key, wrapped) // debounced upsert to Supabase; silently skipped offline
}
```

**Reconciliation** runs once after auth succeeds, and again whenever a
Realtime event arrives for a key. It only ever touches *saved* values in
IndexedDB, never in-flight form state (an unsaved amount typed into a form
is separate React state, not persisted yet, so it's never at risk of being
overwritten by an incoming sync):

```js
async function reconcileKey(key) {
  const local = await readLocal(key)
  const { data: row } = await supabase
    .from('kv_store').select('value, updated_at')
    .eq('key', key).maybeSingle()

  if (!row) {
    if (local) await pushToCloud(key, local) // seed: never synced from this account yet
    return
  }
  const cloudUpdatedAt = new Date(row.updated_at).getTime()
  if (!local || cloudUpdatedAt > local.updatedAt) {
    await db.setItem(key, { data: row.value, updatedAt: cloudUpdatedAt }) // cloud wins
  } else if (local.updatedAt > cloudUpdatedAt) {
    await pushToCloud(key, local) // local wins
  }
}
```

**Realtime subscription**: one channel on `kv_store` filtered to
`user_id=eq.<current user>`, wired once (in `App.jsx` or a small
`useCloudSync` hook), calling `reconcileKey` for whichever key changed. Tabs
already re-render off their existing `useState`/`useEffect` `get*()` calls,
so a reconciled key just needs its consumers to re-fetch — the existing
per-tab `useEffect(() => { getExpenses().then(setExpenses) }, [])` pattern
already does this; the hook triggers a re-fetch, not a rewrite of every tab.

**Offline**: `schedulePush` failures (no network) are caught and swallowed;
the local `{ data, updatedAt }` write already succeeded, so nothing is lost
— the next successful reconciliation (on reconnect / next app open) pushes
the newer local timestamp up.

## DSA tool integration

- Copy `mastery_map_DSA_v11.html` into `forge/public/dsa/mastery-map.html`,
  unmodified except for its persistence layer.
- Its existing "Mastery Map persistence sync" IIFE (the block that talks to
  `localhost:8787`'s `/data` and `/save`) is replaced with a small script
  that loads `@supabase/supabase-js` from a CDN (the file is static, outside
  the Vite build) and does the same job — debounced snapshot of its own
  `localStorage` — against `kv_store` under key `dsa_mastery_v1`, using the
  same project URL/anon key as the main app.
- Because the file is served from the same origin as the rest of Forge and
  Supabase's client persists its session in `localStorage`, signing in once
  on the main app is enough — the DSA tool page picks up the same session
  automatically. No separate login screen needed there.
- None of the tool's actual content (`TABS`, per-topic data, problem log) is
  touched — only the persistence shim.
- A "📘 DSA Mastery Map" link is added near the top of the Code tab
  (`Today.jsx`), opening `/dsa/mastery-map.html` as a normal full-page
  navigation (not an iframe) — the tool already has its own responsive
  layout built for standalone use.

## Config

- New env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — added to a
  local `.env` and to the Vercel project's Environment Variables. Neither is
  secret; RLS is what protects the data, not hiding the anon key.
- New dependency: `@supabase/supabase-js` (React app only; the DSA tool
  loads its own copy from a CDN).

## Manual prerequisites (tracked here for completeness — not part of the code change)

1. Enable email/password auth in the Supabase dashboard.
2. Run the SQL above in the Supabase SQL Editor.
3. Provide the project URL + anon key (chat, or directly into `.env`).
4. Add the same two values to Vercel's project environment variables.
5. Sign up once through the new login screen (or pre-create the user in the
   dashboard) — this is the credential only the user ever enters.

## Suggested phasing

This is one coherent change (the DSA tool can't sync without the same
table/auth the rest of the app needs), but it's a wide surface area for one
pass. A natural split for the implementation plan:

1. Table + RLS + `supabaseClient.js` + auth gate + generic `getSynced`/
   `saveSynced` + `reconcileKey`, with tests. Nothing existing calls it yet.
2. Migrate the ~15 existing `store.js` exports onto it; wire the Realtime
   subscription into `App.jsx`.
3. DSA tool: copy into `public/dsa/`, replace its persistence shim, add the
   Code-tab link.
4. End-to-end verification (see Testing below), README/env doc updates.

## Testing

`reconcileKey`'s three branches (seed / cloud-wins / local-wins) and the
legacy-shape migration in `readLocal` are the data-loss-critical logic here
and get unit tests with a stubbed Supabase client — this is exactly the kind
of branching, money/security-adjacent (here: data-loss-adjacent) logic that
needs a runnable check per project convention, same as `computeLoanBalances`
and `parseYahooChart` earlier. End-to-end verification: sign in on two
browser profiles/tabs, edit on one, confirm the other updates without a
manual refresh; kill network, edit, restore network, confirm it catches up;
confirm a fresh sign-in with existing local data seeds the cloud rather than
overwriting local data with an empty cloud state.
