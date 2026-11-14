import test from 'node:test'
import assert from 'node:assert/strict'
import {
  KEY_TO_TABS, tabsForKey, allTabs, bumpTicks, createRemoteSync, bootSync, syncBannerText,
} from '../src/sync/appSubscriptions.js'
import { createSyncRouter } from '../src/sync/router.js'
import { createFlags } from '../src/sync/migrate.js'

// R6-14. App.jsx and src/store.js cannot be imported under node:test (supabaseClient.js
// throws without env), so the App wiring lives in src/sync/appSubscriptions.js and is
// driven here with fakes. The flags-off cases use the REAL sync router with every flag
// off in front of a fake v1 engine, i.e. the same path App.jsx runs by default.

const SYNCED_KEYS = [
  'settings', 'notes', 'progress', 'expenses', 'budgets', 'goals',
  'examProgress', 'examNotes', 'investProgress', 'watchlist',
  'tasks', 'reminders', 'habits', 'moodLog', 'loans', 'puzzleProgress', 'checklists',
]
const flush = () => new Promise((r) => setImmediate(r))
const kv = (key, kind = 'UPDATE') => ({ eventType: kind, new: kind === 'DELETE' ? {} : { key }, old: kind === 'DELETE' ? { key } : {} })

function makeFlags(env = '') {
  const m = new Map()
  return createFlags({ env, storage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) } })
}

// router (real) over a fake v1 engine whose reconcileKey answers from `answers`
function makeRouter({ env = '', answers = {} } = {}) {
  const calls = []
  const v1 = {
    async reconcileKey(key) { calls.push(key); return answers[key] ?? 'noop' },
    async reconcileAll() {}, async flush() {}, async claimOwner() {},
    onStatusChange: () => () => {}, get: async () => undefined, save: async () => {}, mutate: async () => {},
  }
  const router = createSyncRouter({ v1, createV2: () => { throw new Error('v2 must not be built') }, flags: makeFlags(env) })
  return { router, calls }
}

function harness({ env = '', answers = {} } = {}) {
  const { router, calls } = makeRouter({ env, answers })
  const events = { ticks: [], settings: 0, announced: [], subscribed: [] }
  const subs = new Map()
  const remote = createRemoteSync({
    keys: SYNCED_KEYS,
    isV2: router.isV2,
    reconcileKey: router.reconcileKey,
    subscribe: (key, fn) => { events.subscribed.push(key); subs.set(key, fn); return () => subs.delete(key) },
    announce: (key) => events.announced.push(key),
    onSettings: () => { events.settings += 1 },
    onTabs: (t) => events.ticks.push(t),
  })
  return { remote, events, calls, subs, router }
}

// ---- the tab mapping (the old App.jsx KEY_TO_TAB, unchanged) -----------------

test('tab mapping is the v1 one, ids unchanged', () => {
  assert.deepEqual(KEY_TO_TABS, {
    progress: 'Today',
    expenses: 'Expenses', budgets: 'Expenses', goals: 'Expenses', loans: 'Expenses',
    examProgress: 'Exams', examNotes: 'Exams',
    investProgress: 'Invest', watchlist: 'Invest',
    tasks: ['Life', 'Home'], reminders: ['Life', 'Home'], habits: ['Life', 'Home'],
    moodLog: 'Life', notes: 'Life', checklists: 'Life',
    puzzleProgress: 'Puzzles',
  })
  assert.deepEqual(tabsForKey('tasks'), ['Life', 'Home'])
  assert.deepEqual(tabsForKey('progress'), ['Today'])
  assert.deepEqual(tabsForKey('settings'), [])
  assert.deepEqual(tabsForKey('toString'), [])
  assert.deepEqual(allTabs().sort(), ['Exams', 'Expenses', 'Home', 'Invest', 'Life', 'Puzzles', 'Today'])
})

test('every synced key except settings maps to a tab', () => {
  for (const key of SYNCED_KEYS) if (key !== 'settings') assert.ok(tabsForKey(key).length > 0, key)
})

test('bumpTicks adds one per target and leaves the rest', () => {
  const prev = { Life: 2, Today: 1 }
  const next = bumpTicks(prev, ['Life', 'Home'])
  assert.deepEqual(next, { Life: 3, Today: 1, Home: 1 })
  assert.deepEqual(prev, { Life: 2, Today: 1 }) // not mutated
})

// ---- flags off: the kv_store channel behaves as v1 --------------------------

test('flags off: no engine subscription is made', () => {
  const h = harness()
  const stop = h.remote.start()
  assert.deepEqual(h.events.subscribed, [])
  stop()
})

