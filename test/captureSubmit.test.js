import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCapture } from '../src/capture/parse.js'
import { submitDraft, planSubmit } from '../src/capture/submit.js'

// Sunday 15 Nov 2026, 12:00 local.
const NOW = new Date(2026, 10, 15, 12, 0)
let n = 0
const newId = () => `id${++n}`

// In-memory writers: same (updater) => Promise contract as the providers.
function world(initial = {}) {
  const state = {
    expenses: [], notes: [], tasks: [], reminders: [], habits: [], moodLog: [], dailyLog: {}, progress: {},
    ...initial,
  }
  const writers = {}
  for (const k of Object.keys(state)) {
    writers[k] = async (fn) => { state[k] = fn(state[k]); return state[k] }
  }
  return { state, writers }
}

const opts = { now: NOW, newId }

test('expense: same record shape as the add sheet, undo removes it', async () => {
  const { state, writers } = world({ expenses: [{ id: 'old' }] })
  const res = await submitDraft(parseCapture('450 coffee with raj', NOW), writers, opts)
  assert.equal(res.ok, true)
  assert.equal(typeof res.undo, 'function')
  assert.deepEqual(state.expenses[0], {
    id: 'id1', amount: 450, category: 'coffee', note: 'coffee',
    date: new Date(2026, 10, 15, 12, 0, 0).getTime(), type: 'expense', person: 'Raj',
  })
  assert.equal(state.expenses[1].id, 'old')
  assert.equal(await res.undo(), true)
  assert.deepEqual(state.expenses, [{ id: 'old' }])
})

test('expense without a category is rejected with "Pick a category"', async () => {
  const { state, writers } = world()
  const draft = parseCapture('450 stuff', NOW, { type: 'expense' })
  assert.equal(draft.category, null)
  const res = await submitDraft(draft, writers, opts)
  assert.deepEqual(res, { ok: false, error: 'Pick a category' })
  assert.deepEqual(state.expenses, [])
})

test('expense without an amount is rejected', async () => {
  const { writers } = world()
  const res = await submitDraft(parseCapture('coffee', NOW, { type: 'expense' }), writers, opts)
  assert.equal(res.ok, false)
  assert.equal(res.error, 'Enter an amount')
})

test('income needs no category and is stored as category income', async () => {
  const { state, writers } = world()
  const draft = { ...parseCapture('5000 salary', NOW, { type: 'expense' }), txnType: 'income' }
  const res = await submitDraft(draft, writers, opts)
  assert.equal(res.ok, true)
  assert.equal(state.expenses[0].type, 'income')
  assert.equal(state.expenses[0].category, 'income')
  assert.equal(state.expenses[0].amount, 5000)
})

test('expense clears a no-spend mark on its day and undo restores it', async () => {
  const { state, writers } = world({ dailyLog: { '2026-11-15': { noSpend: true }, '2026-11-14': { noSpend: true } } })
  const res = await submitDraft(parseCapture('450 coffee', NOW), writers, opts)
  assert.deepEqual(state.dailyLog['2026-11-15'], {})
  assert.deepEqual(state.dailyLog['2026-11-14'], { noSpend: true })
  await res.undo()
  assert.deepEqual(state.dailyLog['2026-11-15'], { noSpend: true })
})

test('note: same record shape as the Notes screen', async () => {
  const { state, writers } = world()
  const res = await submitDraft(parseCapture('buy a gift idea', NOW, { type: 'note' }), writers, opts)
  assert.equal(res.ok, true)
  assert.deepEqual(state.notes[0], {
    id: 'id' + n, createdAt: NOW.getTime(), body: 'buy a gift idea', tags: [], pinned: false, color: '', parentId: null,
  })
  await res.undo()
  assert.deepEqual(state.notes, [])
})

test('empty note is rejected', async () => {
  const { writers } = world()
  const res = await submitDraft(parseCapture('   ', NOW, { type: 'note' }), writers, opts)
  assert.equal(res.ok, false)
})

test('reminder: call mom tomorrow 6pm', async () => {
  const { state, writers } = world({ reminders: [{ id: 'later', at: new Date(2030, 0, 1).getTime() }] })
  const res = await submitDraft(parseCapture('call mom tomorrow 6pm', NOW), writers, opts)
  assert.equal(res.ok, true)
  const r = state.reminders[0]
  assert.equal(r.title, 'call mom')
  assert.equal(r.at, new Date(2026, 10, 16, 18, 0).getTime())
  assert.equal(r.done, false)
  assert.equal(r.createdAt, NOW.getTime())
  assert.equal('repeat' in r, false)
  assert.equal(state.reminders[1].id, 'later')
  await res.undo()
  assert.deepEqual(state.reminders.map((x) => x.id), ['later'])
})

test('reminder: repeat is kept in the normalized form, date-only defaults to 9 AM', async () => {
  const { state, writers } = world()
  await submitDraft(parseCapture('remind me to stretch every day', NOW), writers, opts)
  assert.deepEqual(state.reminders[0].repeat, { type: 'daily' })
  const w2 = world()
  await submitDraft(parseCapture('pay rent tomorrow', NOW, { type: 'reminder' }), w2.writers, opts)
  assert.equal(w2.state.reminders[0].at, new Date(2026, 10, 16, 9, 0).getTime())
})

