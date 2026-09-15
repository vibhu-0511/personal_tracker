# Cloud Sync (Supabase) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back every piece of data Forge stores (all `store.js` keys, plus the DSA mastery tool) to Supabase, so nothing is lost if local browser storage is wiped, and edits sync live across devices within a few seconds.

**Architecture:** IndexedDB (via `localforage`) stays the fast, offline-capable local read/write layer that every tab already uses unchanged. A thin sync layer underneath `store.js` debounce-pushes every save to a single Supabase table (`kv_store`, one row per data key, RLS-scoped to one signed-in user) and pulls + subscribes to Realtime changes, reconciling with **last-write-wins per key**. The DSA tool (a standalone static HTML file) gets the same treatment via its own small Supabase-JS snippet, riding the same table and the same browser session.

**Tech Stack:** Supabase (Postgres + Auth + Realtime), `@supabase/supabase-js` (npm, for the React app) and the Supabase JS UMD build via CDN (for the static DSA tool page). No other new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-15-cloud-sync-design.md`

## Global Constraints

- Conflict resolution is last-write-wins **per whole data key** (e.g. all of `habits`), never field-by-field merging.
- Single Supabase Auth user (the app owner); RLS on `kv_store` scopes every row to `auth.uid()`.
- Every existing `store.js` export keeps its exact name and signature — no tab file (`Today.jsx`, `Expenses.jsx`, `Life.jsx`, `Exams.jsx`, `Invest.jsx`) is modified for sync itself.
- Reads/writes never block on network; a failed push is caught and retried on the next reconciliation, never surfaced as an error to the user.
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (both safe to expose client-side; RLS is the real protection, not secrecy).

---

## Manual prerequisite (blocks Task 1)

The user runs this in the Supabase SQL Editor before Task 1 starts (from the spec):

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

The user also enables email/password auth (Authentication → Providers) and provides `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (Settings → API) before Task 1's env step.

---

### Task 1: Supabase client + env config

**Files:**
- Create: `src/supabaseClient.js`
- Modify: `package.json` (add `@supabase/supabase-js` dependency)
- Modify: `.env` (add the two vars — values supplied by the user, not committed)
- Modify: `.env.example`

**Interfaces:**
- Produces: `supabase` (the Supabase client instance), `getUserId(): string | null`, both imported by `store.js` (Task 3) and `App.jsx` (Task 4).

- [ ] **Step 1: Install the dependency**

Run: `cd forge && npm install @supabase/supabase-js`

- [ ] **Step 2: Create `src/supabaseClient.js`**

```js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

let currentUserId = null
supabase.auth.onAuthStateChange((_event, session) => {
  currentUserId = session?.user?.id ?? null
})

export function getUserId() {
  return currentUserId
}
```

- [ ] **Step 3: Add the env vars**

Append to `.env` (using the real URL/anon key the user provided):

```
VITE_SUPABASE_URL=<the user's project URL>
VITE_SUPABASE_ANON_KEY=<the user's anon key>
```

Append to `.env.example` (placeholders, this file is committed):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 4: Verify it loads without error**

Run: `cd forge && npm run build`
Expected: build succeeds (Vite inlines `import.meta.env.VITE_*` at build time; a missing value would still build, just fail at runtime on `createClient`, so also start `npm run dev` and check the browser console has no error from `supabaseClient.js`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/supabaseClient.js .env.example
git commit -m "feat: add Supabase client for cloud sync"
```

(`.env` itself is gitignored — do not add it.)

---

### Task 2: Sync reconciliation logic (pure, TDD)

**Files:**
- Create: `src/sync/logic.js`
- Test: `test/sync.test.js`

**Interfaces:**
- Consumes: nothing (pure functions, no I/O).
- Produces: `readLocalShape(raw): {data, updatedAt} | null`, `wrapForSave(data): {data, updatedAt}`, `decideSync(local, cloudRow): {action: 'push'|'pull'|'noop', value?}` — all three imported by `store.js` in Task 3.

- [ ] **Step 1: Write the failing tests**

Create `test/sync.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readLocalShape, wrapForSave, decideSync } from '../src/sync/logic.js'

