import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { serialize } from '../src/sync/hlc.js'
import {
  ADAPTERS, ADAPTER_KEYS, ID_LIST_KEYS, FLAT_MAP_KEYS, COLLECTION_TO_KEY,
  toEntries, fromEntries, collectionsFor, emptyBlob, adapterFor,
} from '../src/sync/adapters.js'

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/sync-v1-blobs.json', import.meta.url), 'utf8'))

// Ids forge_backfill() (docs/plan/research/R6-sync-v2.sql) produced for test/fixtures/sync-v1-blobs.json,
// captured by running the SQL on a throwaway local PostgreSQL 16 (kv_store seeded from the fixture,
// one row per key). Sorted by the test, so collation does not matter.
const BACKFILL_IDS = {
  budgets: ['food', 'rent', 'travel'],
  checklists: ['c-1'],
  examNotes: ['x-1', 'x-2'],
  examProgress: ['gate::dbms::normal forms', 'gate::os::deadlocks', 'gate::os::scheduling'],
  expenses: ['e-1', 'e-2', 'e-3'],
  goals: ['g-1', 'g-2'],
  habitCheckins: ['h-1:2026-11-01', 'h-1:2026-11-09', 'h-2:2026-11-10', 'h-2:2026-11-11', 'h-2:2026-11-12', 'h-2:2026-11-13'],
  habits: ['h-1', 'h-2', 'h-3'],
  investProgress: ['current', 'done:l-intro', 'done:l-risk', 'done:l:colon', 'quiz:q-intro', 'quiz:q-risk', 'tasks:t-open-demat', 'tasks:t-sip'],
  loans: ['l-1', 'l-2'],
  moodLog: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'],
  notes: ['1699980000123', 'n-a1', 'n-b2'],
  progress: ['1500', 'lru-cache', 'two-sum'],
  puzzleProgress: ['p-01', 'p-02', 'p-17'],
  reminders: ['r-0', 'r-1'],
  settings: ['_'],
  tasks: ['1699100000999', 't-1', 't-3'],
  watchlist: ['w-1', 'w-2'],
}

const storeKeys = () => {
  const src = readFileSync(new URL('../src/store.js', import.meta.url), 'utf8')
  const block = src.match(/export const SYNCED_KEYS = \[([\s\S]*?)\]/)[1]
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const stamp = (ms, counter = 0, node = 'dev-a') => serialize({ ms, counter, node })
const T0 = 1_700_000_000_000
const moodRec = (source, hlc, extra = {}) => ({
  collection: 'moodLog', id: '2026-11-12', body: { date: '2026-11-12', valence: 50, source }, pos: null,
  hlc, deviceId: 'dev-a', deletedAt: null, ...extra,
})

test('adapter keys equal SYNCED_KEYS in src/store.js (drift fails here)', () => {
  const keys = storeKeys()
  assert.equal(keys.length, 17)
  assert.equal(new Set(keys).size, 17)
  assert.deepEqual([...ADAPTER_KEYS].sort(), [...keys].sort())
  assert.deepEqual(Object.keys(fixture()).sort(), [...keys].sort())
  for (const k of keys) assert.equal(adapterFor(k).key, k)
})

test('families: 10 id-lists, 4 flat maps, moodLog, investProgress, settings', () => {
  assert.equal(ID_LIST_KEYS.length, 10)
  assert.equal(FLAT_MAP_KEYS.length, 4)
  const fam = (f) => ADAPTER_KEYS.filter((k) => ADAPTERS[k].family.startsWith(f)).sort()
  assert.deepEqual(fam('id-list'), [...ID_LIST_KEYS].sort())
  assert.deepEqual(fam('flat-map'), [...FLAT_MAP_KEYS].sort())
  assert.deepEqual(fam('by-date'), ['moodLog'])
  assert.deepEqual(fam('leaf-map'), ['investProgress'])
  assert.deepEqual(fam('doc'), ['settings'])
})

test('round trip: fromEntries(toEntries(blob)) deep-equals the blob for every key', () => {
  const blobs = fixture()
  for (const key of ADAPTER_KEYS) {
    const entries = toEntries(key, blobs[key])
    assert.ok(entries.length > 0, key)
    assert.deepEqual(fromEntries(key, entries), blobs[key], key)
  }
})

test('round trip keeps list order that differs from id order and date order', () => {
  const blobs = fixture()
  assert.deepEqual(fromEntries('notes', toEntries('notes', blobs.notes)).map((n) => n.id), ['n-b2', 1699980000123, 'n-a1'])
  assert.deepEqual(fromEntries('moodLog', toEntries('moodLog', blobs.moodLog)).map((e) => e.date),
    ['2026-11-12', '2026-11-10', '2026-11-13', '2026-11-11'])
  const habits = fromEntries('habits', toEntries('habits', blobs.habits))
  assert.deepEqual(habits.map((h) => h.id), ['h-2', 'h-1', 'h-3'])
  assert.deepEqual(habits[0].checkins, ['2026-11-12', '2026-11-10', '2026-11-11', '2026-11-13'])
})

test('round trip survives shuffled, JSON-serialised entries (pos decides order)', () => {
  const blobs = fixture()
  for (const key of ['notes', 'tasks', 'habits', 'moodLog']) {
    const entries = toEntries(key, blobs[key]).reverse()
    assert.deepEqual(fromEntries(key, JSON.parse(JSON.stringify(entries))), blobs[key], key)
  }
})

test('entry ids equal the ids forge_backfill() produces for the fixture', () => {
  const blobs = fixture()
  const got = {}
  for (const key of ADAPTER_KEYS) {
    for (const e of toEntries(key, blobs[key])) (got[e.collection] ||= []).push(e.id)
  }
  const sorted = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]).sort(([a], [b]) => (a < b ? -1 : 1)))
  assert.deepEqual(sorted(got), sorted(BACKFILL_IDS))
})

