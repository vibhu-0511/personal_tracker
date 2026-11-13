import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import {
  getExpenses, saveExpenses, getBudgets, saveBudgets, getGoals, saveGoals, getLoans, saveLoans,
} from '../store.js'
import { monthRange } from './logic.js'
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

export function MoneyProvider({ syncTick = 0, children }) {
  const [expenses, setExpenses] = useState([])
  const [budgets, setBudgets] = useState({})
  const [goals, setGoals] = useState([])
  const [loans, setLoans] = useState([])
  const [viewMonth, setViewMonth] = useState(startOfThisMonth)
  // null when closed; otherwise { mode: 'add', type } or { mode: 'edit', expense }.
  const [sheetRequest, setSheetRequest] = useState(null)
  const [saving, setSaving] = useState(false)

  // Latest-value refs for undo callbacks that run after later edits.
  const expensesRef = useLatest(expenses)
  const budgetsRef = useLatest(budgets)
  const goalsRef = useLatest(goals)
  const loansRef = useLatest(loans)

  const { ready, error } = useHydrate([
    () => getExpenses().then(setExpenses),
    () => getBudgets().then(setBudgets),
    () => getGoals().then(setGoals),
    () => getLoans().then(setLoans),
  ], [syncTick])

  const persistExpenses = useCallback(async (next) => {
    setExpenses(next)
    await saveExpenses(next)
  }, [])
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

  const value = useMemo(() => ({
    expenses, budgets, goals, loans,
    expensesRef, budgetsRef, goalsRef, loansRef,
    viewMonth, prevMonth, nextMonth,
    persistExpenses, persistBudgets, persistGoals, persistLoans,
    openAdd, openEdit, closeSheet, sheetRequest,
    saving, runSaving, ready, error,
  }), [
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
