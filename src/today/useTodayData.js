import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getHabits, getTasks, getMoodLog, getExpenses, getBudgets, getWatchlist, getProgress, getSettings,
  mutateHabits, mutateTasks, mutateMoodLog,
} from '../store.js'
import { emitStoreKey } from '../storeEvents.js'
import { showToast } from '../toast.js'
import { useStoreKey } from '../useStoreKey.js'
import {
  crossedMilestone, dateKey, ensureTodayEntry, logManualMood, petState, streaks,
} from '../life/logic.js'
import { overallStreak } from '../life/selectors.js'
import { fireConfetti } from '../life/confetti.js'
import { categoryInfo } from '../money/categories.js'
import { codeRing } from '../logic/stats.js'
import { DEFAULT_DAILY_GOAL } from '../logic/tileData.js'
import { raiseHighWater, readHighWater, summarizeProgress } from './useProgressSummary.js'

// Data + write paths for the Today home tiles.
//
// - One load of every key a tile shows. `ready` flips true once, after ALL keys
//   have loaded; later reloads (remote syncTick, local saves via useStoreKey)
//   are silent so tiles never flash back to skeletons.
// - Writes use the store mutate* wrappers (serialized read-modify-write, same
//   data shapes as Life.jsx) and then emit the local key event, because the
//   engine's mutate does not, and the header pills listen for it.
// - Today's derived mood entry is created only once `ready` (a partial load
//   would derive from an empty log) and the write re-checks the stored log, so
//   an existing entry is never overwritten.

const KEYS = ['habits', 'tasks', 'moodLog', 'expenses', 'budgets', 'watchlist', 'progress', 'settings']
const EMPTY = {
  habits: [], tasks: [], moodLog: [], expenses: [], budgets: {}, watchlist: [], progress: {}, settings: {},
}

async function loadAll() {
  const [habits, tasks, moodLog, expenses, budgets, watchlist, progress, settings] = await Promise.all([
    getHabits(), getTasks(), getMoodLog(), getExpenses(), getBudgets(), getWatchlist(), getProgress(), getSettings(),
  ])
  return { habits, tasks, moodLog, expenses, budgets, watchlist, progress, settings }
}

// This month's spend (income excluded) and per-category totals.
export function monthSpend(expenses, now) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
  const byCat = {}
  let spent = 0
  for (const e of expenses || []) {
    if (!e || e.type === 'income' || !(e.date >= start && e.date < end)) continue
    const amount = Number(e.amount) || 0
    spent += amount
    byCat[e.category] = (byCat[e.category] || 0) + amount
  }
  const categories = Object.entries(byCat).map(([id, total]) => {
    const info = categoryInfo(id)
    return { id, label: info.label, emoji: info.emoji, total }
  })
  return { spent, categories }
}

