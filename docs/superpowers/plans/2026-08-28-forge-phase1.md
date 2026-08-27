# Forge Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal daily-practice web app — adaptive Codeforces problems, the Lichess daily puzzle, local notes, and LLM tutor agents — deployable to a free URL and usable from an iPhone.

**Architecture:** A Vite + React single-page app talks to four serverless functions in `/api` that proxy Codeforces, Lichess, and Groq. The proxy exists because browsers cannot call the Codeforces API directly (CORS) and the LLM key must never ship in client code. All user data (settings, notes, progress) stays in the browser via IndexedDB. The same `/api` handler files are mounted into the Vite dev server by a small plugin, so one `npm run dev` runs everything.

**Tech Stack:** Vite, React 18, localForage, Node 18+ built-in `fetch` and `node --test`. Runtime dependencies are exactly three: `react`, `react-dom`, `localforage`.

**Spec:** `docs/superpowers/specs/2026-08-28-forge-phase1-design.md`

## Global Constraints

- Project root is `C:\Users\vibha\Downloads\data\forge` — a git repo that already exists and already contains `docs/`.
- Node 18 or newer is required (global `fetch`, `node --test`).
- Runtime dependencies limited to `react`, `react-dom`, `localforage`. Dev dependencies limited to `vite`, `@vitejs/plugin-react`. **Do not add any other package for any reason.**
- `package.json` must contain `"type": "module"`. All files use ESM `import`/`export`.
- Secrets live only in `.env` (git-ignored) and are read via `process.env` inside `/api` handlers. **Never reference a secret in `src/`** — that code ships to the browser.
- Default LLM model is `llama-3.3-70b-versatile`, overridable via the `GROQ_MODEL` env var.
- Every API handler is `export default function handler(req, res)` and replies with `res.status(code).json(obj)`.
- No routing library. Tabs are React state.
- No chess board rendering. The daily puzzle links out to Lichess.
- Commit after every task using the exact message given in that task's final step.

---

### Task 1: Scaffold the project and prove the dev server runs the API

This task sets up everything and proves the riskiest piece — that `/api` handlers run inside the Vite dev server — using a trivial health route.

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `.env`, `index.html`, `vite.config.js`, `src/main.jsx`, `src/App.jsx`, `src/styles.css`, `api/health.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run dev`; the convention that any `api/<name>.js` exporting a default `(req, res)` handler is reachable at `/api/<name>` in both dev and production.

- [ ] **Step 1: Configure git identity for this repo**

Without this, every commit step in this plan fails with "Author identity unknown".

```bash
cd "C:/Users/vibha/Downloads/data/forge"
git config user.name "Vibhanshu"
git config user.email "vibhanshu.0511@gmail.com"
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "forge",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test test/"
  },
  "dependencies": {
    "localforage": "^1.10.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules
dist
.env
.vercel
```

- [ ] **Step 4: Create `.env.example`**

```
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
```

- [ ] **Step 5: Create `.env` with a placeholder**

The real key gets pasted in during Task 5. This file is git-ignored.

```
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
```

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <title>Forge</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `vite.config.js`**

The `apiDevPlugin` mounts `/api/*.js` handlers on the dev server and shims the two
helpers Vercel provides in production (`req.query`, `res.status().json()`) plus JSON
body parsing, so the same handler files work in dev and in production unchanged.

```js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function apiDevPlugin() {
  return {
    name: 'forge-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url.startsWith('/api/')) return next()

        const url = new URL(req.url, 'http://localhost')
        const name = url.pathname.slice('/api/'.length)

        req.query = Object.fromEntries(url.searchParams)
        res.status = (code) => {
          res.statusCode = code
          return res
        }
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }

        try {
          if (req.method === 'POST') {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            req.body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}
          }
          const mod = await server.ssrLoadModule(`/api/${name}.js`)
          await mod.default(req, res)
        } catch (err) {
          res.status(500).json({ error: String((err && err.message) || err) })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), apiDevPlugin()] }
})
```

- [ ] **Step 8: Create `api/health.js`**

```js
export default function handler(req, res) {
  res.status(200).json({ ok: true })
}
```

- [ ] **Step 9: Create `src/styles.css`**

