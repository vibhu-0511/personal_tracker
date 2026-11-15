// Capture submit: maps a parsed draft (src/capture/parse.js) to store changes.
// Pure and storage-free: it never imports the store or the sync layer. The caller
// passes `writers`, one per data key, each `(updater) => Promise`, where updater is
// `(prev) => next`. In the app these are the existing providers' write paths
// (persistExpenses, updateTasks, updateReminders, updateHabits, updateMoodLog ...),
// so serialisation, updatedAt stamping and sync flags stay with them.
//
// writers keys: expenses, notes, tasks, reminders, habits, moodLog,
//               dailyLog (object), progress (code problems, object).
//
// Record shapes match what the existing screens create:
//   expense/income  AddTxnSheet      { id, amount, category, note, date(ms), type, person }
//   note            Notes.jsx        { id, createdAt, body, tags, pinned, color, parentId }
//   task            Tasks.jsx        { id, title, due, dueAt, done, doneAt, createdAt, urgent, important }
//   reminder        Reminders.jsx    { id, title, at, done, createdAt } (+ repeat when not "never")
//   habit check-in  Habits.jsx       habit.checkins gains today's dateKey
//   mood            logManualMood    { date, valence, source: 'logged' }
//   solve           markProblem      progress[id] = { status: 'solved', tags, updatedAt }
//   daily puzzle    Puzzles.jsx      dailyLog[dayKey].puzzle = true
import { newId as defaultNewId } from '../id.js'
import { dateKey, logManualMood, MANUAL_MOODS } from '../life/logic.js'
import { normalizeRepeat } from '../life/reminderLogic.js'
import { dayKey } from '../logic/puzzleProgress.js'
import { MAX_AMOUNT, CAT_MAP } from '../money/categories.js'

export const MSG = {
  amount: 'Enter an amount',
  category: 'Pick a category',
  text: 'Write something first',
  habit: 'Pick a habit',
  checkedIn: 'Already checked in today',
  mood: 'Pick a mood',
  type: 'Unknown type',
}

const MOOD_VALUES = new Set(MANUAL_MOODS.map((m) => m.value))

class SubmitError extends Error {}
const fail = (message) => { throw new SubmitError(message) }

function isValidAmount(val) {
  return Number.isFinite(val) && val > 0 && val <= MAX_AMOUNT
}

function dayWithClock(key, now) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).getTime()
}

function text(draft) {
  return typeof draft?.title === 'string' ? draft.title.trim() : ''
}

// Each change: { key, apply(prev) -> next, restore(latest) -> next }.
// apply may capture what it replaced; restore puts only that back into the latest value.
function expenseChanges(draft, { now, newId }) {
  const income = draft.txnType === 'income'
  const amount = Number(draft.amount)
  if (!isValidAmount(amount)) fail(MSG.amount)
  if (!income && !(draft.category && CAT_MAP[draft.category])) fail(MSG.category)
  const when = draft.at instanceof Date
    ? draft.at.getTime()
    : draft.date ? dayWithClock(draft.date, now) : now.getTime()
  const record = {
    id: newId(),
    amount,
    category: income ? 'income' : draft.category,
    note: text(draft),
    date: when,
    type: income ? 'income' : 'expense',
    person: (typeof draft.person === 'string' && draft.person.trim()) || undefined,
  }
  const day = dateKey(new Date(when))
  let droppedNoSpend = false
  return [
    {
      key: 'expenses',
      apply: (prev) => [record, ...(prev || [])],
      restore: (latest) => (latest || []).filter((e) => e.id !== record.id),
    },
    {
      // Same rule as MoneyContext.persistExpenses: a new transaction clears that day's no-spend mark.
      key: 'dailyLog',
      optional: true,
      apply: (prev) => {
        const log = prev || {}
        if (!log[day] || !log[day].noSpend) return prev
        droppedNoSpend = true
        const { noSpend: _drop, ...rest } = log[day]
        return { ...log, [day]: rest }
      },
      restore: (latest) => {
        if (!droppedNoSpend) return latest
        const log = latest || {}
        return { ...log, [day]: { ...(log[day] || {}), noSpend: true } }
      },
    },
  ]
}

function noteChanges(draft, { now, newId }) {
  const body = text(draft)
  if (!body) fail(MSG.text)
  const record = {
    id: newId(), createdAt: now.getTime(), body, tags: [], pinned: false, color: '', parentId: null,
  }
  return [{
    key: 'notes',
    apply: (prev) => [record, ...(prev || [])],
    restore: (latest) => (latest || []).filter((n) => n.id !== record.id),
  }]
}

function reminderChanges(draft, { now, newId }) {
  const title = text(draft)
  if (!title) fail(MSG.text)
  let at
  if (draft.at instanceof Date) at = draft.at.getTime()
  else if (draft.date) {
    const [y, m, d] = draft.date.split('-').map(Number)
    at = new Date(y, m - 1, d, 9, 0).getTime()
  } else at = now.getTime() + 3_600_000
  const record = { id: newId(), title, at, done: false, createdAt: now.getTime() }
  const repeat = normalizeRepeat(draft.repeat)
  if (repeat.type !== 'none') record.repeat = repeat
  return [{
    key: 'reminders',
    apply: (prev) => [...(prev || []), record].sort((a, b) => a.at - b.at),
    restore: (latest) => (latest || []).filter((r) => r.id !== record.id),
  }]
}

