// Pure Today timeline: merges today's reminders, timed tasks, expenses and notes in time
// order with one "now" marker, picks the next-up item and lists overdue items. No DOM,
// no storage, no mutation of inputs.
//
// Input shapes (epoch ms for every time):
//   reminders: { id, title, at, done, repeat? }
//   tasks:     { id, title, due: 'YYYY-MM-DD'|null, dueAt: ms|null, done }
//   expenses:  { id, amount, date, category, type? }   (type 'income' is skipped)
//   notes:     { id, body?, text?, title?, createdAt }
//              The app stores note text in `body` (Notes.jsx); `text` is a legacy fallback.
//              Row title: `title` if present, else the first line of `body ?? text`.
//
// buildTimeline({ reminders, tasks, expenses, notes }, now) ->
//   items:  [{ kind, id, at, title, done?, ... }] for today, ascending by time, with exactly
//           one { kind: 'now', at } marker. kind is 'reminder'|'task'|'expense'|'note'|'now'.
//           Items at or before now sit above the marker; later ones below. Done items stay.
//   nextUp: the earliest open reminder or timed task strictly after now, or null.
//   overdue: open reminders and tasks from before today, oldest first. A task with a time
//           uses dueAt; a task with only a due day counts from that day's midnight.
//           Open items earlier today stay in `items` (above the marker), not here.

import { deriveNoteTitle } from '../life/noteTitle.js'

const KIND_ORDER = { reminder: 0, task: 1, expense: 2, note: 3, now: 4 }

function toMs(now) {
  return now instanceof Date ? now.getTime() : now
}

function dayStart(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayEnd(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
}

function keyToMs(key) {
  const [y, m, d] = String(key).split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function byTime(a, b) {
  return a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || String(a.id).localeCompare(String(b.id))
}

function reminderItem(r) {
  return { kind: 'reminder', id: r.id, at: r.at, title: r.title ?? '', done: Boolean(r.done), repeat: r.repeat }
}

function taskItem(t, at) {
  return { kind: 'task', id: t.id, at, title: t.title ?? '', done: Boolean(t.done) }
}

export function buildTimeline({ reminders, tasks, expenses, notes } = {}, now) {
  const nowMs = toMs(now)
  const start = dayStart(nowMs)
  const end = dayEnd(nowMs)
  const inToday = (ms) => isNum(ms) && ms >= start && ms < end

  const rs = reminders || []
  const ts = tasks || []
  const es = expenses || []
  const ns = notes || []

  const items = []
  for (const r of rs) if (inToday(r.at)) items.push(reminderItem(r))
  for (const t of ts) if (inToday(t.dueAt)) items.push(taskItem(t, t.dueAt))
  for (const e of es) {
    if (e.type === 'income' || !inToday(e.date)) continue
    items.push({ kind: 'expense', id: e.id, at: e.date, amount: e.amount, category: e.category })
  }
  for (const n of ns) {
    if (!inToday(n.createdAt)) continue
    const title = n.title || deriveNoteTitle(n.body ?? n.text).title
    items.push({ kind: 'note', id: n.id, at: n.createdAt, title })
  }
  items.sort(byTime)

  const marker = { kind: 'now', id: 'now', at: nowMs }
  let split = items.findIndex((it) => it.at > nowMs)
  if (split === -1) split = items.length
  items.splice(split, 0, marker)

  const nextUp =
    items.find((it) => (it.kind === 'reminder' || it.kind === 'task') && !it.done && it.at > nowMs) ?? null

  const overdue = []
  for (const r of rs) if (!r.done && isNum(r.at) && r.at < start) overdue.push(reminderItem(r))
  for (const t of ts) {
    if (t.done) continue
    if (isNum(t.dueAt)) {
      if (t.dueAt < start) overdue.push(taskItem(t, t.dueAt))
    } else if (t.due) {
      const at = keyToMs(t.due)
      if (at < start) overdue.push(taskItem(t, at))
    }
  }
  overdue.sort(byTime)

  return { items, nextUp, overdue }
}