```css
:root {
  --bg: #0f1115;
  --panel: #171a21;
  --border: #262b36;
  --text: #e6e8ee;
  --muted: #9aa3b2;
  --accent: #5b9dff;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  padding-bottom: env(safe-area-inset-bottom);
}
.wrap { max-width: 720px; margin: 0 auto; padding: 16px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tabs button {
  flex: 1; padding: 10px; border-radius: 10px; cursor: pointer;
  background: var(--panel); color: var(--muted);
  border: 1px solid var(--border); font-size: 15px;
}
.tabs button.active { color: var(--text); border-color: var(--accent); }
.card {
  background: var(--panel); border: 1px solid var(--border);
  border-radius: 12px; padding: 14px; margin-bottom: 12px;
}
.muted { color: var(--muted); font-size: 14px; }
.err { color: #ff8b8b; font-size: 14px; }
a { color: var(--accent); }
button.act {
  padding: 8px 12px; border-radius: 8px; cursor: pointer;
  background: transparent; color: var(--text); border: 1px solid var(--border);
}
input, textarea, select {
  width: 100%; padding: 10px; border-radius: 8px; font: inherit;
  background: #0c0e13; color: var(--text); border: 1px solid var(--border);
}
```

- [ ] **Step 10: Create `src/App.jsx` (temporary shell — replaced in Task 7)**

```jsx
import { useEffect, useState } from 'react'

export default function App() {
  const [health, setHealth] = useState('checking...')
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((j) => setHealth(JSON.stringify(j)))
      .catch((e) => setHealth('ERROR: ' + e.message))
  }, [])
  return (
    <div className="wrap">
      <h1>Forge</h1>
      <div className="card">api/health: {health}</div>
    </div>
  )
}
```

- [ ] **Step 11: Create `src/main.jsx`**

```jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 12: Install dependencies**

```bash
npm install
```

Expected: completes with no errors, creates `node_modules` and `package-lock.json`.

- [ ] **Step 13: Verify the dev server and API both work**

Start the server in one terminal:

```bash
npm run dev
```

In a second terminal, verify the API route:

```bash
curl http://localhost:5173/api/health
```

Expected output: `{"ok":true}`

Also open `http://localhost:5173` in a browser. Expected: the page shows
`api/health: {"ok":true}`. If it shows `checking...` forever or an ERROR, the
`apiDevPlugin` is misconfigured — re-check `vite.config.js` before continuing.
Stop the dev server when done.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React app with dev-mounted API handlers"
```

---

### Task 2: `pickProblems` — the adaptive selection logic

The one piece of real logic in the app, built test-first because everything on the Today tab depends on it being right.

**Files:**
- Create: `api/_lib/pickProblems.js`, `test/pickProblems.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `pickProblems(problems, rating, solvedIds, limit = 20)` → filtered array.
  - `problems`: array of `{ contestId: number, index: string, name: string, rating?: number, tags: string[] }`
  - `rating`: number, or `null`/`undefined` for an unrated user
  - `solvedIds`: a `Set` of strings shaped `` `${contestId}${index}` ``
  - Returns problems within ±200 of rating, excluding solved, sorted by rating ascending, capped at `limit`.

- [ ] **Step 1: Write the failing tests**

Create `test/pickProblems.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickProblems } from '../api/_lib/pickProblems.js'

const p = (contestId, index, rating, tags = []) => ({
  contestId, index, rating, tags, name: `P${contestId}${index}`,
})

test('keeps only problems within +/-200 of rating', () => {
  const problems = [p(1, 'A', 1000), p(2, 'B', 1400), p(3, 'C', 1600), p(4, 'D', 1900)]
  const out = pickProblems(problems, 1500, new Set())
  assert.deepEqual(out.map((x) => x.rating), [1400, 1600])
})

test('excludes already-solved problems', () => {
  const problems = [p(1, 'A', 1500), p(2, 'B', 1500)]
  const out = pickProblems(problems, 1500, new Set(['1A']))
  assert.equal(out.length, 1)
  assert.equal(out[0].contestId, 2)
})

test('drops problems with no rating', () => {
  const problems = [p(1, 'A', undefined), p(2, 'B', 1500)]
  const out = pickProblems(problems, 1500, new Set())
  assert.equal(out.length, 1)
  assert.equal(out[0].rating, 1500)
})

test('unrated user falls back to a band centered on 1200', () => {
  const problems = [p(1, 'A', 1100), p(2, 'B', 1800)]
  const out = pickProblems(problems, null, new Set())
  assert.deepEqual(out.map((x) => x.rating), [1100])
})

test('sorts ascending by rating and respects the limit', () => {
  const problems = [p(1, 'A', 1600), p(2, 'B', 1400), p(3, 'C', 1500)]
  const out = pickProblems(problems, 1500, new Set(), 2)
  assert.deepEqual(out.map((x) => x.rating), [1400, 1500])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test
```