test('task: same record shape as the Tasks screen, new task first', async () => {
  const { state, writers } = world({ tasks: [{ id: 'old' }] })
  const res = await submitDraft(parseCapture('file taxes tomorrow', NOW, { type: 'task' }), writers, opts)
  assert.equal(res.ok, true)
  assert.deepEqual(state.tasks[0], {
    id: 'id' + n, title: 'file taxes', due: '2026-11-16', dueAt: null, done: false, doneAt: null,
    createdAt: NOW.getTime(), urgent: false, important: false,
  })
  assert.equal(state.tasks[1].id, 'old')
  await res.undo()
  assert.deepEqual(state.tasks, [{ id: 'old' }])
})

test('habit: check-in adds today, undo removes only that', async () => {
  const habits = [
    { id: 'h1', name: 'Run', checkins: ['2026-11-14'] },
    { id: 'h2', name: 'Read', checkins: [] },
  ]
  const { state, writers } = world({ habits })
  const res = await submitDraft({ ...parseCapture('', NOW, { type: 'habit' }), habitId: 'h1' }, writers, opts)
  assert.equal(res.ok, true)
  assert.deepEqual(state.habits[0].checkins, ['2026-11-14', '2026-11-15'])
  assert.deepEqual(state.habits[1].checkins, [])
  await res.undo()
  assert.deepEqual(state.habits[0].checkins, ['2026-11-14'])
})

test('habit: by name, unknown and already checked in are rejected, state untouched', async () => {
  const { state, writers } = world({ habits: [{ id: 'h1', name: 'Run', checkins: ['2026-11-15'] }] })
  const dup = await submitDraft(parseCapture('habit run', NOW), writers, opts)
  assert.deepEqual(dup, { ok: false, error: 'Already checked in today' })
  const none = await submitDraft(parseCapture('habit swim', NOW), writers, opts)
  assert.deepEqual(none, { ok: false, error: 'Pick a habit' })
  assert.deepEqual(state.habits[0].checkins, ['2026-11-15'])
})

test('mood: logged entry replaces the derived one, undo brings it back', async () => {
  const derived = { date: '2026-11-15', valence: 50, source: 'derived' }
  const { state, writers } = world({ moodLog: [{ date: '2026-11-14', valence: 25, source: 'logged' }, derived] })
  const res = await submitDraft(parseCapture('feeling great', NOW), writers, opts)
  assert.equal(res.ok, true)
  assert.deepEqual(state.moodLog.find((e) => e.date === '2026-11-15'), { date: '2026-11-15', valence: 100, source: 'logged' })
  await res.undo()
  assert.deepEqual(state.moodLog.find((e) => e.date === '2026-11-15'), derived)
})

test('mood: no mood chosen is rejected', async () => {
  const { writers } = world()
  const res = await submitDraft(parseCapture('how are things', NOW, { type: 'mood' }), writers, opts)
  assert.deepEqual(res, { ok: false, error: 'Pick a mood' })
})

test('solve: a problem becomes a solved progress entry, undo removes it', async () => {
  const { state, writers } = world()
  const res = await submitDraft(parseCapture('solved cf 1700A', NOW), writers, opts)
  assert.equal(res.ok, true)
  assert.deepEqual(state.progress['codeforces:1700A'], { status: 'solved', tags: [], updatedAt: NOW.getTime() })
  await res.undo()
  assert.deepEqual(state.progress, {})
})

test('solve: daily puzzle sets the dailyLog puzzle mark, undo clears it', async () => {
  const { state, writers } = world({ dailyLog: { '2026-11-15': { noSpend: true } } })
  const res = await submitDraft({ ...parseCapture('', NOW, { type: 'solve' }), puzzle: true }, writers, opts)
  assert.deepEqual(state.dailyLog['2026-11-15'], { noSpend: true, puzzle: true })
  await res.undo()
  assert.deepEqual(state.dailyLog['2026-11-15'], { noSpend: true })
})

test('every successful submit returns an undo function, and undo runs once', async () => {
  const drafts = [
    parseCapture('450 coffee', NOW), parseCapture('hello', NOW, { type: 'note' }),
    parseCapture('call mom tomorrow 6pm', NOW), parseCapture('x', NOW, { type: 'task' }),
    parseCapture('felt good', NOW), parseCapture('solved lc 1', NOW),
  ]
  for (const d of drafts) {
    const { writers } = world()
    const res = await submitDraft(d, writers, opts)
    assert.equal(res.ok, true, d.type)
    assert.equal(typeof res.undo, 'function', d.type)
    assert.equal(await res.undo(), true)
    assert.equal(await res.undo(), false)
  }
})

test('a failing write rolls back earlier writes and reports the error', async () => {
  const { state, writers } = world({ dailyLog: { '2026-11-15': { noSpend: true } } })
  // dailyLog is written second; make expenses succeed then dailyLog fail.
  writers.dailyLog = async () => { throw new Error('disk full') }
  const res = await submitDraft(parseCapture('450 coffee', NOW), writers, opts)
  assert.deepEqual(res, { ok: false, error: 'disk full' })
  assert.deepEqual(state.expenses, [])
})

test('planSubmit validates without writing; unknown type is rejected', () => {
  assert.equal(planSubmit({ type: 'nope' }).ok, false)
  const plan = planSubmit(parseCapture('450 coffee', NOW), opts)
  assert.equal(plan.ok, true)
  assert.equal(plan.changes[0].key, 'expenses')
})
