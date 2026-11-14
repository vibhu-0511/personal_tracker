// Pure per-key adapters for sync v2: each of the 17 SYNCED_KEYS (src/store.js)
// maps a v1 blob to record entries and back. No I/O, no globals, no wiring into
// the live sync path (engine.js); the engine2 tasks call these.
//
// An entry is { collection, id, body, pos }, the payload half of a record
// (docs/plan/research/R6-sync-v2.sql). hlc, deviceId and deletedAt are added
// by the caller. Entry ids are exactly the ids forge_backfill() produces:
//
//   id-list (10)   notes expenses goals examNotes watchlist tasks reminders loans
//                  checklists habits: id = String(item.id), body = item, pos = (index + 1) * 1000.
//                  habits split `checkins[]` into collection habitCheckins,
//                  id = 'habitId:YYYY-MM-DD', body = { habitId, date }.
//   flat map (4)   progress examProgress puzzleProgress budgets: id = map key, body = value
//                  (a bare false or 0 is a value, not a delete).
//   by date (1)    moodLog: id = date, body = the { date, valence, source } entry.
//   leaf map (1)   investProgress { done, quiz, tasks, current }:
//                  'done:<id>' 'quiz:<id>' 'tasks:<id>' and 'current'.
//   doc (1)        settings: one entry, id '_'.
//
// fromEntries(key, entries) rebuilds the blob. Tombstones (body null or
// deletedAt set) and entries from other collections are ignored, so the
// engine can hand over a whole local collection. Lists come back ordered by
// pos (entries without a pos last, then by id); maps keep the order of the
// entries array.
//
// Normalisations, all mirroring forge_backfill() (the blob shape the app writes
// never hits them):
//  - list items without an id, and repeated ids (first wins), are dropped;
//  - a null map value is dropped (a null body would read as a tombstone);
//  - investProgress.current === null round-trips as null, any absent group as {};
//  - a habit comes back with `checkins` always an array (the app always writes one),
//    check-in dates are unique, and orphan check-ins (no live habit) are dropped.
//
// moodLog also exposes resolve(local, incoming): source 'logged' beats 'derived'
// regardless of hlc (otherwise two devices deriving the same date would
// overwrite a manual entry); everything else is decided by hlc via records.merge.

import { merge, isHlcFormat } from './records.js'

const POS_STEP = 1000

export const ID_LIST_KEYS = [
  'notes', 'expenses', 'goals', 'examNotes', 'watchlist',
  'tasks', 'reminders', 'loans', 'checklists', 'habits',
]
export const FLAT_MAP_KEYS = ['progress', 'examProgress', 'puzzleProgress', 'budgets']
export const INVEST_GROUPS = ['done', 'quiz', 'tasks']
export const HABIT_CHECKINS = 'habitCheckins'
export const SETTINGS_ID = '_'
export const CURRENT_ID = 'current'

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const hasId = (item) => isObj(item) && item.id != null && String(item.id) !== ''
const live = (e) => e != null && e.body != null && e.deletedAt == null

function entry(collection, id, body, pos = null) {
  return { collection, id, body, pos }
}

// Live entries of one collection.
function inCollection(entries, collection) {
  return (entries ?? []).filter((e) => e.collection === collection && live(e))
}

