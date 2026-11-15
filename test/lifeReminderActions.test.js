import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

// LifeData.jsx is JSX and imports store.js (browser-only), so bundle it in memory
// with store.js stubbed out.
const stub = {
  name: 'stub-store',
  setup(b) {
    b.onResolve({ filter: /store\.js$/ }, () => ({ path: 'store-stub', namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'const f = () => {}; export const getTasks=f,getReminders=f,getHabits=f,getMoodLog=f,getChecklists=f,saveChecklists=f,mutateTasks=f,mutateReminders=f,mutateHabits=f,mutateMoodLog=f',
      loader: 'js',
    }))
  },
}
const out = await build({
  stdin: {
    contents: "export * from './src/life/LifeData.jsx'; export { onToastsChange, dismissToast } from './src/toast.js'",
    resolveDir: process.cwd(), loader: 'js',
  },
  bundle: true, write: false, format: 'esm',
  jsx: 'automatic', platform: 'node', plugins: [stub],
})
const url = 'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
const { reminderAction, runReminderAction, withUpdatedAt, onToastsChange, dismissToast } = await import(url)

const NOW = new Date(2026, 5, 10, 10, 0).getTime()
const at = new Date(2026, 5, 10, 9, 0).getTime()
const base = () => [
  { id: 'a', title: 'one-off', at, done: false, updatedAt: 1 },
  { id: 'b', title: 'daily', at, done: false, repeat: 'daily', updatedAt: 1 },
  { id: 'c', title: 'other', at, done: false, updatedAt: 1 },
]

// Minimal store: updateReminders applies withUpdatedAt like the provider does.
function makeStore(list, stampAt) {
  const s = { list }
  s.update = (change) => {
    s.list = withUpdatedAt(change, stampAt())(s.list)
    return Promise.resolve(s.list)
  }
  return s
}

test('each action stamps updatedAt and leaves other reminders untouched', async () => {
  for (const [action, arg] of [['snooze', '1h'], ['reschedule', NOW + 5000], ['repeat', 'weekly'], ['complete']]) {
    const s = makeStore(base(), () => 500)
    const orig = s.list
    await runReminderAction(s.update, 'a', action, arg, NOW)
    assert.equal(s.list.find((r) => r.id === 'a').updatedAt, 500, action)
    assert.equal(s.list.find((r) => r.id === 'c'), orig[2], action)
  }
})

test('snooze, reschedule, repeat change the right fields', () => {
  const sn = reminderAction(base(), 'a', 'snooze', '1h', NOW).next[0]
  assert.equal(sn.at, NOW + 3_600_000)
  assert.equal(sn.snoozedFrom, at)
  const rs = reminderAction(sn ? [sn] : [], 'a', 'reschedule', NOW + 1).next[0]
  assert.equal(rs.at, NOW + 1)
  assert.equal(rs.snoozedFrom, undefined)
  const rp = reminderAction(base(), 'a', 'repeat', { type: 'weekly', days: [3, 1] }, NOW).next[0]
  assert.deepEqual(rp.repeat, { type: 'weekly', days: [1, 3] })
  assert.equal('repeat' in reminderAction(base(), 'b', 'repeat', 'none', NOW).next[1], false)
})

test('completing a one-off marks it done and spawns nothing', () => {
  const { next } = reminderAction(base(), 'a', 'complete', undefined, NOW)
  assert.equal(next.length, 3)
  assert.equal(next[0].done, true)
})

test('completing a repeating reminder creates the next one exactly once', async () => {
  const s = makeStore(base(), () => 700)
  await runReminderAction(s.update, 'b', 'complete', undefined, NOW)
  await runReminderAction(s.update, 'b', 'complete', undefined, NOW) // double tap
  assert.equal(s.list.length, 4)
  const done = s.list.find((r) => r.id === 'b')
  const nxt = s.list.find((r) => r.repeatedFrom === 'b')
  assert.equal(done.done, true)
  assert.equal(done.nextId, nxt.id)
  assert.equal(nxt.done, false)
  assert.equal(nxt.repeat, 'daily')
  assert.equal(nxt.at, new Date(2026, 5, 11, 9, 0).getTime())
  assert.equal(nxt.updatedAt, 700)
})

test('every action is undoable and keeps reminders added in between', () => {
  const cases = [['a', 'snooze', '1h'], ['a', 'reschedule', NOW + 9], ['b', 'repeat', 'weekly'], ['b', 'complete'], ['a', 'complete']]
  for (const [id, action, arg] of cases) {
    const list = base()
    const { next, restore } = reminderAction(list, id, action, arg, NOW)
    assert.notDeepEqual(next, list, action)
    const added = { id: 'late', title: 'added later', at, done: false }
    assert.deepEqual(restore([...next, added]), [...list, added], `${id} ${action}`)
  }
})

test('runReminderAction offers an undo toast that restores the list', async () => {
  let seen = []
  const off = onToastsChange((t) => { seen = t })
  const s = makeStore(base(), () => 900)
  await runReminderAction(s.update, 'b', 'complete', undefined, NOW)
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(s.list.length, 4)
  await seen[seen.length - 1].undo()
  assert.equal(s.list.length, 3)
  assert.equal(s.list.find((r) => r.id === 'b').done, false)
  assert.equal(s.list.find((r) => r.id === 'b').updatedAt, 900)
  off()
})

test.after(() => {
  let all = []
  onToastsChange((t) => { all = t })()
  all.forEach((t) => dismissToast(t.id))
})