Expected: FAIL — cannot find module `../api/_lib/pickProblems.js`.

- [ ] **Step 3: Write the implementation**

Create `api/_lib/pickProblems.js`:

```js
const BAND = 200
const DEFAULT_RATING = 1200

export function pickProblems(problems, rating, solvedIds, limit = 20) {
  const center = typeof rating === 'number' ? rating : DEFAULT_RATING
  return problems
    .filter((p) => typeof p.rating === 'number')
    .filter((p) => p.rating >= center - BAND && p.rating <= center + BAND)
    .filter((p) => !solvedIds.has(`${p.contestId}${p.index}`))
    .sort((a, b) => a.rating - b.rating)
    .slice(0, limit)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
```

Expected: PASS — 5 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add pickProblems adaptive selection with tests"
```

---

### Task 3: `/api/cf` — Codeforces proxy

Joins three Codeforces endpoints server-side and returns a small payload. This must happen
on the server: the raw problemset is several megabytes and a user's submission history can
be thousands of entries.

**Files:**
- Create: `api/cf.js`

**Interfaces:**
- Consumes: `pickProblems` from `api/_lib/pickProblems.js` (Task 2).
- Produces: `GET /api/cf?handle=<handle>` → `200 { rating, problems, tagCounts }` where
  `problems` is `[{ id, name, rating, tags, url }]` and `tagCounts` is
  `{ [tag: string]: number }` counted over solved problems.
  Errors: `400 { error }` if handle missing, `502 { error }` on upstream failure.

- [ ] **Step 1: Write the handler**

Create `api/cf.js`:

```js
import { pickProblems } from './_lib/pickProblems.js'

async function cfGet(path) {
  const r = await fetch(`https://codeforces.com/api/${path}`)
  const j = await r.json()
  if (j.status !== 'OK') throw new Error(j.comment || `Codeforces error on ${path}`)
  return j.result
}

// Cached per warm serverless instance; the problemset changes rarely.
let problemsCache = null