test('flags off: a pulled kv_store change refreshes exactly the right tabs', async () => {
  for (const key of SYNCED_KEYS.filter((k) => k !== 'settings')) {
    const h = harness({ answers: { [key]: 'pull' } })
    h.remote.start()
    await h.remote.handleKvChange(kv(key))
    assert.deepEqual(h.calls, [key])
    assert.deepEqual(h.events.ticks, [tabsForKey(key)], key)
    assert.equal(h.events.settings, 0)
    assert.deepEqual(h.events.announced, [key])
  }
})

test('flags off: a remote settings change reloads settings, bumps no tab', async () => {
  const h = harness({ answers: { settings: 'pull' } })
  await h.remote.handleKvChange(kv('settings'))
  assert.equal(h.events.settings, 1)
  assert.deepEqual(h.events.ticks, [])
})

test('flags off: anything but a pull does nothing (push, noop)', async () => {
  for (const action of ['push', 'noop', undefined]) {
    const h = harness({ answers: { habits: action } })
    await h.remote.handleKvChange(kv('habits'))
    assert.deepEqual(h.calls, ['habits'])
    assert.deepEqual(h.events.ticks, [])
    assert.deepEqual(h.events.announced, [])
    assert.equal(h.events.settings, 0)
  }
})

test('flags off: DELETE events use old.key; unknown or missing keys never reconcile', async () => {
  const h = harness({ answers: { tasks: 'pull' } })
  await h.remote.handleKvChange(kv('tasks', 'DELETE'))
  assert.deepEqual(h.events.ticks, [['Life', 'Home']])
  await h.remote.handleKvChange(kv('dsa_mastery_v1'))
  await h.remote.handleKvChange({ new: {}, old: {} })
  await h.remote.handleKvChange({})
  await h.remote.handleKvChange(undefined)
  assert.deepEqual(h.calls, ['tasks'])
  assert.equal(h.events.ticks.length, 1)
})

test('flags off: the router hands every key straight to the v1 engine', async () => {
  const h = harness()
  for (const key of SYNCED_KEYS) assert.equal(h.router.isV2(key), false)
  await h.remote.handleKvChange(kv('notes'))
  assert.deepEqual(h.calls, ['notes'])
})

// ---- parity with the handler this module replaced ----------------------------------

// The pre-R6-14 inline App.jsx handler and KEY_TO_TAB, verbatim, as an oracle.
const OLD_KEY_TO_TAB = {
  progress: 'Today',
  expenses: 'Expenses', budgets: 'Expenses', goals: 'Expenses', loans: 'Expenses',
  examProgress: 'Exams', examNotes: 'Exams',
  investProgress: 'Invest', watchlist: 'Invest',
  tasks: ['Life', 'Home'], reminders: ['Life', 'Home'], habits: ['Life', 'Home'],
  moodLog: 'Life', notes: 'Life', checklists: 'Life',
  puzzleProgress: 'Puzzles',
}
function oldHandler(payload, reconcileKey, out) {
  const key = payload.new?.key || payload.old?.key
  if (!key || !SYNCED_KEYS.includes(key)) return Promise.resolve()
  return reconcileKey(key).then((action) => {
    if (action !== 'pull') return
    if (key === 'settings') { out.settings += 1; return }
    const targets = [].concat(OLD_KEY_TO_TAB[key] || [])
    if (targets.length === 0) return
    const next = { ...out.ticks }
    for (const t of targets) next[t] = (next[t] || 0) + 1
    out.ticks = next
  })
}

test('flags off: identical outcome to the old inline handler for every key x action x event', async () => {
  for (const key of [...SYNCED_KEYS, 'dsa_mastery_v1', 'nope']) {
    for (const action of ['pull', 'push', 'noop']) {
      for (const kind of ['INSERT', 'UPDATE', 'DELETE']) {
        const payload = kv(key, kind)
        const old = { ticks: {}, settings: 0 }
        await oldHandler(payload, async () => action, old)

        const h = harness({ answers: { [key]: action } })
        let ticks = {}
        let settings = 0
        const remote = createRemoteSync({
          keys: SYNCED_KEYS, isV2: h.router.isV2, reconcileKey: h.router.reconcileKey,
          subscribe: () => () => {},
          onSettings: () => { settings += 1 },
          onTabs: (t) => { ticks = bumpTicks(ticks, t) },
        })
        await remote.handleKvChange(payload)
        assert.deepEqual({ ticks, settings }, old, `${key} ${action} ${kind}`)
      }
    }
  }
})

// ---- v2 keys: engine subscriptions replace the tab refresh -----------------

test('a v2 key subscribes to the engine and a remote change refreshes its tabs', () => {
  const h = harness({ env: 'tasks,puzzleProgress' })
  const stop = h.remote.start()
  assert.deepEqual(h.events.subscribed.sort(), ['puzzleProgress', 'tasks'])
  h.subs.get('tasks')({ any: 'blob' }, { local: false })
  h.subs.get('puzzleProgress')({}, undefined)
  assert.deepEqual(h.events.ticks, [['Life', 'Home'], ['Puzzles']])
  assert.deepEqual(h.events.announced, []) // announce is the v1-pull hook only
  stop()
  assert.equal(h.subs.size, 0)
})

