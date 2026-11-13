// Money pure helpers: loan ledger math plus month summary, category breakdown, trend and budget status.
// Positive loan balance = they owe you; negative = you owe them.
// Entries are { amount, date (ms), category, type }. A missing `type` is a legacy entry and counts as an expense.
import { shortMonth } from './format.js'

export const LOAN_ACTIONS = [
  { id: 'lent', label: 'I lent them money', sign: 1 },
  { id: 'theyRepaid', label: 'They paid me back', sign: -1 },
  { id: 'borrowed', label: 'I borrowed from them', sign: -1 },
  { id: 'iRepaid', label: 'I paid them back', sign: 1 },
]

const SIGN = Object.fromEntries(LOAN_ACTIONS.map((a) => [a.id, a.sign]))

export function computeLoanBalances(loans) {
  const balances = {}
  const displayNames = {} // normalized key -> first-seen display casing
  for (const l of loans) {
    const norm = l.person.trim().toLowerCase()
    if (!(norm in displayNames)) displayNames[norm] = l.person.trim()
    const key = displayNames[norm]
    balances[key] = (balances[key] || 0) + l.amount * SIGN[l.direction]
  }
  return balances
}

const sum = (list) => list.reduce((s, e) => s + e.amount, 0)

export const isIncome = (e) => e.type === 'income'
export const isExpense = (e) => e.type !== 'income'

// [start, end) of the local calendar month containing ts, at local midnight.
export function monthRange(ts) {
  const d = new Date(ts)
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
  }
}

export function monthEntries(expenses, ts) {
  const { start, end } = monthRange(ts)
  return expenses.filter((e) => e.date >= start && e.date < end)
}

// Income and spend for one month. Income entries never count towards spend.
export function monthTotals(expenses, ts) {
  const m = monthEntries(expenses, ts)
  return { income: sum(m.filter(isIncome)), expense: sum(m.filter(isExpense)) }
}

export function monthSummary(expenses, ts) {
  const { income, expense: spent } = monthTotals(expenses, ts)
  const balance = income - spent
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0
  return { income, spent, balance, savingsRate }
}

// Spend per category for the month, largest first.
// Returns { items: [{ id, total, pct }], spent, max } where pct is the share of total spend.
export function categoryBreakdown(expenses, ts) {
  const spending = {}
  for (const e of monthEntries(expenses, ts).filter(isExpense)) {
    spending[e.category] = (spending[e.category] || 0) + e.amount
  }
  const sorted = Object.entries(spending).sort((a, b) => b[1] - a[1])
  const spent = sorted.reduce((s, [, total]) => s + total, 0)
  return {
    items: sorted.map(([id, total]) => ({ id, total, pct: spent > 0 ? Math.round((total / spent) * 100) : 0 })),
    spent,
    max: sorted[0]?.[1] || 1,
  }
}

// Month totals for `count` months ending at the month of ts (oldest first). Default 3: two before, then this one.
export function monthTrend(expenses, ts, count = 3) {
  const d = new Date(ts)
  const points = []
  for (let offset = 1 - count; offset <= 0; offset++) {
    const monthTs = new Date(d.getFullYear(), d.getMonth() + offset, 1).getTime()
    points.push({ label: shortMonth(monthTs), ts: monthTs, ...monthTotals(expenses, monthTs) })
  }
  return points
}

export function trendMax(trend) {
  return Math.max(...trend.map((t) => Math.max(t.income, t.expense)), 1)
}

// % change of this month's balance against the previous month's. null when the previous balance is 0.
export function balanceDeltaPct(balance, prevBalance) {
  return prevBalance !== 0 ? Math.round(((balance - prevBalance) / Math.abs(prevBalance)) * 100) : null
}

export function totalBudget(budgets) {
  return Object.values(budgets || {}).reduce((s, v) => s + v, 0)
}

// Whole-month budget status: total spend against the sum of all category budgets.
// `over` needs a budget to exist. `remaining` is negative when over.
export function budgetStatus(spent, total) {
  const hasBudget = total > 0
  return {
    totalBudget: total,
    spent,
    remaining: total - spent,
    pct: hasBudget ? Math.round((spent / total) * 100) : 0,
    over: hasBudget && spent > total,
    hasBudget,
  }
}

// Per-category budget status. A category with no budget is never over and has pct 0.
export function categoryBudgetStatus(catSpent, budget) {
  const hasBudget = budget > 0
  return {
    spent: catSpent,
    budget: budget || 0,
    pct: hasBudget ? Math.round((catSpent / budget) * 100) : 0,
    over: hasBudget && catSpent > budget,
    hasBudget,
  }
}

// Days left in the local month, counting today (the last day of the month returns 1).
export function daysLeftInMonth(now = Date.now()) {
  const d = new Date(now)
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return daysInMonth - d.getDate() + 1
}

// Group entries by local day, newest day first: [[dayStartMs (string), entries[]], ...]
export function groupByDate(items) {
  const groups = {}
  for (const e of items) {
    const t = new Date(e.date)
    t.setHours(0, 0, 0, 0)
    const key = t.getTime()
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  }
  return Object.entries(groups).sort((a, b) => b[0] - a[0])
}
