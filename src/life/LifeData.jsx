import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  getTasks, getReminders, getHabits, getMoodLog, getChecklists, saveChecklists,
  mutateTasks, mutateReminders, mutateHabits, mutateMoodLog,
} from '../store.js'
import { dateKey, ensureTodayEntry } from './logic.js'
import { dueCounts, walletTotal as sumWallet } from './selectors.js'
import { stampUpdated } from './records.js'

// Single writer for the Life arrays (tasks, reminders, habits, moodLog).
//
// - Every write goes through a store mutate* wrapper (serialized read-modify-write),
//   so two consumers can never clobber each other with a stale whole-array save.
// - `ready` flips true once, after the first load. A remote syncTick afterwards
//   refreshes the arrays silently (no ready=false), so open edit drafts survive.
// - Today's derived mood entry, the legacy checklist migration and the app badge
//   are handled here, once, instead of in whichever screen happens to be mounted.

const LifeDataContext = createContext(null)

const KEYS = ['tasks', 'reminders', 'habits', 'moodLog']

// Wrap an updater so every array it produces carries per-record `updatedAt`
// (R2-18). Only new or field-changed records are stamped; untouched records keep
// their reference and old value, and records without a stamp stay valid. `now` is
// fixed per write so the optimistic state and the stored state agree. If nothing
// changed, the previous array is returned as-is (no needless new reference).
export function withUpdatedAt(change, now) {
  const apply = typeof change === 'function' ? change : () => change
  return (prev) => {
    const next = apply(prev)
    if (next === prev || !Array.isArray(next)) return next
    const stamped = stampUpdated(prev, next, now)
    if (Array.isArray(prev) && stamped.length === prev.length && stamped.every((r, i) => r === prev[i])) return prev
    return stamped
  }
}

async function loadAll() {
  const [tasks, reminders, habits, moodLog] = await Promise.all([
    getTasks(), getReminders(), getHabits(), getMoodLog(),
  ])
  return { tasks, reminders, habits, moodLog }
}

export function LifeDataProvider({ syncTick = 0, children }) {
  const [data, setData] = useState({ tasks: [], reminders: [], habits: [], moodLog: [] })
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => new Date())

  // Writes in flight per key. While any are pending, results of loads and of
  // earlier writes are not applied, so an older result can't flicker over a newer
  // optimistic state; the last write to finish applies the stored value.
  const pending = useRef({ tasks: 0, reminders: 0, habits: 0, moodLog: 0 })
  const dataRef = useRef(data)
  dataRef.current = data
  const readyRef = useRef(false)

  // Initial load, then silent refresh on every remote sync tick.
  useEffect(() => {
    let cancelled = false
    loadAll()
      .then((loaded) => {
        if (cancelled) return
        setData((cur) => {
          const next = { ...cur }
          for (const k of KEYS) if (pending.current[k] === 0) next[k] = loaded[k]
          return next
        })
        readyRef.current = true
        setReady(true)
        setError(null)
      })
      .catch((err) => {
        // A failed silent refresh keeps what is on screen; only the first load errors.
        if (!cancelled && !readyRef.current) setError(err?.message || 'Failed to load')
      })
    return () => { cancelled = true }
  }, [syncTick])

  const write = useCallback((key, mutate, change) => {
    const apply = withUpdatedAt(change, Date.now())
    pending.current[key]++
    setData((cur) => ({ ...cur, [key]: apply(cur[key]) }))
    return mutate(apply)
      .then((stored) => {
        pending.current[key]--
        if (pending.current[key] === 0) setData((cur) => ({ ...cur, [key]: stored }))
        return stored
      })
      .catch((err) => {
        pending.current[key]--
        // Roll the screen back to what is actually stored.
        if (pending.current[key] === 0) {
          loadAll().then((loaded) => setData((cur) => ({ ...cur, [key]: loaded[key] }))).catch(() => {})
        }
        throw err
      })
  }, [])

  // Each updater takes `(prev) => next` (preferred) or a plain next array.
  const updateTasks = useCallback((change) => write('tasks', mutateTasks, change), [write])
  const updateReminders = useCallback((change) => write('reminders', mutateReminders, change), [write])
  const updateHabits = useCallback((change) => write('habits', mutateHabits, change), [write])
  const updateMoodLog = useCallback((change) => write('moodLog', mutateMoodLog, change), [write])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Auto-derive today's mood entry from habit behavior, unless already logged.
  // Gated on `ready` (a partial load would derive from an empty log), and the
  // write itself re-checks against the stored log, so a real entry is never
  // overwritten.
  const { habits, moodLog, tasks, reminders } = data
  const habitsRef = useRef(habits)
  habitsRef.current = habits
  useEffect(() => {
    if (!ready) return
    if (ensureTodayEntry(moodLog, habits, now) === moodLog) return
    updateMoodLog((log) => ensureTodayEntry(log, habitsRef.current, now)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, habits, moodLog, now])

  // One-time merge of legacy checklists into tasks (as subtasks). Tasks are
  // saved before checklists are cleared; stable ids make a re-run a no-op.
  const migrated = useRef(false)
  useEffect(() => {
    if (!ready || migrated.current) return
    migrated.current = true
    getChecklists()
      .then(async (sections) => {
        if (!sections.length) return
        await updateTasks((cur) => {
          const have = new Set(cur.map((t) => t.id))
          const added = sections
            .filter((s) => !have.has(s.id))
            .map((s) => ({
              id: s.id, title: s.name, due: null, dueAt: null, done: false, doneAt: null,
              createdAt: s.createdAt, urgent: false, important: false, subtasks: s.items,
            }))
          return added.length ? [...added, ...cur] : cur
        })
        await saveChecklists([])
      })
      .catch(() => { migrated.current = false })
  }, [ready, updateTasks])

  // App badge: open tasks due (or overdue) plus reminders whose time has come.
  useEffect(() => {
    if (!navigator.setAppBadge) return
    const today = dateKey(now)
    const dueTasks = tasks.filter((t) => !t.done && t.due && t.due <= today).length
    const dueReminders = reminders.filter((r) => !r.done && r.at <= now.getTime()).length
    const n = dueTasks + dueReminders
    if (n > 0) navigator.setAppBadge(n).catch(() => {})
    else navigator.clearAppBadge?.().catch(() => {})
  }, [tasks, reminders, now])

  const value = useMemo(() => ({
    tasks, reminders, habits, moodLog, now, ready, error,
    updateTasks, updateReminders, updateHabits, updateMoodLog,
    ...dueCounts(tasks, reminders, now),
    walletTotal: sumWallet(habits, now),
  }), [tasks, reminders, habits, moodLog, now, ready, error,
    updateTasks, updateReminders, updateHabits, updateMoodLog])

  return <LifeDataContext.Provider value={value}>{children}</LifeDataContext.Provider>
}

// null when no provider is mounted (lets Life wrap itself until the shell mounts one).
export function useLifeOptional() {
  return useContext(LifeDataContext)
}

export function useLife() {
  const ctx = useContext(LifeDataContext)
  if (!ctx) throw new Error('useLife must be used inside <LifeDataProvider>')
  return ctx
}