test('entry shape: collection, string id, body, pos; ids unique per collection', () => {
  const blobs = fixture()
  for (const key of ADAPTER_KEYS) {
    const entries = toEntries(key, blobs[key])
    const seen = new Set()
    for (const e of entries) {
      assert.deepEqual(Object.keys(e).sort(), ['body', 'collection', 'id', 'pos'])
      assert.equal(typeof e.id, 'string')
      assert.ok(e.id.length >= 1 && e.id.length <= 200)
      assert.ok(adapterFor(key).collections.includes(e.collection))
      assert.ok(e.pos === null || Number.isFinite(e.pos))
      const full = `${e.collection}/${e.id}`
      assert.ok(!seen.has(full), full)
      seen.add(full)
    }
  }
})

test('id-list: id = String(item.id), body = item, pos = (index + 1) * 1000 like the SQL', () => {
  const blobs = fixture()
  const entries = toEntries('notes', blobs.notes)
  assert.deepEqual(entries.map((e) => [e.id, e.pos]), [['n-b2', 1000], ['1699980000123', 2000], ['n-a1', 3000]])
  assert.deepEqual(entries[1].body, blobs.notes[1])
  assert.equal(entries[1].body.id, 1699980000123) // body keeps the numeric id
})

test('habits: checkins split into habitCheckins, ids habitId:YYYY-MM-DD, body without checkins', () => {
  const habits = fixture().habits
  const entries = toEntries('habits', habits)
  const parents = entries.filter((e) => e.collection === 'habits')
  const kids = entries.filter((e) => e.collection === 'habitCheckins')
  assert.equal(parents.length, 3)
  assert.equal(kids.length, 6)
  for (const p of parents) assert.equal('checkins' in p.body, false)
  assert.deepEqual(kids.find((e) => e.id === 'h-1:2026-11-09').body, { habitId: 'h-1', date: '2026-11-09' })
  assert.deepEqual(collectionsFor('habits'), ['habits', 'habitCheckins'])
  assert.equal(COLLECTION_TO_KEY.habitCheckins, 'habits')
})

test('habits: two devices checking in on different days both survive', () => {
  const base = [{ id: 'h-1', name: 'Run', checkins: ['2026-11-01'] }]
  const baseEntries = toEntries('habits', base)
  const deviceA = toEntries('habits', [{ ...base[0], checkins: ['2026-11-01', '2026-11-02'] }])
  const deviceB = toEntries('habits', [{ ...base[0], checkins: ['2026-11-01', '2026-11-03'] }])
  const newOnes = (side) => side.filter((e) => !baseEntries.some((b) => b.collection === e.collection && b.id === e.id))
  const merged = [...baseEntries, ...newOnes(deviceA), ...newOnes(deviceB)]
  const days = fromEntries('habits', merged)[0].checkins
  assert.deepEqual([...days].sort(), ['2026-11-01', '2026-11-02', '2026-11-03'])
})

