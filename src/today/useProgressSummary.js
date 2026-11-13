import { useEffect, useMemo, useState } from 'react'
import { getHabits, getTasks } from '../store.js'
import { useStoreKey } from '../useStoreKey.js'
import { dateKey } from '../life/logic.js'
import { walletTotal } from '../life/selectors.js'
import { levelFromXp, xpFor } from '../life/progress.js'

// Shared "Lv N" / wallet summary. Used by the Today wallet tile and by the
// global header pills (B3-14), so both always show the same numbers.
//
// Level never decreases (D2): the highest XP ever shown is kept in this
// browser's localStorage and the level is read from max(xp, highWater).
// ADR-0004 puts highWater in the synced `settings` document; there is no atomic
// settings write helper yet, so it stays per device for now (no new synced key).

export const LEVEL_HIGH_WATER_KEY = 'forge_level_hw'

export function readHighWater(storage) {
  try {
    const s = storage ?? globalThis.localStorage
    const n = Number(s?.getItem(LEVEL_HIGH_WATER_KEY))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

// Raises the stored high-water mark to `xp` when it is higher. Never lowers it.
export function raiseHighWater(xp, storage) {
  try {
    const s = storage ?? globalThis.localStorage
    const next = Math.floor(Number(xp) || 0)
    if (s && next > readHighWater(s)) s.setItem(LEVEL_HIGH_WATER_KEY, String(next))
  } catch {
    // blocked or full storage: the level simply is not remembered
  }
}

// Pure: { xp, level, levelPct, walletTotal, habitCount, left }.
// `left` = habits not yet checked in today. levelPct is 0-99.
export function summarizeProgress(habits, tasks, now, highWater = 0) {
  const hs = Array.isArray(habits) ? habits : []
  const xp = xpFor(hs, tasks, now)
  const { level, pct } = levelFromXp(xp, highWater)
  const today = dateKey(now)
  return {
    xp,
    level,
    levelPct: pct,
    walletTotal: walletTotal(hs, now),
    habitCount: hs.length,
    left: hs.filter((h) => !(h.checkins ?? []).includes(today)).length,
  }
}

// Reads habits + tasks, refreshing on remote sync (`syncTick`) and on every
// local save of either key (useStoreKey), so a check-in or task tick elsewhere
// updates the pills without a reload. `ready` is false until the first read.
export function useProgressSummary({ syncTick = 0 } = {}) {
  const habitsVersion = useStoreKey('habits')
  const tasksVersion = useStoreKey('tasks')
  const [data, setData] = useState({ ready: false, habits: [], tasks: [] })
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    Promise.all([getHabits(), getTasks()])
      .then(([habits, tasks]) => {
        if (!cancelled) setData({ ready: true, habits, tasks })
      })
      .catch(() => {
        // keep what is shown; the pills just stay as they were
      })
    return () => { cancelled = true }
  }, [syncTick, habitsVersion, tasksVersion])

  // Day rollover changes `left`; a minute is fine granularity for a pill.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const summary = useMemo(
    () => summarizeProgress(data.habits, data.tasks, now, readHighWater()),
    [data, now],
  )

  useEffect(() => {
    if (data.ready) raiseHighWater(summary.xp)
  }, [data.ready, summary.xp])

  return { ready: data.ready, ...summary }
}