// Stable order: pos ascending, entries without a pos after those with one, then id.
function byPos(a, b) {
  const pa = a.pos ?? Infinity
  const pb = b.pos ?? Infinity
  if (pa !== pb) return pa < pb ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function seenOnce() {
  const seen = new Set()
  return (id) => {
    if (seen.has(id)) return false
    seen.add(id)
    return true
  }
}

// ---- id-list ---------------------------------------------------------------

function idListAdapter(key) {
  return {
    key,
    family: 'id-list',
    collections: [key],
    empty: () => [],
    toEntries(blob) {
      if (!Array.isArray(blob)) return []
      const first = seenOnce()
      const out = []
      blob.forEach((item, i) => {
        if (!hasId(item)) return
        const id = String(item.id)
        if (first(id)) out.push(entry(key, id, item, (i + 1) * POS_STEP))
      })
      return out
    },
    fromEntries(entries) {
      return inCollection(entries, key).sort(byPos).map((e) => e.body)
    },
  }
}

// ---- habits: the item plus one child record per check-in ---------------------

const habitsAdapter = {
  key: 'habits',
  family: 'id-list+child',
  collections: ['habits', HABIT_CHECKINS],
  empty: () => [],
  toEntries(blob) {
    if (!Array.isArray(blob)) return []
    const firstHabit = seenOnce()
    const firstCheckin = seenOnce()
    const habits = []
    const checkins = []
    blob.forEach((habit, i) => {
      if (!hasId(habit)) return
      const id = String(habit.id)
      if (!firstHabit(id)) return
      const { checkins: days, ...rest } = habit
      habits.push(entry('habits', id, rest, (i + 1) * POS_STEP))
      if (!Array.isArray(days)) return
      days.forEach((day, j) => {
        if (typeof day !== 'string' || day === '') return
        const cid = `${id}:${day}`
        // pos keeps the array order of check-ins; the SQL backfill leaves it null.
        if (firstCheckin(cid)) {
          checkins.push(entry(HABIT_CHECKINS, cid, { habitId: habit.id, date: day }, (j + 1) * POS_STEP))
        }
      })
    })
    return [...habits, ...checkins]
  },
  fromEntries(entries) {
    const habits = inCollection(entries, 'habits').sort(byPos)
    const byHabit = new Map(habits.map((h) => [h.id, []]))
    for (const c of inCollection(entries, HABIT_CHECKINS)) {
      const list = byHabit.get(String(c.body.habitId))
      if (list) list.push(c)
    }
    return habits.map((h) => ({
      ...h.body,
      checkins: byHabit.get(h.id).sort(byPos).map((c) => c.body.date),
    }))
  },
}

// ---- flat map ----------------------------------------------------------------

function flatMapAdapter(key) {
  return {
    key,
    family: 'flat-map',
    collections: [key],
    empty: () => ({}),
    toEntries(blob) {
      if (!isObj(blob)) return []
      return Object.entries(blob)
        .filter(([, value]) => value != null)
        .map(([id, value]) => entry(key, id, value))
    },
    fromEntries(entries) {
      const out = {}
      for (const e of inCollection(entries, key)) out[e.id] = e.body
      return out
    },
  }
}

// ---- moodLog: one record per date --------------------------------------------

// Local wins ties and malformed incoming stamps; 'logged' beats 'derived' first.
function resolveMood(local, incoming) {
  if (incoming == null) return local ?? null
  if (local == null) return incoming
  if (!isHlcFormat(incoming.hlc)) return local
  const l = live(local) ? local.body.source : null
  const i = live(incoming) ? incoming.body.source : null
  if (l === 'logged' && i === 'derived') return local
  if (l === 'derived' && i === 'logged') return incoming
  return merge(local, incoming)
}

const moodLogAdapter = {
  key: 'moodLog',
  family: 'by-date',
  collections: ['moodLog'],
  empty: () => [],
  toEntries(blob) {
    if (!Array.isArray(blob)) return []
    const first = seenOnce()
    const out = []
    blob.forEach((item, i) => {
      if (!isObj(item) || typeof item.date !== 'string' || item.date === '') return
      // pos keeps the array order (logManualMood re-appends a replaced date); SQL leaves it null.
      if (first(item.date)) out.push(entry('moodLog', item.date, item, (i + 1) * POS_STEP))
    })
    return out
  },
  fromEntries(entries) {
    return inCollection(entries, 'moodLog').sort(byPos).map((e) => e.body)
  },
  resolve: resolveMood,
}

// ---- investProgress: one record per leaf -------------------------------------

const investAdapter = {
  key: 'investProgress',
  family: 'leaf-map',
  collections: ['investProgress'],
  empty: () => ({ done: {}, quiz: {}, tasks: {}, current: null }),
  toEntries(blob) {
    if (!isObj(blob)) return []
    const out = []
    for (const group of INVEST_GROUPS) {
      const leaves = blob[group]
      if (!isObj(leaves)) continue
      for (const [k, value] of Object.entries(leaves)) {
        if (value != null) out.push(entry('investProgress', `${group}:${k}`, value))
      }
    }
    if (blob.current != null) out.push(entry('investProgress', CURRENT_ID, blob.current))
    return out
  },
  fromEntries(entries) {
    const out = { done: {}, quiz: {}, tasks: {}, current: null }
    for (const e of inCollection(entries, 'investProgress')) {
      if (e.id === CURRENT_ID) {
        out.current = e.body
        continue
      }
      const at = e.id.indexOf(':')
      const group = at < 0 ? '' : e.id.slice(0, at)
      if (INVEST_GROUPS.includes(group)) out[group][e.id.slice(at + 1)] = e.body
    }
    return out
  },
}

// ---- settings: a single document ---------------------------------------------

const settingsAdapter = {
  key: 'settings',
  family: 'doc',
  collections: ['settings'],
  empty: () => ({}),
  toEntries(blob) {
    return isObj(blob) ? [entry('settings', SETTINGS_ID, blob)] : []
  },
  fromEntries(entries) {
    const doc = inCollection(entries, 'settings').find((e) => e.id === SETTINGS_ID)
    return doc && isObj(doc.body) ? doc.body : {}
  },
}

// ---- registry ----------------------------------------------------------------

export const ADAPTERS = Object.freeze({
  settings: settingsAdapter,
  notes: idListAdapter('notes'),
  progress: flatMapAdapter('progress'),
  expenses: idListAdapter('expenses'),
  budgets: flatMapAdapter('budgets'),
  goals: idListAdapter('goals'),
  examProgress: flatMapAdapter('examProgress'),
  examNotes: idListAdapter('examNotes'),
  investProgress: investAdapter,
  watchlist: idListAdapter('watchlist'),
  tasks: idListAdapter('tasks'),
  reminders: idListAdapter('reminders'),
  habits: habitsAdapter,
  moodLog: moodLogAdapter,
  loans: idListAdapter('loans'),
  puzzleProgress: flatMapAdapter('puzzleProgress'),
  checklists: idListAdapter('checklists'),
})

// Must equal SYNCED_KEYS in src/store.js; test/syncAdapters.test.js enforces it.
export const ADAPTER_KEYS = Object.freeze(Object.keys(ADAPTERS))

// collection name -> the synced key that owns it ('habitCheckins' -> 'habits').
export const COLLECTION_TO_KEY = Object.freeze(
  Object.fromEntries(Object.values(ADAPTERS).flatMap((a) => a.collections.map((c) => [c, a.key]))),
)

export function adapterFor(key) {
  const adapter = Object.hasOwn(ADAPTERS, key) ? ADAPTERS[key] : null
  if (!adapter) throw new TypeError(`adapters: unknown synced key ${JSON.stringify(key)}`)
  return adapter
}

export const toEntries = (key, blob) => adapterFor(key).toEntries(blob)
export const fromEntries = (key, entries) => adapterFor(key).fromEntries(entries)
export const collectionsFor = (key) => [...adapterFor(key).collections]
export const emptyBlob = (key) => adapterFor(key).empty()