test('a v2 change made by this tab (local echo) does not refetch tabs', () => {
  const h = harness({ env: 'tasks' })
  h.remote.start()
  h.subs.get('tasks')({}, { local: true })
  assert.deepEqual(h.events.ticks, [])
})

test('a v2 key never refreshes twice: the kv_store channel answers noop for it', async () => {
  const h = harness({ env: 'tasks', answers: { tasks: 'pull' } })
  h.remote.start()
  await h.remote.handleKvChange(kv('tasks'))
  assert.deepEqual(h.calls, []) // router short-circuits, v1 engine never asked
  assert.deepEqual(h.events.ticks, [])
  // other keys still use the kv_store channel
  const h2 = harness({ env: 'tasks', answers: { notes: 'pull' } })
  await h2.remote.handleKvChange(kv('notes'))
  assert.deepEqual(h2.events.ticks, [['Life']])
})

test('v2 settings change reloads settings', () => {
  const h = harness({ env: 'settings' })
  h.remote.start()
  h.subs.get('settings')({}, { local: false })
  assert.equal(h.events.settings, 1)
})

// ---- startup ordering ----------------------------------------------------------

function bootFakes({ cursor }) {
  const order = []
  let release
  const gate = new Promise((r) => { release = r })
  return {
    order,
    release,
    args: {
      userId: 'u1',
      claimOwner: async (id) => { order.push(`claim:${id}`) },
      reconcileAll: async () => { order.push('reconcile:start'); await gate; order.push('reconcile:end') },
      getSettings: async () => { order.push('settings'); return { cfHandle: 'h', theme: 'ocean' } },
      hasLocalCursor: () => cursor,
      onBackgroundDone: () => order.push('bg:done'),
      onBackgroundError: (e) => order.push(`bg:error:${e.message}`),
    },
  }
}

test('no local cursor (the flags-off case): render waits for the pull, v1 order', async () => {
  const f = bootFakes({ cursor: false })
  let done = false
  const p = bootSync(f.args).then((r) => { done = true; return r })
  await flush(); await flush()
  assert.equal(done, false) // still gated on reconcileAll
  assert.deepEqual(f.order, ['claim:u1', 'reconcile:start'])
  f.release()
  const r = await p
  assert.deepEqual(f.order, ['claim:u1', 'reconcile:start', 'reconcile:end', 'settings'])
  assert.deepEqual(r.settings, { cfHandle: 'h', theme: 'ocean' })
  assert.equal(r.background, null)
})

test('a failing pull with no cursor rejects, as before (App shows the init error)', async () => {
  const f = bootFakes({ cursor: false })
  f.args.reconcileAll = async () => { throw new Error('offline') }
  await assert.rejects(bootSync(f.args), /offline/)
})

test('local cursor: settings return before the pull finishes; pull runs in the background', async () => {
  const f = bootFakes({ cursor: true })
  const r = await bootSync(f.args)
  assert.equal(f.order[0], 'claim:u1')
  assert.ok(f.order.includes('settings'))
  assert.ok(!f.order.includes('reconcile:end')) // pull still pending, render is not blocked
  assert.ok(r.background)
  f.release()
  await r.background
  assert.equal(f.order.at(-1), 'bg:done')
})

test('local cursor: a failing background pull is reported, never thrown', async () => {
  const f = bootFakes({ cursor: true })
  f.args.reconcileAll = async () => { throw new Error('offline') }
  const r = await bootSync(f.args)
  await r.background
  assert.equal(f.order.at(-1), 'bg:error:offline')
})

test('cursor check runs after claimOwner and a throwing check means no cursor', async () => {
  const order = []
  const r = await bootSync({
    userId: 'u', claimOwner: async () => { order.push('claim') }, reconcileAll: async () => { order.push('reconcile') },
    getSettings: async () => ({}),
    hasLocalCursor: () => { order.push('cursor?'); throw new Error('x') },
  })
  assert.deepEqual(order, ['claim', 'cursor?', 'reconcile'])
  assert.equal(r.background, null)
})

// ---- banner ----------------------------------------------------------------------

test('banner: v1 text with nothing pending, hidden when not failed', () => {
  assert.equal(syncBannerText({ failed: false, pending: 0 }), null)
  assert.equal(syncBannerText({ failed: false, pending: 5 }), null)
  assert.equal(syncBannerText({}), null)
  assert.equal(syncBannerText(undefined), null)
  assert.equal(syncBannerText({ failed: true, pending: 0 }),
    'Cloud sync failed — changes are saved on this device and will retry.')
})

test('banner reads the pending count', () => {
  assert.equal(syncBannerText({ failed: true, pending: 3 }),
    'Cloud sync failed — changes are saved on this device and will retry (3 waiting to sync).')
})
