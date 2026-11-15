import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  getExpenses, saveExpenses, getBudgets, saveBudgets, getGoals, saveGoals, getLoans, saveLoans,
  getDailyLog, saveDailyLog,
} from '../store.js'
import { monthRange } from './logic.js'
import { logStreak as calcLogStreak, monthStrip as calcMonthStrip } from './dayLog.js'
import { dateKey } from '../life/logic.js'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'

// One shared hydrate/persist layer for the Money views, so split screens never
// hold stale copies of the same array. Screens call useMoney() and never saveX.
// Kept thin on purpose: persist* is the only write path, so a later useSynced
// can replace the bodies without touching any screen.

const MoneyContext = createContext(null)

function startOfThisMonth() {
  return monthRange(Date.now()).start
}

function shiftMonth(ts, delta) {
  const d = new Date(ts)
  d.setDate(1)
  d.setMonth(d.getMonth() + delta)
  return d.getTime()
}

// Pure dailyLog helpers (exported for tests).
export function withNoSpend(dailyLog, dayKey) {
  return { ...dailyLog, [dayKey]: { ...(dailyLog || {})[dayKey], noSpend: true } }
}

// Clears noSpend on every day that received a new transaction in `next`.
export function clearNoSpendForAdded(dailyLog, prev, next) {
  const had = new Set(prev)
  let out = dailyLog || {}
  for (const e of next) {
    if (had.has(e)) continue
    const key = dateKey(new Date(e.date))
    if (out[key] && out[key].noSpend) {
      const { noSpend: _drop, ...rest } = out[key]
      out = { ...out, [key]: rest }
    }
  }
  return out
}

export function MoneyProvider({ syncTick = 0, children }) {
  const [expenses, setExpenses] = useState([])
  const [budgets, setBudgets] = useState({})
  const [goals, setGoals] = useState([])
  const [loans, setLoans] = useState([])
  const [dailyLog, setDailyLog] = useState({})
  const [viewMonth, setViewMonth] = useState(startOfThisMonth)
  // null when closed; otherwise { mode: 'add', type } or { mode: 'edit', expense }.
  const [sheetRequest, setSheetRequest] = useState(null)
  const [saving, setSaving] = useState(false)

  // Latest-value refs for undo callbacks that run after later edits.
  const expensesRef = useLatest(expenses)
  const budgetsRef = useLatest(budgets)
  const goalsRef = useLatest(goals)
  const loansRef = useLatest(loans)
  const dailyLogRef = useLatest(dailyLog)

  const { ready, error } = useHydrate([
    () => getExpenses().then(setExpenses),
    () => getBudgets().then(setBudgets),
    () => getGoals().then(setGoals),
    () => getLoans().then(setLoans),
    () => getDailyLog().then(setDailyLog),
  ], [syncTick])

  const persistDailyLog = useCallback(async (next) => {
    dailyLogRef.current = next
    setDailyLog(next)
    await saveDailyLog(next)
  }, [dailyLogRef])
  const persistExpenses = useCallback(async (next) => {
    const log = dailyLogRef.current
    const cleared = clearNoSpendForAdded(log, expensesRef.current, next)
    setExpenses(next)
    await saveExpenses(next)
    if (cleared !== log) await persistDailyLog(cleared)
  }, [dailyLogRef, expensesRef, persistDailyLog])
  // Writer-shaped: (prev) => next against the latest dailyLog (used by the capture sheet).
  const updateDailyLog = useCallback(
    (change) => persistDailyLog(typeof change === 'function' ? change(dailyLogRef.current) : change),
    [dailyLogRef, persistDailyLog],
  )
  const markNoSpend = useCallback(
    (dayKey) => persistDailyLog(withNoSpend(dailyLogRef.current, dayKey)),
    [dailyLogRef, persistDailyLog],
  )
  const persistBudgets = useCallback(async (next) => {
    setBudgets(next)
    await saveBudgets(next)
  }, [])
  const persistGoals = useCallback(async (next) => {
    setGoals(next)
    await saveGoals(next)
  }, [])
  const persistLoans = useCallback(async (next) => {
    setLoans(next)
    await saveLoans(next)
  }, [])

  const prevMonth = useCallback(() => setViewMonth((prev) => shiftMonth(prev, -1)), [])
  // Never navigates past the current month.
  const nextMonth = useCallback(() => setViewMonth((prev) => {
    const next = shiftMonth(prev, 1)
    return next > startOfThisMonth() ? prev : next
  }), [])

  const openAdd = useCallback((type = 'expense') => setSheetRequest({ mode: 'add', type }), [])
  const openEdit = useCallback((expense) => setSheetRequest({ mode: 'edit', expense }), [])
  const closeSheet = useCallback(() => setSheetRequest(null), [])

  // Guards double-submits: resolves false without running fn if a save is in flight.
  const savingRef = useLatest(saving)
  const runSaving = useCallback(async (fn) => {
    if (savingRef.current) return false
    setSaving(true)
    try {
      await fn()
      return true
    } finally {
      setSaving(false)
    }
  }, [savingRef])

  const streak = useMemo(() => calcLogStreak(expenses, dailyLog), [expenses, dailyLog])
  const strip = useMemo(() => calcMonthStrip(expenses, dailyLog), [expenses, dailyLog])

  const value = useMemo(() => ({
    dailyLog, logStreak: streak, monthStrip: strip, markNoSpend, updateDailyLog,
    expenses, budgets, goals, loans,
    expensesRef, budgetsRef, goalsRef, loansRef,
    viewMonth, prevMonth, nextMonth,
    persistExpenses, persistBudgets, persistGoals, persistLoans,
    openAdd, openEdit, closeSheet, sheetRequest,
    saving, runSaving, ready, error,
  }), [
    dailyLog, streak, strip, markNoSpend, updateDailyLog,
    expenses, budgets, goals, loans, expensesRef, budgetsRef, goalsRef, loansRef,
    viewMonth, prevMonth, nextMonth,
    persistExpenses, persistBudgets, persistGoals, persistLoans,
    openAdd, openEdit, closeSheet, sheetRequest,
    saving, runSaving, ready, error,
  ])

  return <MoneyContext.Provider value={value}>{children}</MoneyContext.Provider>
}

export function useMoney() {
  const ctx = useContext(MoneyContext)
  if (!ctx) throw new Error('useMoney must be used inside <MoneyProvider>')
  return ctx
}

// null when no provider is mounted. The shell mounts one provider for the whole app (so the
// capture sheet can write expenses); MoneyApp reuses it instead of mounting a second copy.
export function useMoneyOptional() {
  return useContext(MoneyContext)
}