test('readLocalShape: null stays null', () => {
  assert.equal(readLocalShape(null), null)
})

test('readLocalShape: legacy unwrapped value gets wrapped with updatedAt 0', () => {
  const legacy = [{ id: 1 }]
  assert.deepEqual(readLocalShape(legacy), { data: legacy, updatedAt: 0 })
})

test('readLocalShape: already-wrapped value passes through unchanged', () => {
  const wrapped = { data: { a: 1 }, updatedAt: 12345 }
  assert.deepEqual(readLocalShape(wrapped), wrapped)
})

test('wrapForSave stamps the current time', () => {
  const before = Date.now()
  const wrapped = wrapForSave({ x: 1 })
  assert.deepEqual(wrapped.data, { x: 1 })
  assert.ok(wrapped.updatedAt >= before)
})

test('decideSync: no cloud row, has local -> seed by pushing', () => {
  const local = { data: [1, 2], updatedAt: 100 }
  assert.deepEqual(decideSync(local, null), { action: 'push', value: local })
})

test('decideSync: no cloud row, no local -> noop', () => {
  assert.deepEqual(decideSync(null, null), { action: 'noop' })
})

test('decideSync: cloud newer than local -> pull', () => {
  const local = { data: 'old', updatedAt: 100 }
  const cloudRow = { value: 'new', updated_at: new Date(200).toISOString() }
  const result = decideSync(local, cloudRow)
  assert.equal(result.action, 'pull')
  assert.deepEqual(result.value, { data: 'new', updatedAt: 200 })
})

test('decideSync: local newer than cloud -> push', () => {
  const local = { data: 'new', updatedAt: 300 }
  const cloudRow = { value: 'old', updated_at: new Date(100).toISOString() }
  assert.deepEqual(decideSync(local, cloudRow), { action: 'push', value: local })
})

test('decideSync: no local but cloud has data -> pull', () => {
  const cloudRow = { value: 'cloud-data', updated_at: new Date(500).toISOString() }
  const result = decideSync(null, cloudRow)
  assert.equal(result.action, 'pull')
  assert.deepEqual(result.value, { data: 'cloud-data', updatedAt: 500 })
})