export default async function handler(req, res) {
  const handle = (req.query.handle || '').trim()
  if (!handle) return res.status(400).json({ error: 'handle required' })

  const h = encodeURIComponent(handle)
  try {
    if (!problemsCache) {
      problemsCache = (await cfGet('problemset.problems')).problems
    }
    const [info] = await cfGet(`user.info?handles=${h}`)
    const subs = await cfGet(`user.status?handle=${h}&from=1&count=10000`)

    const solvedIds = new Set()
    const tagCounts = {}
    for (const s of subs) {
      if (s.verdict !== 'OK' || !s.problem) continue
      const id = `${s.problem.contestId}${s.problem.index}`
      if (solvedIds.has(id)) continue
      solvedIds.add(id)
      for (const t of s.problem.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1
    }

    const problems = pickProblems(problemsCache, info.rating, solvedIds).map((p) => ({
      id: `${p.contestId}${p.index}`,
      name: p.name,
      rating: p.rating,
      tags: p.tags || [],
      url: `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`,
    }))

    res.status(200).json({ rating: info.rating ?? null, problems, tagCounts })
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
```

- [ ] **Step 2: Verify against a real handle**

Start the dev server (`npm run dev`), then in a second terminal:

```bash
curl "http://localhost:5173/api/cf?handle=tourist"
```

Expected: JSON containing a numeric `rating`, a `problems` array of up to 20 entries each
with `id`/`name`/`rating`/`tags`/`url`, and a non-empty `tagCounts` object.

- [ ] **Step 3: Verify the missing-handle error**

```bash
curl -i "http://localhost:5173/api/cf"
```

Expected: HTTP 400 and body `{"error":"handle required"}`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add /api/cf Codeforces proxy with server-side filtering"
```

---

### Task 4: `/api/puzzle` — Lichess daily puzzle

**Files:**
- Create: `api/puzzle.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `GET /api/puzzle` → `200 { id, rating, themes, url }`. Errors: `502 { error }`.

- [ ] **Step 1: Write the handler**

Create `api/puzzle.js`:

```js
export default async function handler(req, res) {
  try {
    const r = await fetch('https://lichess.org/api/puzzle/daily')
    if (!r.ok) throw new Error(`Lichess responded ${r.status}`)
    const { puzzle } = await r.json()
    res.status(200).json({
      id: puzzle.id,
      rating: puzzle.rating,
      themes: puzzle.themes || [],
      url: `https://lichess.org/training/${puzzle.id}`,
    })
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
```

- [ ] **Step 2: Verify**

With the dev server running:

```bash
curl http://localhost:5173/api/puzzle
```

Expected: JSON with a string `id`, a numeric `rating`, a `themes` array, and a
`url` of the form `https://lichess.org/training/<id>`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add /api/puzzle Lichess daily puzzle proxy"
```

---

### Task 5: `/api/agent` — Groq LLM proxy

**Files:**
- Create: `api/agent.js`
- Modify: `.env` (paste the real API key)

**Interfaces:**
- Consumes: `process.env.GROQ_API_KEY`, optional `process.env.GROQ_MODEL`.
- Produces: `POST /api/agent` with body `{ systemPrompt: string, messages: [{role, content}] }`
  → `200 { reply: string }`. Errors: `500 { error }` if the key is missing,
  `400 { error }` on a malformed body, `502 { error }` on upstream failure.

- [ ] **Step 1: Write the handler**

Create `api/agent.js`:

```js
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'llama-3.3-70b-versatile'

export default async function handler(req, res) {
  const key = process.env.GROQ_API_KEY
  if (!key) {
    return res.status(500).json({ error: 'agent not configured: GROQ_API_KEY is missing' })
  }

  const { systemPrompt, messages } = req.body || {}
  if (typeof systemPrompt !== 'string' || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'systemPrompt (string) and messages (array) are required' })
  }

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    })
    const j = await r.json()
    if (!r.ok) throw new Error(j?.error?.message || `Groq responded ${r.status}`)
    res.status(200).json({ reply: j.choices[0].message.content })
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) })
  }
}
```

- [ ] **Step 2: Verify the missing-key path first**

With `GROQ_API_KEY=` still empty in `.env`, restart the dev server and run:

```bash
curl -i -X POST http://localhost:5173/api/agent -H "Content-Type: application/json" -d "{\"systemPrompt\":\"hi\",\"messages\":[]}"
```

Expected: HTTP 500 with `{"error":"agent not configured: GROQ_API_KEY is missing"}`.

- [ ] **Step 3: Add the real key**

Sign up free at `https://console.groq.com` (no credit card), create an API key, and paste
it into `.env` as the value of `GROQ_API_KEY`. Then restart the dev server — Vite reads
`.env` at startup only.

**If the user has not supplied a key, stop here and ask for it.** Do not invent a key
and do not skip the verification in Step 4.

- [ ] **Step 4: Verify a real completion**

```bash
curl -X POST http://localhost:5173/api/agent -H "Content-Type: application/json" -d "{\"systemPrompt\":\"You are terse.\",\"messages\":[{\"role\":\"user\",\"content\":\"Say the single word: pong\"}]}"
```

Expected: `{"reply":"pong"}` or similar short text. If the response is a 502 mentioning
a decommissioned or unknown model, list valid models with the command below and set
`GROQ_MODEL` in `.env` to one of them:

```bash
curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"
```

- [ ] **Step 5: Confirm the key is not committed**

```bash
git status --short
```

Expected: `.env` does **not** appear (it is git-ignored). If it appears, fix `.gitignore`
before committing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add /api/agent Groq proxy"
```

---

### Task 6: Local storage layer

**Files:**
- Create: `src/store.js`

**Interfaces:**
- Consumes: `localforage`.
- Produces, all async:
  - `getSettings()` → `{ cfHandle: string }` (defaults to `{ cfHandle: '' }`)
  - `saveSettings(settings)` → void
  - `getNotes()` → `[{ id, createdAt, body, tags }]` (defaults to `[]`)
  - `saveNotes(notes)` → void
  - `getProgress()` → `{ [problemId]: { status, tags, updatedAt } }` (defaults to `{}`)
  - `markProblem(problemId, status, tags)` → the updated progress object
  - `storageAvailable()` → `boolean`

- [ ] **Step 1: Write the store**

Create `src/store.js`:

```js
import localforage from 'localforage'

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

export async function getSettings() {
  return (await db.getItem('settings')) || { cfHandle: '' }
}
export async function saveSettings(settings) {
  await db.setItem('settings', settings)
}

