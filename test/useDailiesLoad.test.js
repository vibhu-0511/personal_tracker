import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

// useDailies.js imports store.js (browser-only) and JSX, so bundle in memory with store.js stubbed.
const stub = {
  name: 'stub-store',
  setup(b) {
    b.onResolve({ filter: /store\.js$/ }, () => ({ path: 'store-stub', namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const f = () => {}; export const getHabits=f,getExpenses=f,getDailyLog=f,getMoodLog=f,getProgress=f,getPuzzleProgress=f,getSettings=f,getReminders=f,getTasks=f,getChecklists=f,saveChecklists=f,saveDailyLog=f,mutateHabits=f,mutateMoodLog=f,mutateReminders=f,mutateTasks=f',
      loader: 'js',
    }))
  },
}
const out = await build({
  stdin: { contents: "export * from './src/today/useDailies.js'", resolveDir: process.cwd(), loader: 'js' },
  bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node', plugins: [stub],
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
const { loadDailies, DAILIES_KEYS } = mod

const NOW = new Date(2026, 10, 15, 10, 0).getTime()

test('loader reads exactly the declared keys, once each', async () => {
  const calls = []
  const getters = Object.fromEntries(DAILIES_KEYS.map((k) => [k, async () => { calls.push(k); return k === 'habits' || k === 'expenses' || k === 'moodLog' || k === 'reminders' ? [] : {} }]))
  await loadDailies({ now: NOW, getters })
  assert.deepEqual([...calls].sort(), [...DAILIES_KEYS].sort())
  assert.deepEqual([...DAILIES_KEYS].sort(), ['dailyLog', 'expenses', 'habits', 'moodLog', 'progress', 'puzzleProgress', 'reminders', 'settings'])
})

test('result carries raw keys and the computed dailies', async () => {
  const getters = {
    habits: async () => [{ id: 'h', name: 'Run', checkins: ['2026-11-15'] }],
    expenses: async () => [],
    dailyLog: async () => ({ '2026-11-15': { noSpend: true } }),
    moodLog: async () => [],
    progress: async () => ({}),
    puzzleProgress: async () => ({}),
    settings: async () => ({}),
    reminders: async () => [{ id: 'r', title: 'x', at: NOW, done: false }],
  }
  const res = await loadDailies({ now: NOW, getters })
  for (const k of DAILIES_KEYS) assert.ok(k in res, k)
  assert.equal(res.reminders.length, 1)
  assert.deepEqual(res.dailies.items.map((d) => d.id), ['habits', 'spend', 'mood', 'code', 'puzzle'])
  assert.equal(res.dailies.items[0].done, true)
  assert.equal(res.dailies.items[1].done, true)
  assert.equal(res.dailies.total, 5)
  assert.equal(res.dailies.done, 2)
})

test('settings.dailies narrows which dailies count', async () => {
  const empty = { habits: [], expenses: [], moodLog: [], reminders: [] }
  const getters = Object.fromEntries(DAILIES_KEYS.map((k) => [k, async () => (k === 'settings' ? { dailies: ['mood', 'code'] } : empty[k] ?? {})]))
  const res = await loadDailies({ now: NOW, getters })
  assert.equal(res.dailies.total, 2)
})
