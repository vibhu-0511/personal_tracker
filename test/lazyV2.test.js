import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createSyncRouter } from '../src/sync/router.js'
import { createSyncEngine } from '../src/sync/engine.js'
import { createEngine2 } from '../src/sync/engine2.js'
import { createFlags, V2_KEYS } from '../src/sync/flags.js'
import * as migrate from '../src/sync/migrate.js'
import { ADAPTER_KEYS } from '../src/sync/adapters.js'
import { createFakeDb } from './helpers/fakeDb.js'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const T0 = 1_700_000_000_000

// ---- the entry chunk must not reach the v2 stack statically ----------------------------

// Modules that only a flagged-on key (or the rollout) needs.
const V2_MODULES = ['engine2', 'cloudV2', 'migrate', 'adapters', 'hlc', 'outbox', 'diff', 'records']

function staticImports(src) {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  return [...code.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
    .concat([...code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]))
}

test('src/store.js has no static import of the v2 modules', () => {
  const src = read('../src/store.js')
  const stat = staticImports(src)
  for (const name of V2_MODULES) {
    assert.equal(stat.some((s) => new RegExp(`/${name}\\.js$`).test(s)), false, `static import of ${name}.js`)
  }
  assert.equal(/from\s*['"]\.\/sync\/(engine2|cloudV2|migrate)\.js['"]/.test(src), false)
})

test('store.js reaches engine2 / cloudV2 / migrate only through import()', () => {
  const src = read('../src/store.js').replace(/\/\/.*$/gm, '')
  for (const name of ['engine2', 'cloudV2', 'migrate']) {
    assert.match(src, new RegExp(`import\\(\\s*'\\./sync/${name}\\.js'\\s*\\)`), `${name} dynamic import`)
    const all = [...src.matchAll(new RegExp(`['"]\\./sync/${name}\\.js['"]`, 'g'))].length
    const dyn = [...src.matchAll(new RegExp(`import\\(\\s*'\\./sync/${name}\\.js'\\s*\\)`, 'g'))].length
    assert.equal(all, dyn, `${name}.js is referenced outside import()`)
  }
})

test('the entry-side sync modules import nothing from the v2 stack', () => {
  const files = [
    '../src/sync/router.js', '../src/sync/flags.js', '../src/sync/appSubscriptions.js',
    '../src/sync/snapshotStore.js', '../src/sync/engine.js', '../src/sync/cloudKv.js',
    '../src/useSynced.js', '../src/backup/backup.js', '../src/backup/BackupPanel.jsx', '../src/App.jsx',
  ]
  for (const f of files) {
    for (const spec of staticImports(read(f))) {
      for (const name of V2_MODULES) {
        assert.equal(new RegExp(`/${name}\\.js$`).test(spec), false, `${f} imports ${spec}`)
      }
    }
  }
})

test('no component or hook outside src/sync imports the v2 modules', () => {
  const walk = (dir) => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(`${dir}${d.name}/`) : [`${dir}${d.name}`])
  for (const f of walk('../src/').filter((p) => /\.(js|jsx)$/.test(p) && !p.includes('/src/sync/'))) {
    for (const spec of staticImports(read(f))) {
      assert.equal(/sync\/(engine2|cloudV2|migrate|adapters|hlc|outbox|diff|records)\.js$/.test(spec), false, `${f} imports ${spec}`)
    }
  }
})

test('flags.js key list equals the adapters and migrate.js re-exports the same flags', () => {
  assert.deepEqual([...V2_KEYS], [...ADAPTER_KEYS])
  assert.equal(migrate.createFlags, createFlags)
  assert.equal(createFlags({ env: 'notes', storage: null }).isV2('notes'), true)
  assert.equal(createFlags({ env: '', storage: null }).keys().length, 0)
})

// ---- the router accepts a factory that returns a Promise ------------------------------

const mutex = () => {
  let tail = Promise.resolve()
  return (_name, fn) => { const run = tail.then(fn); tail = run.then(() => undefined, () => undefined); return run }
}

function setup({ env, createV2 }) {
  const db = createFakeDb()
  // a signed-in fake kv_store, so v1's debounced push succeeds instead of retrying forever
  const cloud = { async getSession() { return { data: { session: { user: { id: 'u1' } } } } }, async read() { return null }, async write() {} }
  const v1 = createSyncEngine({ db, cloud, now: () => T0 })
  const flags = createFlags({ env, storage: null })
  const router = createSyncRouter({ v1, createV2, flags })
  return { db, router }
}

test('async createV2: a flagged key still gets, saves and mutates; created once', async () => {
  let calls = 0
  const { router } = setup({
    env: 'notes',
    createV2: async () => {
      calls++
      await new Promise((r) => setImmediate(r)) // stands in for the chunk download
      return createEngine2({ db: createFakeDb(), lock: mutex(), bus: null, now: () => T0, win: null, doc: null })
    },
  })
  assert.deepEqual(await router.get('notes', []), [])
  await router.save('notes', [{ id: 'a', text: 'one' }])
  assert.deepEqual(await router.get('notes', []), [{ id: 'a', text: 'one' }])
  const out = await router.mutate('notes', (list) => [...list, { id: 'b', text: 'two' }], [])
  assert.equal(out.length, 2)
  assert.equal((await router.get('notes', [])).length, 2)
  assert.equal(calls, 1)
  assert.ok(router.v2)
})

test('async createV2: concurrent first uses share one creation', async () => {
  let calls = 0
  const { router } = setup({
    env: 'notes,tasks',
    createV2: async () => {
      calls++
      await new Promise((r) => setImmediate(r))
      return createEngine2({ db: createFakeDb(), lock: mutex(), bus: null, now: () => T0, win: null, doc: null })
    },
  })
  await Promise.all([router.get('notes', []), router.get('tasks', []), router.save('notes', [])])
  assert.equal(calls, 1)
})

test('async createV2: a rejected load is not cached, the next call retries', async () => {
  let calls = 0
  const { router } = setup({
    env: 'notes',
    createV2: async () => {
      calls++
      if (calls === 1) throw new Error('chunk failed to load')
      return createEngine2({ db: createFakeDb(), lock: mutex(), bus: null, now: () => T0, win: null, doc: null })
    },
  })
  await assert.rejects(router.get('notes', []), /chunk failed/)
  assert.deepEqual(await router.get('notes', []), [])
  assert.equal(calls, 2)
})

test('async createV2: status listener attaches once the engine resolves', async () => {
  const seen = []
  let push
  const engine2 = {
    get: async () => [], save: async () => {}, update: async () => [],
    onStatusChange(fn) { push = fn; return () => {} },
  }
  const { router } = setup({ env: 'notes', createV2: async () => engine2 })
  const off = router.onStatusChange((v) => seen.push(v))
  await router.get('notes', [])
  push(true)
  assert.equal(seen.at(-1), true)
  off()
})

test('flags off: the Promise factory is never called and v1 serves everything', async () => {
  const { router, db } = setup({ env: '', createV2: () => assert.fail('v2 must not load with flags off') })
  await router.save('notes', [{ id: 'x' }])
  assert.deepEqual(await router.get('notes', []), [{ id: 'x' }])
  await router.mutate('notes', (l) => [...l, { id: 'y' }], [])
  assert.equal((await router.get('notes', [])).length, 2)
  assert.equal(await router.reconcileKey('notes') !== undefined, true)
  await router.reconcileAll(V2_KEYS)
  await router.claimOwner('u1')
  await router.flush()
  await router.flush()
  assert.equal(router.v2, null)
  assert.equal((await db.keys()).some((k) => String(k).startsWith('r2:')), false)
})

test('sync factories keep working', async () => {
  const { router } = setup({
    env: 'notes',
    createV2: () => createEngine2({ db: createFakeDb(), lock: mutex(), bus: null, now: () => T0, win: null, doc: null }),
  })
  await router.save('notes', [{ id: 's' }])
  assert.deepEqual(await router.get('notes', []), [{ id: 's' }])
})
