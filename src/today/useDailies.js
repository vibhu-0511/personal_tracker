import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getHabits, getExpenses, getDailyLog, getMoodLog, getProgress, getPuzzleProgress, getSettings, getReminders,
  mutateHabits, mutateMoodLog, mutateReminders, saveDailyLog,
} from '../store.js'
import { useStoreKey } from '../useStoreKey.js'
import { showToast } from '../toast.js'
import { dateKey, logManualMood } from '../life/logic.js'
import { runReminderAction, withUpdatedAt } from '../life/LifeData.jsx'
import { computeDailies } from './dailies.js'

// Data + actions behind the Today dailies row.
//
// - `loadDailies` is the pure loader: it reads exactly DAILIES_KEYS (getters are
//   injectable for tests) and returns the raw values plus the computed `dailies`.
// - The hook re-loads whenever a store event fires for one of those keys (or the
//   remote syncTick changes). Reloads after the first are silent.
// - Actions write through the store wrappers, which emit the key event, so the
//   dailies recompute without any local bookkeeping.

export const DAILIES_KEYS = ['habits', 'expenses', 'dailyLog', 'moodLog', 'progress', 'puzzleProgress', 'settings', 'reminders']

const DEFAULT_GETTERS = {
  habits: getHabits,
  expenses: getExpenses,
  dailyLog: getDailyLog,
  moodLog: getMoodLog,
  progress: getProgress,
  puzzleProgress: getPuzzleProgress,
  settings: getSettings,
  reminders: getReminders,
}

export const EMPTY_DAILIES_DATA = {
  habits: [], expenses: [], dailyLog: {}, moodLog: [], progress: {}, puzzleProgress: {}, settings: {}, reminders: [],
}

// Result: { habits, expenses, dailyLog, moodLog, progress, puzzleProgress, settings, reminders, dailies }
// where dailies is computeDailies(...) = { items, done, total }.
export async function loadDailies({ now = Date.now(), getters = DEFAULT_GETTERS } = {}) {
  const values = await Promise.all(DAILIES_KEYS.map((k) => getters[k]()))
  const data = Object.fromEntries(DAILIES_KEYS.map((k, i) => [k, values[i]]))
  return { ...data, dailies: computeDailies({ ...data, enabled: data.settings?.dailies }, now) }
}

export function useDailies({ syncTick = 0 } = {}) {
  const versions = DAILIES_KEYS.map((k) => useStoreKey(k)) // eslint-disable-line react-hooks/rules-of-hooks
  const [data, setData] = useState(EMPTY_DAILIES_DATA)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const readyRef = useRef(false)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    let cancelled = false
    loadDailies()
      .then((loaded) => {
        if (cancelled) return
        const { dailies: _d, ...raw } = loaded
        setData(raw)
        readyRef.current = true
        setReady(true)
        setError(null)
      })
      .catch((err) => {
        if (!cancelled && !readyRef.current) setError(err?.message || 'Failed to load')
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncTick, ...versions])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const dailies = useMemo(
    () => computeDailies({ ...data, enabled: data.settings?.dailies }, now),
    [data, now],
  )

  const failed = () => showToast('Could not save')

  const updateReminders = useCallback(
    (change) => mutateReminders(withUpdatedAt(change, Date.now())),
    [],
  )
  const reminderOp = useCallback(
    (id, action, arg) => Promise.resolve(runReminderAction(updateReminders, id, action, arg)).catch(failed),
    [updateReminders],
  )
  const completeReminder = useCallback((id) => reminderOp(id, 'complete'), [reminderOp])
  const snooze = useCallback((id, preset) => reminderOp(id, 'snooze', preset), [reminderOp])
  const reschedule = useCallback((id, at) => reminderOp(id, 'reschedule', at), [reminderOp])

  // Takes the next state, so a double tap or a retry is idempotent.
  const checkIn = useCallback((id, nextChecked) => {
    const key = dateKey(new Date())
    if (!dataRef.current.habits.some((h) => h.id === id)) return Promise.resolve()
    return mutateHabits((list) => list.map((h) => {
      if (h.id !== id) return h
      const has = (h.checkins ?? []).includes(key)
      if (nextChecked === has) return h
      return { ...h, checkins: nextChecked ? [...(h.checkins ?? []), key] : h.checkins.filter((c) => c !== key) }
    })).catch(failed)
  }, [])

  const logMood = useCallback(
    (value) => mutateMoodLog((log) => logManualMood(log, new Date(), value)).catch(failed),
    [],
  )

  // Marks the day as logged with no spending. saveDailyLog emits the 'dailyLog' event.
  const markNoSpend = useCallback((day = dateKey(new Date())) => (
    getDailyLog()
      .then((log) => saveDailyLog({ ...log, [day]: { ...(log || {})[day], noSpend: true } }))
      .catch(failed)
  ), [])

  return {
    ready,
    error,
    dailies,
    reminders: data.reminders,
    habits: data.habits,
    actions: { completeReminder, snooze, reschedule, checkIn, logMood, markNoSpend },
  }
}