export async function getNotes() {
  return (await db.getItem('notes')) || []
}
export async function saveNotes(notes) {
  await db.setItem('notes', notes)
}

export async function getProgress() {
  return (await db.getItem('progress')) || {}
}
export async function markProblem(problemId, status, tags) {
  const progress = await getProgress()
  progress[problemId] = { status, tags, updatedAt: Date.now() }
  await db.setItem('progress', progress)
  return progress
}
```

- [ ] **Step 2: Verify in the browser console**

With the dev server running, open `http://localhost:5173`, open the browser devtools
console, and run:

```js
const s = await import('/src/store.js')
await s.saveSettings({ cfHandle: 'test' })
console.log(await s.getSettings())
await s.markProblem('1A', 'solved', ['dp'])
console.log(await s.getProgress())
```

Expected: logs `{cfHandle: 'test'}` then `{'1A': {status: 'solved', tags: ['dp'], updatedAt: <number>}}`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add IndexedDB store for settings, notes, and progress"
```

---

### Task 7: App shell with tabs and settings

Replaces the temporary shell from Task 1 with the real three-tab layout. The tab
components do not exist yet, so this task creates minimal placeholder versions that
Tasks 8–10 fill in.

**Files:**
- Modify: `src/App.jsx` (full replacement)
- Create: `src/tabs/Today.jsx`, `src/tabs/Notes.jsx`, `src/tabs/Agents.jsx`

**Interfaces:**
- Consumes: `getSettings`, `saveSettings`, `storageAvailable` from `src/store.js` (Task 6).
- Produces: `App` renders tabs and passes `cfHandle` (string) as a prop to `Today`.
  Each tab is a default-exported React component.

- [ ] **Step 1: Create the three placeholder tab components**

`src/tabs/Today.jsx`:

```jsx
export default function Today({ cfHandle }) {
  return <div className="card">Today — handle: {cfHandle || '(none)'}</div>
}
```

`src/tabs/Notes.jsx`:

```jsx
export default function Notes() {
  return <div className="card">Notes</div>
}
```

`src/tabs/Agents.jsx`:

```jsx
export default function Agents() {
  return <div className="card">Agents</div>
}
```

- [ ] **Step 2: Replace `src/App.jsx` entirely**

```jsx
import { useEffect, useState } from 'react'
import { getSettings, saveSettings, storageAvailable } from './store.js'
import Today from './tabs/Today.jsx'
import Notes from './tabs/Notes.jsx'
import Agents from './tabs/Agents.jsx'

const TABS = ['Today', 'Notes', 'Agents']

export default function App() {
  const [tab, setTab] = useState('Today')
  const [cfHandle, setCfHandle] = useState('')
  const [draftHandle, setDraftHandle] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [storageOk, setStorageOk] = useState(true)

  useEffect(() => {
    storageAvailable().then(setStorageOk)
    getSettings().then((s) => {
      setCfHandle(s.cfHandle)
      setDraftHandle(s.cfHandle)
      if (!s.cfHandle) setShowSettings(true)
    })
  }, [])

  async function save() {
    const handle = draftHandle.trim()
    await saveSettings({ cfHandle: handle })
    setCfHandle(handle)
    setShowSettings(false)
  }

  return (
    <div className="wrap">
      <h1 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Forge
        <button className="act" onClick={() => setShowSettings((v) => !v)}>
          Settings
        </button>
      </h1>

      {!storageOk && (
        <div className="card err">
          Storage is unavailable — notes and progress will not persist in this browser.
        </div>
      )}

      {showSettings && (
        <div className="card">
          <label className="muted" htmlFor="cf">Codeforces handle</label>
          <input
            id="cf"
            value={draftHandle}
            onChange={(e) => setDraftHandle(e.target.value)}
            placeholder="your_cf_handle"
          />
          <button className="act" style={{ marginTop: 10 }} onClick={save}>
            Save
          </button>
        </div>
      )}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Today' && <Today cfHandle={cfHandle} />}
      {tab === 'Notes' && <Notes />}
      {tab === 'Agents' && <Agents />}
    </div>
  )
}
```

- [ ] **Step 3: Verify**

With the dev server running, open `http://localhost:5173`. Expected:
- The settings panel is open automatically because no handle is saved yet.
- Typing a handle and clicking Save closes the panel; the Today tab shows that handle.
- Clicking Notes and Agents switches panels and the active tab is outlined.
- Reloading the page keeps the saved handle.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add app shell with tabs and Codeforces handle setting"
```

---

### Task 8: Today tab

**Files:**
- Modify: `src/tabs/Today.jsx` (full replacement)

**Interfaces:**
- Consumes: `GET /api/cf?handle=` (Task 3), `GET /api/puzzle` (Task 4),
  `getProgress`/`markProblem` from `src/store.js` (Task 6), `cfHandle` prop from `App` (Task 7).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace `src/tabs/Today.jsx` entirely**

```jsx
import { useEffect, useState } from 'react'
import { getProgress, markProblem } from '../store.js'