test('decideSync: equal timestamps -> noop', () => {
  const ts = 400
  const local = { data: 'x', updatedAt: ts }
  const cloudRow = { value: 'x', updated_at: new Date(ts).toISOString() }
  assert.deepEqual(decideSync(local, cloudRow), { action: 'noop' })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd forge && node --test test/sync.test.js`
Expected: FAIL — `src/sync/logic.js` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `src/sync/logic.js`:

```js
// Pure decision logic for local<->cloud reconciliation. No I/O here — see
// store.js for the side-effecting glue. Kept separate so the data-loss-
// critical branching can be unit tested without a network or localforage.

export function readLocalShape(raw) {
  if (raw == null) return null
  if (raw && typeof raw === 'object' && 'updatedAt' in raw && 'data' in raw) return raw
  return { data: raw, updatedAt: 0 } // legacy value written before sync existed
}

export function wrapForSave(data) {
  return { data, updatedAt: Date.now() }
}

// local: { data, updatedAt } | null — already passed through readLocalShape
// cloudRow: { value, updated_at: <ISO string> } | null
export function decideSync(local, cloudRow) {
  if (!cloudRow) {
    return local ? { action: 'push', value: local } : { action: 'noop' }
  }
  const cloudUpdatedAt = new Date(cloudRow.updated_at).getTime()
  if (!local || cloudUpdatedAt > local.updatedAt) {
    return { action: 'pull', value: { data: cloudRow.value, updatedAt: cloudUpdatedAt } }
  }
  if (local.updatedAt > cloudUpdatedAt) {
    return { action: 'push', value: local }
  }
  return { action: 'noop' }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd forge && node --test test/sync.test.js`
Expected: PASS — 10 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/sync/logic.js test/sync.test.js
git commit -m "feat: add pure sync reconciliation logic with tests"
```

---

### Task 3: Rewrite `store.js` to sync every key

**Files:**
- Modify: `src/store.js` (full rewrite)

**Interfaces:**
- Consumes: `supabase`, `getUserId` (Task 1), `readLocalShape`, `wrapForSave`, `decideSync` (Task 2).
- Produces: every existing export unchanged in name/signature (`getSettings`, `saveSettings`, `getNotes`, `saveNotes`, `getProgress`, `markProblem`, `getExpenses`, `saveExpenses`, `getBudgets`, `saveBudgets`, `getGoals`, `saveGoals`, `getExamProgress`, `saveExamProgress`, `getExamNotes`, `saveExamNotes`, `getInvestProgress`, `saveInvestProgress`, `getWatchlist`, `saveWatchlist`, `getTasks`, `saveTasks`, `getReminders`, `saveReminders`, `getHabits`, `saveHabits`, `getMoodLog`, `saveMoodLog`, `getLoans`, `saveLoans`, `storageAvailable`), plus two new exports for Task 4: `reconcileKey(key): Promise<void>`, `reconcileAll(): Promise<void>`, and `SYNCED_KEYS: string[]`.

- [ ] **Step 1: Replace the full file**

Replace all of `src/store.js` with:

```js
import localforage from 'localforage'
import { supabase, getUserId } from './supabaseClient.js'
import { readLocalShape, wrapForSave, decideSync } from './sync/logic.js'

const db = localforage.createInstance({ name: 'forge' })

export async function storageAvailable() {
  try {
    await db.setItem('__probe', 1)
    await db.removeItem('__probe')
    return true
  } catch {
    return false
  }
}

const pushTimers = {}

function schedulePush(key, wrapped, delay = 700) {
  clearTimeout(pushTimers[key])
  pushTimers[key] = setTimeout(() => {
    pushToCloud(key, wrapped).catch(() => {}) // offline/failed push: local write already succeeded, next reconcile retries
  }, delay)
}

async function pushToCloud(key, wrapped) {
  const userId = getUserId()
  if (!userId) return
  await supabase.from('kv_store').upsert({
    user_id: userId,
    key,
    value: wrapped.data,
    updated_at: new Date(wrapped.updatedAt).toISOString(),
  })
}

async function readLocal(key) {
  return readLocalShape(await db.getItem(key))
}

async function getSynced(key, fallback) {
  const local = await readLocal(key)
  return local ? local.data : fallback
}

async function saveSynced(key, data) {
  const wrapped = wrapForSave(data)
  await db.setItem(key, wrapped)
  schedulePush(key, wrapped)
}

export async function reconcileKey(key) {
  const local = await readLocal(key)
  const { data: row } = await supabase
    .from('kv_store')
    .select('value, updated_at')
    .eq('key', key)
    .maybeSingle()
  const decision = decideSync(local, row)
  if (decision.action === 'pull') await db.setItem(key, decision.value)
  else if (decision.action === 'push') await pushToCloud(key, decision.value)
}

export const SYNCED_KEYS = [
  'settings', 'notes', 'progress', 'expenses', 'budgets', 'goals',
  'examProgress', 'examNotes', 'investProgress', 'watchlist',
  'tasks', 'reminders', 'habits', 'moodLog', 'loans',
]

export async function reconcileAll() {
  for (const key of SYNCED_KEYS) await reconcileKey(key)
}

export async function getSettings() {
  return { cfHandle: 'step_bro', theme: 'ocean', ...(await getSynced('settings', {})) }
}
export async function saveSettings(settings) {
  await saveSynced('settings', settings)
}

export async function getNotes() {
  return await getSynced('notes', [])
}
export async function saveNotes(notes) {
  await saveSynced('notes', notes)
}

export async function getProgress() {
  return await getSynced('progress', {})
}
export async function markProblem(problemId, status, tags) {
  const progress = await getProgress()
  progress[problemId] = { status, tags, updatedAt: Date.now() }
  await saveSynced('progress', progress)
  return progress
}

export async function getExpenses() {
  return await getSynced('expenses', [])
}
export async function saveExpenses(expenses) {
  await saveSynced('expenses', expenses)
}

export async function getBudgets() {
  return await getSynced('budgets', {})
}
export async function saveBudgets(budgets) {
  await saveSynced('budgets', budgets)
}

export async function getGoals() {
  return await getSynced('goals', [])
}
export async function saveGoals(goals) {
  await saveSynced('goals', goals)
}

export async function getExamProgress() {
  return await getSynced('examProgress', {})
}
export async function saveExamProgress(progress) {
  await saveSynced('examProgress', progress)
}

export async function getExamNotes() {
  return await getSynced('examNotes', [])
}
export async function saveExamNotes(notes) {
  await saveSynced('examNotes', notes)
}

export async function getInvestProgress() {
  return await getSynced('investProgress', { done: {}, quiz: {}, tasks: {}, current: null })
}
export async function saveInvestProgress(progress) {
  await saveSynced('investProgress', progress)
}

export async function getWatchlist() {
  return await getSynced('watchlist', [])
}
export async function saveWatchlist(watchlist) {
  await saveSynced('watchlist', watchlist)
}

export async function getTasks() {
  return await getSynced('tasks', [])
}
export async function saveTasks(tasks) {
  await saveSynced('tasks', tasks)
}

export async function getReminders() {
  return await getSynced('reminders', [])
}
export async function saveReminders(reminders) {
  await saveSynced('reminders', reminders)
}

export async function getHabits() {
  return await getSynced('habits', [])
}
export async function saveHabits(habits) {
  await saveSynced('habits', habits)
}

export async function getMoodLog() {
  return await getSynced('moodLog', [])
}
export async function saveMoodLog(log) {
  await saveSynced('moodLog', log)
}

export async function getLoans() {
  return await getSynced('loans', [])
}
export async function saveLoans(loans) {
  await saveSynced('loans', loans)
}
```

- [ ] **Step 2: Run the full test suite**

Run: `cd forge && npm test`
Expected: PASS — all existing tests (`growth.test.js`, `loanBalance.test.js`, `parseYahooChart.test.js`, `sync.test.js`) still pass. `pickProblems.test.js`'s pre-existing failure (unrelated, documented in an earlier session) is expected to remain unchanged — do not fix it as part of this task.

- [ ] **Step 3: Build**

Run: `cd forge && npm run build`
Expected: succeeds, no import errors.

- [ ] **Step 4: Commit**

```bash
git add src/store.js
git commit -m "feat: sync every store.js key through the cloud sync layer"
```

---

### Task 4: Auth gate + Realtime wiring in `App.jsx`

**Files:**
- Modify: `src/App.jsx` (full rewrite)

**Interfaces:**
- Consumes: `supabase` (Task 1), `reconcileAll`, `reconcileKey`, `getSettings`, `saveSettings`, `storageAvailable` (Task 3).
- Produces: nothing new consumed elsewhere — this is the top-level component.

- [ ] **Step 1: Replace the full file**

Replace all of `src/App.jsx` with:

```jsx
import { useEffect, useState } from 'react'
import { getSettings, saveSettings, storageAvailable, reconcileAll, reconcileKey } from './store.js'
import { supabase } from './supabaseClient.js'
import Today from './tabs/Today.jsx'
import Puzzles from './tabs/Puzzles.jsx'
import Agents from './tabs/Agents.jsx'
import Expenses from './tabs/Expenses.jsx'
import Exams from './tabs/Exams.jsx'
import Invest from './tabs/Invest.jsx'
import Life from './tabs/Life.jsx'

const TABS = [
  { id: 'Life', icon: '🌱', label: 'Life' },
  { id: 'Today', icon: '⚡', label: 'Code' },
  { id: 'Puzzles', icon: '🧩', label: 'Puzzles' },
  { id: 'Exams', icon: '📝', label: 'Exams' },
  { id: 'Expenses', icon: '💰', label: 'Money' },
  { id: 'Invest', icon: '📈', label: 'Invest' },
  { id: 'Agents', icon: '🤖', label: 'Agents' },
]

const THEMES = [
  { id: 'ocean', label: 'Ocean', color: '#6ea8fe' },
  { id: 'forest', label: 'Forest', color: '#4ade80' },
  { id: 'sunset', label: 'Sunset', color: '#fb923c' },
  { id: 'grape', label: 'Grape', color: '#c084fc' },
  { id: 'rose', label: 'Rose', color: '#fb7185' },
]

// Which tab owns each synced data key, so a remote change only remounts
// (and re-fetches) the tab that actually shows that data. `settings` is
// handled directly below instead, since App.jsx already owns that state.
const KEY_TO_TAB = {
  progress: 'Today',
  expenses: 'Expenses', budgets: 'Expenses', goals: 'Expenses', loans: 'Expenses',
  examProgress: 'Exams', examNotes: 'Exams',
  investProgress: 'Invest', watchlist: 'Invest',
  tasks: 'Life', reminders: 'Life', habits: 'Life', moodLog: 'Life', notes: 'Life',
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = checking, null = signed out
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const [tab, setTab] = useState('Life')
  const [settings, setSettings] = useState({ cfHandle: '', theme: 'ocean' })
  const [draftHandle, setDraftHandle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [storageOk, setStorageOk] = useState(true)
  const [syncTicks, setSyncTicks] = useState({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    storageAvailable().then(setStorageOk)
  }, [])

  useEffect(() => {
    if (!session) return

    reconcileAll().then(() =>
      getSettings().then((s) => {
        setSettings(s)
        setDraftHandle(s.cfHandle)
        document.documentElement.dataset.accent = s.theme
        if (!s.cfHandle) setShowSettings(true)
      })
    )

    const channel = supabase
      .channel('kv_store_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kv_store', filter: `user_id=eq.${session.user.id}` },
        (payload) => {
          const key = payload.new?.key || payload.old?.key
          if (!key) return
          reconcileKey(key).then(() => {
            if (key === 'settings') {
              getSettings().then((s) => {
                setSettings(s)
                document.documentElement.dataset.accent = s.theme
              })
              return
            }
            const targetTab = KEY_TO_TAB[key]
            if (!targetTab) return
            setSyncTicks((prev) => ({ ...prev, [targetTab]: (prev[targetTab] || 0) + 1 }))
          })
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [session])

  async function save() {
    const handle = draftHandle.trim()
    const next = { ...settings, cfHandle: handle }
    await saveSettings(next)
    setSettings(next)
    setShowSettings(false)
  }

  async function setTheme(themeId) {
    const next = { ...settings, theme: themeId }
    setSettings(next)
    document.documentElement.dataset.accent = themeId
    await saveSettings(next)
  }

  async function handleAuth(mode) {
    setAuthError('')
    setAuthBusy(true)
    const fn = mode === 'signup' ? supabase.auth.signUp : supabase.auth.signInWithPassword
    const { error } = await fn({ email: authEmail.trim(), password: authPassword })
    setAuthBusy(false)
    if (error) setAuthError(error.message)
  }

  if (session === undefined) {
    return <div className="app" />
  }

  if (!session) {
    return (
      <div className="app">
        <header className="app-header">
          <span className="app-title">{'🔥'} Forge</span>
        </header>
        <div className="card settings-panel">
          <div className="h3" style={{ marginBottom: 10 }}>Sign in</div>
          <label className="meta" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            value={authEmail}
            onChange={(e) => setAuthEmail(e.target.value)}
            style={{ marginTop: 4, marginBottom: 10 }}
          />
          <label className="meta" htmlFor="auth-pw">Password</label>
          <input
            id="auth-pw"
            type="password"
            value={authPassword}
            onChange={(e) => setAuthPassword(e.target.value)}
            style={{ marginTop: 4 }}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth('signin')}
          />
          {authError && (
            <div className="meta" style={{ color: 'var(--danger)', marginTop: 8 }}>{authError}</div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" disabled={authBusy} onClick={() => handleAuth('signin')}>
              Sign in
            </button>
            <button className="btn btn-ghost btn-sm" disabled={authBusy} onClick={() => handleAuth('signup')}>
              Sign up
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-title">{'🔥'} Forge</span>
        <button
          className="gear-btn"
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Settings"
        >
          {'⚙️'}
        </button>
      </header>

      {!storageOk && (
        <div className="banner-warn">
          Storage unavailable — notes and progress won't persist in this browser.
        </div>
      )}

      {showSettings && (
        <div className="card settings-panel" style={{ marginBottom: 12 }}>
          <div className="h3" style={{ marginBottom: 10 }}>Settings</div>
          <label className="meta" htmlFor="cf">Codeforces handle</label>
          <input
            id="cf"
            value={draftHandle}
            onChange={(e) => setDraftHandle(e.target.value)}
            placeholder="your_cf_handle"
            style={{ marginTop: 4 }}
            onKeyDown={(e) => e.key === 'Enter' && save()}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(false)}>Cancel</button>
          </div>

          <div className="meta" style={{ marginTop: 14, marginBottom: 6 }}>Theme</div>
          <div className="theme-swatches">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-swatch${settings.theme === t.id ? ' active' : ''}`}
                style={{ background: t.color }}
                onClick={() => setTheme(t.id)}
                aria-label={t.label}
                title={t.label}
              />
            ))}
          </div>
        </div>
      )}

      <main className="content">
        {tab === 'Life' && <Life key={syncTicks.Life || 0} />}
        {tab === 'Today' && <Today key={syncTicks.Today || 0} cfHandle={settings.cfHandle} />}
        {tab === 'Puzzles' && <Puzzles />}
        {tab === 'Exams' && <Exams key={syncTicks.Exams || 0} />}
        {tab === 'Expenses' && <Expenses key={syncTicks.Expenses || 0} />}
        {tab === 'Invest' && <Invest key={syncTicks.Invest || 0} />}
        {tab === 'Agents' && <Agents />}
      </main>

      <nav className="tab-bar">
        <div className="tab-bar-inner">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab-btn${t.id === tab ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `cd forge && npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual smoke test — sign up**

Run: `cd forge && npm run dev`, open `http://localhost:5173`. Expected: a "Sign in" card, not the app shell. Enter a real email + a password, click "Sign up". Expected: Supabase sends/creates the account; if "Confirm email" is off in the dashboard, the app shell renders immediately after.

- [ ] **Step 4: Manual smoke test — data survives a reload**

Set a Codeforces handle in Settings, add one task in the Life tab. Reload the page. Expected: still signed in (session persisted), the handle and task are still there.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Supabase auth gate and realtime sync wiring"
```

---

### Task 5: DSA tool — copy and cloud-sync its persistence

**Files:**
- Create: `public/dsa/mastery-map.html` (copied from `../personal/logic_building/mastery_map_DSA_v11.html`)

**Interfaces:**
- Consumes: the same `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` values as the main app (hardcoded into this static file, since it's outside the Vite build and can't read `import.meta.env`).
- Produces: nothing consumed by other tasks — this file is only linked to from Task 6.

- [ ] **Step 1: Copy the file verbatim**

Run:
```bash
cd forge
mkdir -p public/dsa
cp "../personal/logic_building/mastery_map_DSA_v11.html" public/dsa/mastery-map.html
```

- [ ] **Step 2: Replace the persistence block**

In `public/dsa/mastery-map.html`, find the block starting at the comment
`/* ===== Mastery Map persistence sync (added — backs notes to mastery_data.json + git) ===== */`
(inside a `<script>` tag) and ending at that same `</script>` tag's closing
line, immediately before `</head>`. Replace that entire `<script>...</script>`
block (comment included) with:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
<script>
/* ===== Mastery Map cloud sync (Supabase) ===== */
(function () {
  var SUPABASE_URL = 'REPLACE_WITH_VITE_SUPABASE_URL';
  var SUPABASE_ANON_KEY = 'REPLACE_WITH_VITE_SUPABASE_ANON_KEY';
  var DATA_KEY = 'dsa_mastery_v1';
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var nativeSet = localStorage.setItem.bind(localStorage);
  var nativeRemove = localStorage.removeItem.bind(localStorage);
  var pill;

  function snapshot() {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      out[k] = localStorage.getItem(k);
    }
    return out;
  }

  function flash(ok) {
    if (!pill) return;
    pill.textContent = ok ? '✓ saved to cloud' : '⚠ save failed';
    pill.style.color = ok ? '#7CFFB2' : '#ff6b6b';
    pill.style.opacity = '1';
    clearTimeout(pill._t);
    pill._t = setTimeout(function () { pill.style.opacity = '0'; }, 1800);
  }

  var timer = null;
  function schedulePush(delay) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      sb.auth.getUser().then(function (r) {
        var uid = r.data && r.data.user && r.data.user.id;
        if (!uid) return;
        sb.from('kv_store').upsert({
          user_id: uid, key: DATA_KEY, value: snapshot(), updated_at: new Date().toISOString(),
        }).then(function (res) { flash(!res.error); });
      });
    }, delay == null ? 700 : delay);
  }

  // On sign-in (session is shared with the main Forge app via localStorage,
  // same origin — no separate login here), pull the cloud snapshot once.
  sb.auth.onAuthStateChange(function (event, session) {
    if (!session) return;
    sb.from('kv_store').select('value').eq('key', DATA_KEY).maybeSingle().then(function (res) {
      var cloud = res.data && res.data.value;
      if (cloud && Object.keys(cloud).length) {
        for (var k in cloud) if (Object.prototype.hasOwnProperty.call(cloud, k)) nativeSet(k, cloud[k]);
        location.reload(); // app already read localStorage at parse time
      } else {
        schedulePush(0); // nothing in the cloud yet for this account — seed it
      }
    });
  });

  localStorage.setItem = function (key, val) { nativeSet(key, val); schedulePush(); };
  localStorage.removeItem = function (key) { nativeRemove(key); schedulePush(); };

  document.addEventListener('DOMContentLoaded', function () {
    pill = document.createElement('div');
    pill.style.cssText = 'position:fixed;bottom:12px;right:14px;z-index:99999;font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:6px 10px;border-radius:8px;background:#121214;border:1px solid #2a2a2e;opacity:0;transition:opacity .3s;pointer-events:none';
    document.body.appendChild(pill);
  });

  window.__masterySync = { snapshot: snapshot, saveNow: function () { schedulePush(0); } };
})();
</script>
```

Note: this drops the original's `beforeunload`/`sendBeacon` flush — `sendBeacon` can't attach the `Authorization` header Supabase's REST API requires, so it would silently fail against Supabase (it worked against the original's own unauthenticated local server, which had no such requirement). The 700ms debounce on every edit is the actual save path; losing only edits made in the last 700ms before a tab close is an accepted, minor gap, not a broken feature.