test('habits: tombstoned check-in disappears, orphan check-ins and unchecked habits are handled', () => {
  const entries = toEntries('habits', fixture().habits)
  const dead = entries.map((e) => (e.id === 'h-2:2026-11-10' ? { ...e, body: null, deletedAt: '2026-11-14T00:00:00.000Z' } : e))
  assert.deepEqual(fromEntries('habits', dead)[0].checkins, ['2026-11-12', '2026-11-11', '2026-11-13'])
  const orphan = [...entries, { collection: 'habitCheckins', id: 'gone:2026-11-01', body: { habitId: 'gone', date: '2026-11-01' }, pos: null }]
  assert.deepEqual(fromEntries('habits', orphan), fixture().habits)
  assert.deepEqual(fromEntries('habits', entries.filter((e) => e.id !== 'h-1')).map((h) => h.id), ['h-2', 'h-3'])
})

test('habit check-ins without pos (SQL backfill rows) come back sorted by date after those with pos', () => {
  const entries = toEntries('habits', [{ id: 'h', name: 'x', checkins: ['2026-11-03', '2026-11-01', '2026-11-02'] }])
    .map((e) => ({ ...e, pos: e.collection === 'habitCheckins' ? null : e.pos }))
  assert.deepEqual(fromEntries('habits', entries)[0].checkins, ['2026-11-01', '2026-11-02', '2026-11-03'])
})

test('flat maps: id = key, bare false and 0 are values, null values are dropped', () => {
  const blobs = fixture()
  const puzzle = toEntries('puzzleProgress', blobs.puzzleProgress)
  assert.deepEqual(puzzle.map((e) => [e.id, e.body, e.pos]), [['p-01', true, null], ['p-02', false, null], ['p-17', true, null]])
  assert.deepEqual(toEntries('budgets', { rent: 0 }).map((e) => e.body), [0])
  assert.deepEqual(fromEntries('puzzleProgress', puzzle), blobs.puzzleProgress)
  assert.deepEqual(toEntries('progress', { a: null, b: { status: 'solved' } }).map((e) => e.id), ['b'])
})

test('investProgress: leaf ids done:/quiz:/tasks:<id> plus current', () => {
  const blob = fixture().investProgress
  const ids = toEntries('investProgress', blob).map((e) => e.id)
  assert.deepEqual(ids, [
    'done:l-intro', 'done:l-risk', 'done:l:colon', 'quiz:q-intro', 'quiz:q-risk',
    'tasks:t-open-demat', 'tasks:t-sip', 'current',
  ])
  assert.deepEqual(toEntries('investProgress', { done: {}, quiz: {}, tasks: {}, current: null }), [])
  assert.deepEqual(fromEntries('investProgress', []), { done: {}, quiz: {}, tasks: {}, current: null })
  assert.deepEqual(emptyBlob('investProgress'), { done: {}, quiz: {}, tasks: {}, current: null })
  const withFalse = toEntries('investProgress', blob).find((e) => e.id === 'tasks:t-open-demat')
  assert.equal(withFalse.body, false)
})

test('moodLog: id = date, ordered by pos; settings: single entry id _', () => {
  const blobs = fixture()
  assert.deepEqual(toEntries('moodLog', blobs.moodLog).map((e) => e.id), ['2026-11-12', '2026-11-10', '2026-11-13', '2026-11-11'])
  const settings = toEntries('settings', blobs.settings)
  assert.equal(settings.length, 1)
  assert.deepEqual([settings[0].collection, settings[0].id, settings[0].pos], ['settings', '_', null])
  assert.deepEqual(toEntries('settings', {}).map((e) => e.id), ['_'])
  assert.deepEqual(fromEntries('settings', []), {})
})

