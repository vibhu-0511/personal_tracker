import test from 'node:test'
import assert from 'node:assert/strict'
import {
  loadLogicTileData, rememberCfRating, readCfRating, CF_RATING_KEY, DSA_SUMMARY_KEY,
} from '../src/logic/tileData.js'
import { EXAMS } from '../src/logic/examData.js'
import { examTopicKey } from '../src/logic/stats.js'

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()
const NOW = at(2026, 11, 13)
const solved = (updatedAt) => ({ status: 'solved', tags: [], updatedAt })

function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
  }
}
const blockedStorage = {
  getItem() { throw new Error('blocked') },
  setItem() { throw new Error('blocked') },
}

const getters = (over = {}) => ({
  getProgress: async () => ({ a: solved(NOW), b: solved(NOW - 1000), c: solved(at(2026, 11, 12)) }),
  getPuzzleProgress: async () => ({ p1: true, p2: false, p3: true }),
  getExamProgress: async () => ({}),
  getSettings: async () => ({}),
  loadPuzzles: async () => [{}, {}, {}, {}],
  now: NOW,
  ...over,
})

test('loadLogicTileData assembles every tile field from injected getters', async () => {
  const ex = EXAMS[0]
  const sec = ex.sections[0]
  const storage = fakeStorage({
    [CF_RATING_KEY]: '1432',
    [DSA_SUMMARY_KEY]: JSON.stringify({ done: 40, total: 610, tabs: {}, at: 1 }),
  })
  const data = await loadLogicTileData(getters({
    storage,
    getSettings: async () => ({ dailyCodeGoal: 4 }),
    getExamProgress: async () => ({ [examTopicKey(ex.id, sec.name, sec.topics[0])]: true }),
  }))
  assert.deepEqual(data.codeRing, { done: 2, goal: 4, pct: 0.5 })
  assert.deepEqual(data.codeStreak, { current: 2, best: 2 })
  assert.equal(data.cfRating, 1432)
  assert.deepEqual(data.puzzles, { solved: 2, total: 4 })
  assert.ok(data.exams.pct >= 0 && data.exams.pct <= 100)
  assert.deepEqual(data.dsa, { done: 40, total: 610 })
})

test('goal defaults to 3 when settings.dailyCodeGoal is missing or invalid', async () => {
  for (const s of [{}, { dailyCodeGoal: 0 }, { dailyCodeGoal: 'x' }, { dailyCodeGoal: -2 }]) {
    const d = await loadLogicTileData(getters({ storage: fakeStorage(), getSettings: async () => s }))
    assert.equal(d.codeRing.goal, 3)
  }
})

test('dsa is null when dsa_summary is missing or corrupt', async () => {
  const bad = [undefined, 'not json', 'null', '[]', '{}', '{"done":"1","total":5}', '{"done":1,"total":0}', '{"done":-1,"total":5}']
  for (const raw of bad) {
    const storage = fakeStorage(raw === undefined ? {} : { [DSA_SUMMARY_KEY]: raw })
    const d = await loadLogicTileData(getters({ storage }))
    assert.equal(d.dsa, null, String(raw))
  }
  const d = await loadLogicTileData(getters({ storage: blockedStorage }))
  assert.equal(d.dsa, null)
  assert.equal(d.cfRating, null)
})

test('cfRating is null when nothing cached or the cache is corrupt', async () => {
  assert.equal((await loadLogicTileData(getters({ storage: fakeStorage() }))).cfRating, null)
  assert.equal((await loadLogicTileData(getters({ storage: fakeStorage({ [CF_RATING_KEY]: 'abc' }) }))).cfRating, null)
  assert.equal((await loadLogicTileData(getters({ storage: fakeStorage({ [CF_RATING_KEY]: '0' }) }))).cfRating, null)
})

test('rememberCfRating round-trips through storage', async () => {
  const storage = fakeStorage()
  assert.equal(rememberCfRating(1650, storage), true)
  assert.equal(readCfRating(storage), 1650)
  assert.equal((await loadLogicTileData(getters({ storage }))).cfRating, 1650)
  assert.equal(rememberCfRating('1700', storage), true)
  assert.equal(readCfRating(storage), 1700)
})

test('rememberCfRating ignores bad ratings and never throws on blocked storage', () => {
  const storage = fakeStorage()
  for (const bad of [null, undefined, '', 'x', NaN, 0, -5]) {
    assert.equal(rememberCfRating(bad, storage), false)
  }
  assert.equal(readCfRating(storage), null)
  assert.doesNotThrow(() => rememberCfRating(1500, blockedStorage))
  assert.equal(rememberCfRating(1500, blockedStorage), false)
  assert.doesNotThrow(() => rememberCfRating(1500, null))
})

test('a failing getter degrades that part instead of rejecting', async () => {
  const d = await loadLogicTileData(getters({
    storage: fakeStorage(),
    getPuzzleProgress: async () => { throw new Error('boom') },
    loadPuzzles: async () => { throw new Error('offline') },
  }))
  assert.deepEqual(d.puzzles, { solved: 0, total: 0 })
  assert.equal(d.codeRing.done, 2)
})