- [ ] **Step 2b: Fill in the real values**

Replace `REPLACE_WITH_VITE_SUPABASE_URL` and `REPLACE_WITH_VITE_SUPABASE_ANON_KEY` in the pasted block with the literal values from `forge/.env`.

- [ ] **Step 3: Verify it's valid HTML**

Run: `cd forge && npm run build` (this copies `public/` verbatim into `dist/`; the file itself isn't parsed by Vite, so also open `dist/dsa/mastery-map.html` directly in a browser and confirm the page renders — the existing DSA content, tabs, and layers should look identical to the original file).

- [ ] **Step 4: Commit**

```bash
git add public/dsa/mastery-map.html
git commit -m "feat: add DSA mastery map tool with cloud-synced persistence"
```

---

### Task 6: Link to it from the Code tab

**Files:**
- Modify: `src/tabs/Today.jsx:126` (insert after the stats-row's closing `</div>`, before the `{/* Filter toggle */}` comment)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Insert the link**

In `src/tabs/Today.jsx`, immediately after the stats row's closing `</div>` (the block ending the three `stat-card`s) and before `{/* Filter toggle */}`, insert:

```jsx
      {/* DSA Mastery Map link */}
      <a
        href="/dsa/mastery-map.html"
        className="btn btn-sm"
        style={{ width: '100%', marginBottom: 12, textAlign: 'center', display: 'block' }}
      >
        📘 DSA Mastery Map
      </a>

```

- [ ] **Step 2: Build**

Run: `cd forge && npm run build`
Expected: succeeds.

- [ ] **Step 3: Manual smoke test**

Run: `cd forge && npm run dev`, open the Code tab. Expected: the new link renders above "Filter Problems". Click it; expected: navigates to `/dsa/mastery-map.html` as a full page (not inside the Forge shell), the DSA tool loads.

- [ ] **Step 4: Commit**

```bash
git add src/tabs/Today.jsx
git commit -m "feat: link the DSA mastery map from the Code tab"
```

---

### Task 7: Docs

**Files:**
- Modify: `README.md`
- (`.env.example` already updated in Task 1)

**Interfaces:** none.

- [ ] **Step 1: Update the Environment table**

In `README.md`, replace:

```
## Environment

| Variable | Required | Default |
|---|---|---|
| `GROQ_API_KEY` | yes | — |
| `GROQ_MODEL` | no | `llama-3.3-70b-versatile` |
```

with:

```
## Environment

| Variable | Required | Default |
|---|---|---|
| `GROQ_API_KEY` | yes | — |
| `GROQ_MODEL` | no | `llama-3.3-70b-versatile` |
| `VITE_SUPABASE_URL` | yes | — |
| `VITE_SUPABASE_ANON_KEY` | yes | — |

Cloud sync uses a Supabase project. See
`docs/superpowers/specs/2026-09-15-cloud-sync-design.md` for the schema and
the SQL to run once in the Supabase SQL Editor.
```

- [ ] **Step 2: Update the Layout section**

Replace:

```
- `src/store.js` — IndexedDB wrappers. All user data is local to the browser.
```

with:

```
- `src/store.js` — IndexedDB wrappers, synced to Supabase (`src/supabaseClient.js`,
  `src/sync/logic.js`). Local-first: reads/writes never block on network.
- `public/dsa/` — the DSA mastery map tool, synced via its own small script (same
  Supabase project, same signed-in session).
```

- [ ] **Step 3: Update the Deploy section**

Replace:

```
Set `GROQ_API_KEY` in the Vercel project's environment variables. Then open the
deployed URL on your iPhone and use Share → Add to Home Screen.
```

with:

```
Set `GROQ_API_KEY`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` in the
Vercel project's environment variables. Then open the deployed URL on your
iPhone and use Share → Add to Home Screen.
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document cloud sync env vars and layout"
```

---

### Task 8: End-to-end verification

**Files:** none (manual verification only).

- [ ] **Step 1: Two-tab live sync**

Open the deployed (or `npm run dev`) app in two different browser profiles (or one normal + one private/incognito window), sign in as the same user in both. In tab A, add an expense. Expected: within a few seconds, tab B's Expenses tab shows it without a manual reload (the `postgres_changes` subscription fires → `reconcileKey('expenses')` → `syncTicks.Expenses` bumps → `Expenses` remounts and refetches).

- [ ] **Step 2: Offline edit, then reconnect**

In one tab, disconnect network (DevTools → Network → Offline), add a task. Expected: it appears locally immediately (no visible error). Reconnect network, wait a few seconds or reload. Expected: the task is now in the `kv_store` row for `tasks` (check via the Supabase Table Editor) and appears on a second device/session.

- [ ] **Step 3: First-login seeding doesn't lose data**

Using a browser profile that already has real local Forge data from *before* this feature (e.g. this machine's existing dev profile), sign in for the first time. Expected: the existing local habits/expenses/etc. are still present after sign-in (pushed up as the seed), not replaced by an empty cloud state.

- [ ] **Step 4: DSA tool syncs too**

Open `/dsa/mastery-map.html`, mark a problem/module as done. Reload. Expected: still marked. Open it in a second signed-in session. Expected: the same mark appears there too (after its `onAuthStateChange` pull-and-reload).

- [ ] **Step 5: Run the full test suite one last time**

Run: `cd forge && npm test`
Expected: all tests pass except the pre-existing, unrelated `pickProblems.test.js` failure.