test('backfill normalisations: no id, duplicate ids (first wins), tombstones and foreign collections ignored', () => {
  const list = [{ id: 'a', v: 1 }, { v: 'no id' }, { id: 'a', v: 2 }, { id: 'b', v: 3 }, null, { id: 7 }]
  assert.deepEqual(fromEntries('tasks', toEntries('tasks', list)), [{ id: 'a', v: 1 }, { id: 'b', v: 3 }, { id: 7 }])
  const entries = toEntries('tasks', [{ id: 'a' }, { id: 'b' }])
  const withDead = [{ ...entries[0], body: null, deletedAt: '2026-11-14T00:00:00.000Z' }, entries[1]]
  assert.deepEqual(fromEntries('tasks', withDead), [{ id: 'b' }])
  assert.deepEqual(fromEntries('notes', entries), [])
  const mood = [{ date: '2026-11-01', source: 'derived', valence: 1 }, { date: '2026-11-01', source: 'logged', valence: 2 }, { valence: 3 }]
  assert.deepEqual(fromEntries('moodLog', toEntries('moodLog', mood)), [mood[0]])
})

test('wrong-shaped blobs give no entries; empty blobs round trip to their defaults', () => {
  for (const key of ADAPTER_KEYS) {
    for (const bad of [null, undefined, 42, 'x']) assert.deepEqual(toEntries(key, bad), [], key)
    assert.deepEqual(fromEntries(key, []), emptyBlob(key), key)
    assert.deepEqual(fromEntries(key, toEntries(key, emptyBlob(key))), emptyBlob(key), key)
  }
  assert.deepEqual(emptyBlob('settings'), {})
})

test('toEntries does not mutate its input and entries do not alias a habit body', () => {
  const blobs = fixture()
  for (const key of ADAPTER_KEYS) {
    const before = JSON.stringify(blobs[key])
    toEntries(key, blobs[key])
    assert.equal(JSON.stringify(blobs[key]), before, key)
  }
  const habits = fixture().habits
  const out = fromEntries('habits', toEntries('habits', habits))
  assert.notEqual(out[0], habits[0])
})

test('unknown key throws', () => {
  assert.throws(() => toEntries('nope', []), TypeError)
  assert.throws(() => fromEntries('constructor', []), TypeError)
})

test('moodLog resolve(): logged beats derived regardless of hlc', () => {
  const resolve = ADAPTERS.moodLog.resolve
  const logged = moodRec('logged', stamp(T0, 0, 'dev-a'))
  const newerDerived = moodRec('derived', stamp(T0 + 60_000, 0, 'dev-b'), { deviceId: 'dev-b' })
  assert.equal(resolve(logged, newerDerived), logged) // incoming derived is newer, still loses
  assert.equal(resolve(newerDerived, logged), logged) // incoming logged is older, still wins
  const olderDerived = moodRec('derived', stamp(T0 - 60_000, 0, 'dev-b'))
  assert.equal(resolve(olderDerived, logged), logged)
})

test('moodLog resolve(): same source falls back to hlc; ties and bad stamps keep local; null handling', () => {
  const resolve = ADAPTERS.moodLog.resolve
  const a = moodRec('logged', stamp(T0))
  const b = moodRec('logged', stamp(T0 + 1))
  assert.equal(resolve(a, b), b)
  assert.equal(resolve(b, a), b)
  const d1 = moodRec('derived', stamp(T0))
  const d2 = moodRec('derived', stamp(T0 + 1))
  assert.equal(resolve(d1, d2), d2)
  assert.equal(resolve(d2, d1), d2)
  assert.equal(resolve(a, { ...a }), a) // equal hlc: local stays
  assert.equal(resolve(a, moodRec('derived', 'garbage')), a)
  assert.equal(resolve(null, a), a)
  assert.equal(resolve(a, null), a)
  assert.equal(resolve(null, null), null)
})

test('moodLog resolve(): a tombstone has no source, so hlc decides', () => {
  const resolve = ADAPTERS.moodLog.resolve
  const logged = moodRec('logged', stamp(T0))
  const newerTomb = moodRec('x', stamp(T0 + 5), { body: null, deletedAt: '2026-11-14T00:00:00.000Z' })
  assert.equal(resolve(logged, newerTomb), newerTomb)
  const olderTomb = { ...newerTomb, hlc: stamp(T0 - 5) }
  assert.equal(resolve(logged, olderTomb), logged)
})

test('only moodLog has a resolve hook', () => {
  assert.deepEqual(ADAPTER_KEYS.filter((k) => typeof ADAPTERS[k].resolve === 'function'), ['moodLog'])
})