function taskChanges(draft, { now, newId }) {
  const title = text(draft)
  if (!title) fail(MSG.text)
  const record = {
    id: newId(),
    title,
    due: draft.date || null,
    dueAt: draft.at instanceof Date ? draft.at.getTime() : null,
    done: false,
    doneAt: null,
    createdAt: now.getTime(),
    urgent: false,
    important: false,
  }
  return [{
    key: 'tasks',
    apply: (prev) => [record, ...(prev || [])],
    restore: (latest) => (latest || []).filter((t) => t.id !== record.id),
  }]
}

function habitChanges(draft, { now }) {
  const today = dateKey(now)
  const find = (list) => {
    const wanted = typeof draft.habitId === 'string' ? draft.habitId : null
    const name = text(draft).toLowerCase()
    return (list || []).find((h) => (wanted ? h.id === wanted : name && String(h.name).toLowerCase() === name))
  }
  let added = false
  let habitId = null
  return [{
    key: 'habits',
    apply: (prev) => {
      const habit = find(prev)
      if (!habit) fail(MSG.habit)
      if ((habit.checkins || []).includes(today)) fail(MSG.checkedIn)
      added = true
      habitId = habit.id
      return prev.map((h) => (h.id === habit.id ? { ...h, checkins: [...(h.checkins || []), today] } : h))
    },
    restore: (latest) => {
      if (!added) return latest
      return (latest || []).map((h) => (
        h.id === habitId ? { ...h, checkins: (h.checkins || []).filter((c) => c !== today) } : h
      ))
    },
  }]
}

function moodChanges(draft, { now }) {
  const valence = draft.mood
  if (!MOOD_VALUES.has(valence)) fail(MSG.mood)
  const today = dateKey(now)
  let before
  let had = false
  return [{
    key: 'moodLog',
    apply: (prev) => {
      const log = prev || []
      before = log.find((e) => e.date === today)
      had = Boolean(before)
      return logManualMood(log, now, valence)
    },
    restore: (latest) => {
      const rest = (latest || []).filter((e) => e.date !== today)
      return had ? [...rest, before] : rest
    },
  }]
}

// Sets map[id] and remembers what was there, so restore can put it back or remove it.
function mapEntryChange(key, id, makeEntry) {
  let before
  let had = false
  return {
    key,
    apply: (prev) => {
      const map = prev && typeof prev === 'object' ? prev : {}
      had = Object.prototype.hasOwnProperty.call(map, id)
      before = map[id]
      return { ...map, [id]: makeEntry(before) }
    },
    restore: (latest) => {
      const map = { ...(latest || {}) }
      if (had) map[id] = before
      else delete map[id]
      return map
    },
  }
}

function solveChanges(draft, { now, newId }) {
  if (draft.puzzle === true) {
    // "Daily puzzle done": the same dailyLog mark the Puzzles tab sets.
    return [mapEntryChange('dailyLog', dayKey(now.getTime()), (cur) => ({ ...(cur || {}), puzzle: true }))]
  }
  // "Solved a problem": a solved entry in code progress (store.markProblem shape).
  const p = draft.problem || {}
  const id = p.id ? `${p.platform ? `${p.platform}:` : ''}${p.id}` : `capture:${newId()}`
  return [mapEntryChange('progress', id, (cur) => ({
    status: 'solved', tags: cur?.tags || [], updatedAt: now.getTime(),
  }))]
}

const BUILDERS = {
  expense: expenseChanges,
  note: noteChanges,
  reminder: reminderChanges,
  task: taskChanges,
  habit: habitChanges,
  solve: solveChanges,
  mood: moodChanges,
}

// planSubmit(draft, { now?, newId? }) -> { ok: true, changes } | { ok: false, error }
// Validates the draft and builds the changes; nothing is written.
export function planSubmit(draft, opts = {}) {
  const ctx = { now: opts.now instanceof Date ? opts.now : new Date(), newId: opts.newId || defaultNewId }
  const build = BUILDERS[draft?.type]
  if (!build) return { ok: false, error: MSG.type }
  try {
    return { ok: true, changes: build(draft, ctx) }
  } catch (err) {
    if (err instanceof SubmitError) return { ok: false, error: err.message }
    throw err
  }
}

// submitDraft(draft, writers, opts) -> Promise<{ ok: true, undo } | { ok: false, error }>
// Applies each change through writers[key]. If a write fails, the ones already applied
// are rolled back and { ok: false, error } is returned (the sheet keeps its text).
// undo() puts the new records back out through the same writers and resolves true.
export async function submitDraft(draft, writers, opts = {}) {
  const plan = planSubmit(draft, opts)
  if (!plan.ok) return plan
  const done = []
  const rollback = async (list) => {
    for (const c of [...list].reverse()) await writers[c.key](c.restore)
  }
  try {
    for (const c of plan.changes) {
      const write = writers?.[c.key]
      if (!write) {
        if (c.optional) continue
        throw new Error(`No writer for ${c.key}`)
      }
      await write(c.apply)
      done.push(c)
    }
  } catch (err) {
    try { await rollback(done) } catch { /* keep the original error */ }
    return { ok: false, error: err instanceof SubmitError ? err.message : err?.message || 'Could not save' }
  }
  let undone = false
  const undo = async () => {
    if (undone) return false
    undone = true
    await rollback(done)
    return true
  }
  return { ok: true, undo }
}
