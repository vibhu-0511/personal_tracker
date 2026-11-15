import test from 'node:test'
import assert from 'node:assert/strict'
import {
  monthRange, monthTotals, monthSummary, categoryBreakdown, monthTrend, trendMax, balanceDeltaPct,
  totalBudget, budgetStatus, categoryBudgetStatus, daysLeftInMonth, groupByDate,
} from '../src/money/logic.js'

// Local-time timestamps (month is 1-based).
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()
const exp = (amount, date, category = 'food', type = 'expense') => ({ amount, date, category, type })
const inc = (amount, date) => ({ amount, date, category: 'other', type: 'income' })

const NOV = at(2026, 11, 13)

test('legacy entries with no type count as expense', () => {
  const legacy = { amount: 120, date: at(2026, 11, 5), category: 'food' }
  const t = monthTotals([legacy], NOV)
  assert.equal(t.expense, 120)
  assert.equal(t.income, 0)
  assert.equal(monthSummary([legacy], NOV).spent, 120)
})

test('income is excluded from spend and category breakdown', () => {
  const list = [exp(200, at(2026, 11, 2)), inc(5000, at(2026, 11, 3))]
  const s = monthSummary(list, NOV)
  assert.equal(s.spent, 200)
  assert.equal(s.income, 5000)
  assert.equal(s.balance, 4800)
  assert.equal(s.savingsRate, 96)
  const b = categoryBreakdown(list, NOV)
  assert.equal(b.spent, 200)
  assert.deepEqual(b.items.map((i) => i.id), ['food'])
})

test('savings rate is 0 when there is no income', () => {
  assert.equal(monthSummary([exp(100, at(2026, 11, 2))], NOV).savingsRate, 0)
})

test('month boundary is local midnight: first instant in, last instant of previous month out', () => {
  const { start, end } = monthRange(NOV)
  assert.equal(start, new Date(2026, 10, 1, 0, 0, 0, 0).getTime())
  assert.equal(end, new Date(2026, 11, 1, 0, 0, 0, 0).getTime())
  const list = [
    exp(1, start), // Nov 1 00:00:00.000 local, in
    exp(10, start - 1), // Oct 31 23:59:59.999, out
    exp(100, end - 1), // Nov 30 23:59:59.999, in
    exp(1000, end), // Dec 1 00:00:00.000, out
  ]
  assert.equal(monthTotals(list, NOV).expense, 101)
})

test('monthRange handles year rollover', () => {
  const { start, end } = monthRange(at(2026, 12, 31, 23, 59))
  assert.equal(start, new Date(2026, 11, 1).getTime())
  assert.equal(end, new Date(2027, 0, 1).getTime())
})

test('category breakdown sorts by spend and reports share of total', () => {
  const list = [
    exp(100, at(2026, 11, 1), 'coffee'),
    exp(300, at(2026, 11, 2), 'food'),
    exp(100, at(2026, 11, 3), 'food'),
    exp(500, at(2026, 10, 3), 'travel'), // other month
  ]
  const b = categoryBreakdown(list, NOV)
  assert.deepEqual(b.items, [
    { id: 'food', total: 400, pct: 80 },
    { id: 'coffee', total: 100, pct: 20 },
  ])
  assert.equal(b.max, 400)
  assert.equal(b.spent, 500)
})

test('category breakdown of an empty month is empty with max 1', () => {
  const b = categoryBreakdown([], NOV)
  assert.deepEqual(b.items, [])
  assert.equal(b.max, 1)
})

test('3-month trend is oldest first and ends at the viewed month', () => {
  const list = [
    exp(100, at(2026, 9, 10)),
    inc(1000, at(2026, 9, 11)),
    exp(200, at(2026, 10, 10)),
    exp(300, at(2026, 11, 10)),
    inc(900, at(2026, 11, 12)),
  ]
  const trend = monthTrend(list, NOV)
  assert.equal(trend.length, 3)
  assert.deepEqual(trend.map((t) => t.ts), [at(2026, 9, 1, 0), at(2026, 10, 1, 0), at(2026, 11, 1, 0)])
  assert.deepEqual(trend.map((t) => t.expense), [100, 200, 300])
  assert.deepEqual(trend.map((t) => t.income), [1000, 0, 900])
  assert.equal(trendMax(trend), 1000)
  assert.equal(trendMax([]), 1)
})

test('trend crosses a year boundary and survives day-31 inputs', () => {
  const list = [exp(50, at(2026, 11, 20)), exp(70, at(2026, 12, 20)), exp(90, at(2027, 1, 20))]
  const trend = monthTrend(list, at(2027, 1, 31))
  assert.deepEqual(trend.map((t) => t.expense), [50, 70, 90])
  assert.equal(new Date(trend[0].ts).getMonth(), 10)
  assert.equal(new Date(trend[1].ts).getMonth(), 11)
})

test('balance delta pct against previous month', () => {
  assert.equal(balanceDeltaPct(150, 100), 50)
  assert.equal(balanceDeltaPct(50, -100), 150)
  assert.equal(balanceDeltaPct(100, 0), null)
})

test('daysLeftInMonth counts today and handles month lengths', () => {
  assert.equal(daysLeftInMonth(at(2026, 11, 13)), 18)
  assert.equal(daysLeftInMonth(at(2026, 11, 30, 23, 59)), 1)
  assert.equal(daysLeftInMonth(at(2026, 11, 1, 0, 0)), 30)
  assert.equal(daysLeftInMonth(at(2026, 12, 1)), 31)
  assert.equal(daysLeftInMonth(at(2026, 2, 1)), 28)
  assert.equal(daysLeftInMonth(at(2028, 2, 1)), 29) // leap year
})

test('totalBudget sums every category budget', () => {
  assert.equal(totalBudget({ food: 3000, travel: 2000 }), 5000)
  assert.equal(totalBudget({}), 0)
  assert.equal(totalBudget(undefined), 0)
})

test('budgetStatus compares total spend with totalBudget', () => {
  const under = budgetStatus(2500, 10000)
  assert.equal(under.pct, 25)
  assert.equal(under.remaining, 7500)
  assert.equal(under.over, false)

  const exactly = budgetStatus(10000, 10000)
  assert.equal(exactly.pct, 100)
  assert.equal(exactly.over, false)

  const over = budgetStatus(12500, 10000)
  assert.equal(over.pct, 125)
  assert.equal(over.remaining, -2500)
  assert.equal(over.over, true)
})

test('budgetStatus with no budget is never over and has pct 0', () => {
  const s = budgetStatus(500, 0)
  assert.equal(s.hasBudget, false)
  assert.equal(s.pct, 0)
  assert.equal(s.over, false)
  assert.equal(s.remaining, -500)
})

test('categoryBudgetStatus', () => {
  assert.deepEqual(categoryBudgetStatus(150, 100), { spent: 150, budget: 100, pct: 150, over: true, hasBudget: true })
  assert.deepEqual(categoryBudgetStatus(50, 0), { spent: 50, budget: 0, pct: 0, over: false, hasBudget: false })
  assert.equal(categoryBudgetStatus(50, undefined).over, false)
})

test('groupByDate groups by local day, newest first', () => {
  const a = exp(1, at(2026, 11, 2, 9))
  const b = exp(2, at(2026, 11, 2, 18))
  const c = exp(3, at(2026, 11, 5, 8))
  const groups = groupByDate([a, b, c])
  assert.equal(groups.length, 2)
  assert.equal(Number(groups[0][0]), at(2026, 11, 5, 0))
  assert.deepEqual(groups[1][1], [a, b])
})