const CORE_TAGS = [
  'dp', 'graphs', 'greedy', 'math', 'data structures',
  'binary search', 'strings', 'trees', 'dfs and similar', 'sortings',
]

function leastPracticedTag(tagCounts) {
  const ranked = CORE_TAGS
    .map((t) => [t, tagCounts[t] || 0])
    .sort((a, b) => a[1] - b[1])
  return ranked[0]
}

function solvedToday(progress) {
  const start = new Date().setHours(0, 0, 0, 0)
  return Object.values(progress).filter(
    (p) => p.status === 'solved' && p.updatedAt >= start
  ).length
}

export default function Today({ cfHandle }) {
  const [cf, setCf] = useState(null)
  const [cfError, setCfError] = useState('')
  const [puzzle, setPuzzle] = useState(null)
  const [puzzleError, setPuzzleError] = useState('')
  const [progress, setProgress] = useState({})

  useEffect(() => {
    getProgress().then(setProgress)
    fetch('/api/puzzle')
      .then((r) => r.json())
      .then((j) => (j.error ? setPuzzleError(j.error) : setPuzzle(j)))
      .catch((e) => setPuzzleError(e.message))
  }, [])

  useEffect(() => {
    if (!cfHandle) return
    setCf(null)
    setCfError('')
    fetch(`/api/cf?handle=${encodeURIComponent(cfHandle)}`)
      .then((r) => r.json())
      .then((j) => (j.error ? setCfError(j.error) : setCf(j)))
      .catch((e) => setCfError(e.message))
  }, [cfHandle])

  async function mark(problem, status) {
    setProgress(await markProblem(problem.id, status, problem.tags))
  }

  const weak = cf ? leastPracticedTag(cf.tagCounts) : null

  return (
    <div>
      <div className="card">
        <strong>Solved today: {solvedToday(progress)}</strong>
        {cf && (
          <div className="muted">
            Rating {cf.rating ?? 'unrated'} · least-practiced: {weak[0]} ({weak[1]} solved)
          </div>
        )}
      </div>

      <div className="card">
        <strong>Daily puzzle</strong>
        {puzzleError && <div className="err">Could not load puzzle: {puzzleError}</div>}
        {!puzzle && !puzzleError && <div className="muted">Loading…</div>}
        {puzzle && (
          <div>
            <div className="muted">
              Rating {puzzle.rating} · {puzzle.themes.slice(0, 3).join(', ')}
            </div>
            <a href={puzzle.url} target="_blank" rel="noreferrer">
              Solve on Lichess →
            </a>
          </div>
        )}
      </div>

      <strong>Problems for you</strong>
      {!cfHandle && (
        <div className="card muted">Set your Codeforces handle in Settings to see problems.</div>
      )}
      {cfError && <div className="card err">Could not load problems: {cfError}</div>}
      {cfHandle && !cf && !cfError && <div className="card muted">Loading…</div>}
      {cf &&
        cf.problems.map((p) => {
          const state = progress[p.id]
          return (
            <div className="card" key={p.id}>
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.name}
              </a>
              <div className="muted">
                {p.rating} · {p.tags.slice(0, 3).join(', ')}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="act" onClick={() => mark(p, 'solved')}>Solved</button>
                <button className="act" onClick={() => mark(p, 'skipped')}>Skip</button>
                {state && <span className="muted">{state.status}</span>}
              </div>
            </div>
          )
        })}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

With the dev server running and a real Codeforces handle saved in Settings, open the
Today tab. Expected:
- The daily puzzle card shows a rating, themes, and a working Lichess link.
- A list of problems appears, each with a rating near your own and a working link.
- Clicking "Solved" increments "Solved today" and shows `solved` next to the problem.
- Reloading the page preserves the solved marks.
- Clearing the handle in Settings shows the "Set your Codeforces handle" prompt instead
  of an error, and the puzzle card still works.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Today tab with adaptive problems, daily puzzle, and progress"
```

---

### Task 9: Notes tab

**Files:**
- Modify: `src/tabs/Notes.jsx` (full replacement)

**Interfaces:**
- Consumes: `getNotes`, `saveNotes` from `src/store.js` (Task 6).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace `src/tabs/Notes.jsx` entirely**

```jsx
import { useEffect, useState } from 'react'
import { getNotes, saveNotes } from '../store.js'

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    getNotes().then(setNotes)
  }, [])

  async function persist(next) {
    setNotes(next)
    await saveNotes(next)
  }

  async function add() {
    const text = body.trim()
    if (!text) return
    const note = {
      id: String(Date.now()),
      createdAt: Date.now(),
      body: text,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    }
    await persist([note, ...notes])
    setBody('')
    setTags('')
  }

  async function remove(id) {
    await persist(notes.filter((n) => n.id !== id))
  }

  const q = filter.trim().toLowerCase()
  const shown = q
    ? notes.filter(
        (n) =>
          n.body.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      )
    : notes

  return (
    <div>
      <div className="card">
        <textarea
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you learn today?"
        />
        <input
          style={{ marginTop: 8 }}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags, comma separated"
        />
        <button className="act" style={{ marginTop: 8 }} onClick={add}>
          Add note
        </button>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter notes…"
        style={{ marginBottom: 12 }}
      />

      {shown.length === 0 && <div className="card muted">No notes yet.</div>}
      {shown.map((n) => (
        <div className="card" key={n.id}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {new Date(n.createdAt).toLocaleString()}
            {n.tags.length > 0 && ` · ${n.tags.join(', ')}`}
          </div>
          <button className="act" style={{ marginTop: 8 }} onClick={() => remove(n.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Open the Notes tab. Expected:
- Adding a note with tags `dp, graphs` shows it at the top with a timestamp and tags.
- Typing `dp` in the filter keeps that note; typing `zzz` shows "No notes yet."
- Delete removes the note.
- Reloading the page preserves remaining notes.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add Notes tab with tagging and filtering"
```

---

### Task 10: Agents tab

**Files:**
- Create: `src/agents.json`
- Modify: `src/tabs/Agents.jsx` (full replacement)

**Interfaces:**
- Consumes: `POST /api/agent` (Task 5).
- Produces: `src/agents.json` — an array of `{ id, name, systemPrompt }`. Adding a fourth
  agent later means adding an entry here; no code changes.

- [ ] **Step 1: Create `src/agents.json`**

```json
[
  {
    "id": "tricks",
    "name": "Math & Puzzle Tricks",
    "systemPrompt": "You are a coach for mental math, competitive-math tricks, chess tactics, and logic puzzles. Teach the underlying pattern, not just the answer. When given a problem, first name the technique that cracks it, then show the shortest clean solution, then give one variation to try. Prefer worked examples over prose. Be concise."
  },
  {
    "id": "geopolitics",
    "name": "Geopolitics Concepts",
    "systemPrompt": "You teach geopolitics from first principles: geography, trade routes, energy, demographics, alliances, and incentives. Explain why states behave as they do rather than narrating events. Present competing interpretations fairly and flag where analysts disagree. Note that your knowledge has a training cutoff and you cannot see current news, so avoid claims about very recent events. Be concise."
  },
  {
    "id": "ai-arch",
    "name": "AI Architecture",
    "systemPrompt": "You teach modern AI systems architecture to a working software engineer: transformer internals, attention variants, mixture-of-experts, tokenization, training vs. inference tradeoffs, quantization, serving, RAG, and agent design. Use precise technical language and concrete numbers. Prefer diagrams described in text and small code sketches. Note that your knowledge has a training cutoff, so flag when something may have moved on. Be concise."
  }
]
```

- [ ] **Step 2: Replace `src/tabs/Agents.jsx` entirely**

```jsx
import { useState } from 'react'
import agents from '../agents.json'

export default function Agents() {
  const [agent, setAgent] = useState(agents[0])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function switchAgent(id) {
    setAgent(agents.find((a) => a.id === id))
    setMessages([])
    setError('')
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: agent.systemPrompt, messages: next }),
      })
      const j = await r.json()
      if (j.error) setError(j.error)
      else setMessages([...next, { role: 'assistant', content: j.reply }])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="card">
        <select value={agent.id} onChange={(e) => switchAgent(e.target.value)}>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {messages.map((m, i) => (
        <div className="card" key={i}>
          <div className="muted">{m.role === 'user' ? 'You' : agent.name}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
        </div>
      ))}

      {busy && <div className="card muted">Thinking…</div>}
      {error && <div className="card err">{error}</div>}

      <div className="card">
        <textarea
          rows={3}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${agent.name}…`}
        />
        <button className="act" style={{ marginTop: 8 }} onClick={send} disabled={busy}>
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

Open the Agents tab. Expected:
- The dropdown lists all three agents.
- Sending "Explain the pigeonhole principle in two sentences" to Math & Puzzle Tricks
  shows "Thinking…" then an assistant reply.
- Switching agents clears the conversation.
- A follow-up question receives a reply that reflects the earlier turn (history is sent).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Agents tab with three config-driven tutors"
```

---

### Task 11: README and deploy to a URL reachable from the iPhone

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a deployed URL.

- [ ] **Step 1: Create `README.md`**

````markdown
# Forge

A personal daily deliberate-practice app: adaptive Codeforces problems, the Lichess
daily puzzle, local notes, and LLM tutor agents.

## Setup

```bash
npm install
cp .env.example .env   # then paste your Groq API key into .env
npm run dev            # http://localhost:5173
```

Get a free Groq API key at https://console.groq.com (no credit card).

## Environment

| Variable | Required | Default |
|---|---|---|
| `GROQ_API_KEY` | yes | — |
| `GROQ_MODEL` | no | `llama-3.3-70b-versatile` |

## Tests

```bash
npm test
```

## API smoke tests

```bash
curl http://localhost:5173/api/health
curl "http://localhost:5173/api/cf?handle=tourist"
curl http://localhost:5173/api/puzzle
```

## Layout

- `api/` — serverless functions (Vercel). Also mounted into the Vite dev server by the
  `forge-api-dev` plugin in `vite.config.js`, so `npm run dev` runs the API too.
- `src/tabs/` — the three screens.
- `src/store.js` — IndexedDB wrappers. All user data is local to the browser.
- `src/agents.json` — agent definitions. **To add an agent, add an entry here.** No code
  change is needed.

## Deploy

```bash
npx vercel --prod
```

Set `GROQ_API_KEY` in the Vercel project's environment variables. Then open the
deployed URL on your iPhone and use Share → Add to Home Screen.

## Not built yet

- Phase 2: quant question engine (LLM-generated, reuses `/api/agent`), spaced repetition
  over the existing `progress` store.
- Phase 3: RSS digest agents (newsletter + AI-news summarization).
````

- [ ] **Step 2: Verify the production build works**

```bash
npm run build
```

Expected: build succeeds, `dist/` is created, no errors.

- [ ] **Step 3: Deploy**

```bash
npx vercel --prod
```

Follow the prompts to log in and link the project. When asked, accept the detected Vite
framework preset. After the first deploy, add `GROQ_API_KEY` in the Vercel dashboard under
Project → Settings → Environment Variables, then redeploy with `npx vercel --prod`.

**If the user has no Vercel account, stop and tell them** — do not create one on their
behalf. Everything except this step works on localhost.

- [ ] **Step 4: Verify the deployment**

Open the deployed URL. Expected: the app loads, the Today tab shows the daily puzzle and
(with a handle set) problems, and the Agents tab returns a reply. Then open the same URL
on the iPhone and add it to the home screen.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add README with setup, deploy, and phase notes"
```

---

## Self-review notes

Spec coverage checked section by section:

| Spec item | Task |
|---|---|
| Vite + React SPA, no router | 1, 7 |
| Serverless proxy, dev-mounted | 1 |
| `pickProblems` ±200 / solved-exclusion / unrated fallback | 2 |
| `/api/cf` server-side join and filter | 3 |
| `/api/puzzle`, link-out not board | 4 |
| `/api/agent`, non-streaming, key from env | 5 |
| IndexedDB settings / notes / progress | 6 |
| Storage-unavailable warning | 6, 7 |
| Missing-handle prompt rather than error | 7, 8 |
| Today: problems, puzzle, solved count, least-practiced tag | 8 |
| Notes: create, delete, filter, tags | 9 |
| Agents: three seeded tutors from bundled JSON | 10 |
| Per-panel inline error handling | 8, 9, 10 |
| Deploy + Add to Home Screen | 11 |

Deferred by design, with the seam noted in the README: quant engine, RSS digests,
spaced-repetition UI, in-app agent authoring.