export function useTodayData({ syncTick = 0 } = {}) {
  const versions = [
    useStoreKey('habits'), useStoreKey('tasks'), useStoreKey('moodLog'), useStoreKey('expenses'),
    useStoreKey('budgets'), useStoreKey('watchlist'), useStoreKey('progress'), useStoreKey('settings'),
  ]
  const [data, setData] = useState(EMPTY)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [quote, setQuote] = useState(null)

  // Writes in flight per key: while any are pending, loads don't overwrite the
  // optimistic state (an older read must not flicker over a newer write).
  const pending = useRef({})
  const readyRef = useRef(false)
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    let cancelled = false
    loadAll()
      .then((loaded) => {
        if (cancelled) return
        setData((cur) => {
          const next = { ...cur }
          for (const k of KEYS) if (!pending.current[k]) next[k] = loaded[k]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncTick, ...versions])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  const write = useCallback((key, mutate, apply) => {
    pending.current[key] = (pending.current[key] || 0) + 1
    setData((cur) => ({ ...cur, [key]: apply(cur[key]) }))
    return mutate(apply)
      .then((stored) => {
        pending.current[key]--
        if (!pending.current[key]) setData((cur) => ({ ...cur, [key]: stored }))
        emitStoreKey(key)
        return stored
      })
      .catch((err) => {
        pending.current[key]--
        // Roll the tile back to what is actually stored.
        if (!pending.current[key]) {
          loadAll().then((loaded) => setData((cur) => ({ ...cur, [key]: loaded[key] }))).catch(() => {})
        }
        throw err
      })
  }, [])

  // Derive today's mood entry once every key is loaded, unless one exists.
  const { habits, tasks, moodLog, expenses, budgets, watchlist, progress, settings } = data
  useEffect(() => {
    if (!ready) return
    if (ensureTodayEntry(moodLog, habits, now) === moodLog) return
    write('moodLog', mutateMoodLog, (log) => ensureTodayEntry(log, dataRef.current.habits, now)).catch(() => {})
  }, [ready, habits, moodLog, now, write])

  // Watch tile: live quote for the first stock (index symbols are rejected by
  // /api/quote). Offline or failing means no quote and the tile uses priceAtAdd.
  const watchItem = useMemo(() => {
    const first = (watchlist || []).find((w) => w && w.type === 'stock' && w.symbol)
    return first ? { symbol: first.symbol, name: first.name, priceAtAdd: first.priceAtAdd ?? null } : null
  }, [watchlist])
  const watchSymbol = watchItem?.symbol
  useEffect(() => {
    setQuote(null)
    if (!watchSymbol) return undefined
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    fetch(`/api/quote?symbols=${encodeURIComponent(watchSymbol)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((res) => {
        const q = (res.quotes || []).find((x) => x.symbol === watchSymbol)
        setQuote(q && Number.isFinite(q.price) ? { price: q.price, changePct: q.changePct } : null)
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer))
    return () => { ctrl.abort(); clearTimeout(timer) }
  }, [watchSymbol])

  const todayKey = dateKey(now)

  const progressSummary = useMemo(
    () => summarizeProgress(habits, tasks, now, readHighWater()),
    [habits, tasks, now],
  )
  useEffect(() => {
    if (ready) raiseHighWater(progressSummary.xp)
  }, [ready, progressSummary.xp])

  // Tile actions. Each takes the *next* state from the tile, so a double tap or a
  // retried call is idempotent. Failures roll back (see `write`) and toast.
  const failed = () => showToast('Could not save')

  const toggleTask = useCallback((id, nextDone) => {
    const key = dateKey(new Date())
    const before = dataRef.current.tasks
    const target = before.find((t) => t.id === id)
    if (!target) return Promise.resolve()
    const apply = (list) => list.map((t) => (t.id === id
      ? { ...t, done: nextDone, doneAt: nextDone ? Date.now() : null }
      : t))
    const hadDueToday = before.some((t) => !t.done && t.due === key)
    const stillDueToday = apply(before).some((t) => !t.done && t.due === key)
    return write('tasks', mutateTasks, apply)
      .then(() => { if (nextDone && !target.done && hadDueToday && !stillDueToday) fireConfetti() })
      .catch(failed)
  }, [write])

  const checkIn = useCallback((id, nextChecked) => {
    const nowDate = new Date()
    const key = dateKey(nowDate)
    const habit = dataRef.current.habits.find((h) => h.id === id)
    if (!habit) return Promise.resolve()
    const apply = (list) => list.map((h) => {
      if (h.id !== id) return h
      const has = (h.checkins ?? []).includes(key)
      if (nextChecked === has) return h
      return { ...h, checkins: nextChecked ? [...(h.checkins ?? []), key] : h.checkins.filter((c) => c !== key) }
    })
    const prevBest = streaks(habit.checkins ?? [], nowDate).best
    const nextHabit = apply([habit])[0]
    const newBest = streaks(nextHabit.checkins ?? [], nowDate).best
    return write('habits', mutateHabits, apply)
      .then(() => { if (nextChecked && crossedMilestone(prevBest, newBest)) fireConfetti() })
      .catch(failed)
  }, [write])

  const logMood = useCallback(
    (value) => write('moodLog', mutateMoodLog, (log) => logManualMood(log, new Date(), value)).catch(failed),
    [write],
  )

  const pets = useMemo(() => habits.map((h) => {
    const p = petState(h, now)
    return {
      id: h.id,
      species: h.species,
      name: h.name,
      streak: streaks(h.checkins ?? [], now).current,
      stage: p.stage,
      health: p.health,
      mood: p.mood,
      checkedToday: (h.checkins ?? []).includes(todayKey),
    }
  }), [habits, now, todayKey])

  const streak = useMemo(() => overallStreak(habits, now), [habits, now])

  const code = useMemo(() => {
    const goal = Number(settings.dailyCodeGoal) || Number(settings.dailyGoal) || DEFAULT_DAILY_GOAL
    const ring = codeRing(progress, goal, now.getTime())
    return { solved: ring.done, goal: ring.goal }
  }, [progress, settings, now])

  const spend = useMemo(() => {
    const { spent, categories } = monthSpend(expenses, now)
    const totalBudget = Object.values(budgets || {}).reduce((s, v) => s + (Number(v) || 0), 0)
    const monthLabel = now.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    return { spent, categories, totalBudget, monthLabel }
  }, [expenses, budgets, now])

  const todayMood = useMemo(() => moodLog.find((e) => e.date === todayKey) || null, [moodLog, todayKey])

  return {
    ready,
    error,
    todayKey,
    streak,
    wallet: {
      total: progressSummary.walletTotal,
      habitCount: progressSummary.habitCount,
      left: progressSummary.left,
      level: progressSummary.level,
      levelPct: progressSummary.levelPct,
    },
    pets,
    code,
    tasks,
    spend,
    mood: { today: todayMood ? todayMood.valence : null, source: todayMood ? todayMood.source : undefined },
    watch: { item: watchItem, quote },
    actions: { toggleTask, checkIn, logMood },
  }
}
