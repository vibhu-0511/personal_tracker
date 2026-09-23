import { useState } from 'react'
import {
  getExpenses, saveExpenses, getBudgets, saveBudgets, getGoals, saveGoals, getLoans, saveLoans,
  mutateReminders,
} from '../store.js'
import { LOAN_ACTIONS, computeLoanBalances } from '../money/logic.js'
import Sheet from '../Sheet.jsx'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'
import { deleteWithUndo } from '../undo.js'
import { newId } from '../id.js'
import { DndArea, DropList, SortableRow } from '../dnd/Dnd.jsx'
import { placeItem } from '../dnd/logic.js'
import { formatAdded, formatTime } from '../time.js'

const CATEGORIES = [
  { id: 'food', emoji: '🍔', label: 'Food' },
  { id: 'transport', emoji: '🚗', label: 'Transport' },
  { id: 'shopping', emoji: '🛍️', label: 'Shopping' },
  { id: 'bills', emoji: '📱', label: 'Bills' },
  { id: 'entertainment', emoji: '🎮', label: 'Fun' },
  { id: 'health', emoji: '💊', label: 'Health' },
  { id: 'education', emoji: '💸', label: 'P2P' },
  { id: 'groceries', emoji: '🛒', label: 'Groceries' },
  { id: 'coffee', emoji: '☕', label: 'Coffee' },
  { id: 'subscriptions', emoji: '🔄', label: 'Subs' },
  { id: 'travel', emoji: '✈️', label: 'Travel' },
  { id: 'other', emoji: '📦', label: 'Other' },
]
const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))
const GOAL_ICONS = ['🏦', '🏠', '🚗', '✈️', '📱', '🎓', '💍', '🏥', '🎯', '💰']
const MAX_AMOUNT = 10_000_000

function toDateInputValue(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fromDateInputValue(str, fallbackTs) {
  if (!str) return fallbackTs
  const [y, m, d] = str.split('-').map(Number)
  const base = new Date(fallbackTs)
  return new Date(y, m - 1, d, base.getHours(), base.getMinutes(), base.getSeconds()).getTime()
}

function monthRange(ts) {
  const d = new Date(ts)
  return {
    start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(),
    end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(),
  }
}

function formatMonth(ts) {
  return new Date(ts).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function shortMonth(ts) {
  return new Date(ts).toLocaleDateString('en-IN', { month: 'short' })
}

function shortAmount(n) {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

function startOfDay(d) {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  return t.getTime()
}

function formatDate(ts) {
  const today = startOfDay(Date.now())
  const diff = today - startOfDay(ts)
  if (diff === 0) return 'Today'
  if (diff === 86400000) return 'Yesterday'
  return new Date(ts).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}

function groupByDate(items) {
  const groups = {}
  for (const e of items) {
    const key = startOfDay(e.date)
    if (!groups[key]) groups[key] = []
    groups[key].push(e)
  }
  return Object.entries(groups).sort((a, b) => b[0] - a[0])
}

function monthTotals(expenses, ts) {
  const { start, end } = monthRange(ts)
  const m = expenses.filter((e) => e.date >= start && e.date < end)
  return {
    income: m.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0),
    expense: m.filter((e) => e.type !== 'income').reduce((s, e) => s + e.amount, 0),
  }
}

export default function Expenses({ syncTick = 0 }) {
  const [expenses, setExpenses] = useState([])
  const [budgets, setBudgets] = useState({})
  const [goals, setGoals] = useState([])
  const [view, setView] = useState('overview')
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  })

  const [showAdd, setShowAdd] = useState(false)
  const [txnType, setTxnType] = useState('expense')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [person, setPerson] = useState('')
  const [editId, setEditId] = useState(null)
  const [txnDate, setTxnDate] = useState(() => toDateInputValue(Date.now()))

  const [loans, setLoans] = useState([])
  const [showLoanForm, setShowLoanForm] = useState(false)
  const [loanPerson, setLoanPerson] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [loanDirection, setLoanDirection] = useState('lent')
  const [loanNote, setLoanNote] = useState('')
  const [remindMe, setRemindMe] = useState(false)
  const [expandedPerson, setExpandedPerson] = useState(null)

  const [search, setSearch] = useState('')
  const [showAllCats, setShowAllCats] = useState(false)
  const [typeFilter, setTypeFilter] = useState('all')
  const [loanSearch, setLoanSearch] = useState('')

  const [editBudgetCat, setEditBudgetCat] = useState(null)
  const [budgetAmount, setBudgetAmount] = useState('')

  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalName, setGoalName] = useState('')
  const [goalTarget, setGoalTarget] = useState('')
  const [goalIcon, setGoalIcon] = useState('🎯')
  const [fundGoalId, setFundGoalId] = useState(null)
  const [fundAmount, setFundAmount] = useState('')

  const [saving, setSaving] = useState(false)

  const expensesRef = useLatest(expenses)
  const loansRef = useLatest(loans)
  const goalsRef = useLatest(goals)

  const { ready, error } = useHydrate([
    () => getExpenses().then(setExpenses),
    () => getBudgets().then(setBudgets),
    () => getGoals().then(setGoals),
    () => getLoans().then(setLoans),
  ], [syncTick])

  async function persistExpenses(next) {
    setExpenses(next)
    await saveExpenses(next)
  }
  async function persistBudgets(next) {
    setBudgets(next)
    await saveBudgets(next)
  }
  async function persistGoals(next) {
    setGoals(next)
    await saveGoals(next)
  }
  async function persistLoans(next) {
    setLoans(next)
    await saveLoans(next)
  }

  function prevMonth() {
    setViewMonth((prev) => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() - 1)
      return d.getTime()
    })
  }
  function nextMonth() {
    setViewMonth((prev) => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() + 1)
      const next = d.getTime()
      const { start: thisMonthStart } = monthRange(Date.now())
      return next > thisMonthStart ? prev : next
    })
  }

  function openAdd(type = 'expense') {
    setAmount('')
    setCategory('')
    setNote('')
    setPerson('')
    setEditId(null)
    setTxnType(type)
    setTxnDate(toDateInputValue(Date.now()))
    setShowAdd(true)
  }

  function openEdit(e) {
    setAmount(String(e.amount))
    setCategory(e.category)
    setNote(e.note || '')
    setPerson(e.person || '')
    setEditId(e.id)
    setTxnType(e.type || 'expense')
    setTxnDate(toDateInputValue(e.date))
    setShowAdd(true)
  }

  async function handleSave() {
    if (saving) return
    const val = parseFloat(amount)
    if (!val || val <= 0 || val > MAX_AMOUNT) return
    if (txnType === 'expense' && !category) return
    setSaving(true)
    try {
      const cat = txnType === 'income' ? 'income' : category
      const withPerson = person.trim() || undefined
      if (editId) {
        await persistExpenses(
          expenses.map((e) =>
            e.id === editId
              ? {
                  ...e, amount: val, category: cat, note: note.trim(), type: txnType, person: withPerson,
                  date: fromDateInputValue(txnDate, e.date),
                }
              : e
          )
        )
      } else {
        await persistExpenses([
          {
            id: newId(), amount: val, category: cat, note: note.trim(),
            date: fromDateInputValue(txnDate, Date.now()),
            type: txnType, person: withPerson,
          },
          ...expenses,
        ])
      }
      setShowAdd(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    deleteWithUndo({ list: expenses, id, persist: persistExpenses, ref: expensesRef, label: () => 'Entry deleted' })
  }

  async function addLoan() {
    if (saving) return
    const val = parseFloat(loanAmount)
    const who = loanPerson.trim()
    if (!val || val <= 0 || val > MAX_AMOUNT || !who) return
    setSaving(true)
    try {
      await persistLoans([
        { id: newId(), person: who, amount: val, direction: loanDirection, note: loanNote.trim(), date: Date.now() },
        ...loans,
      ])
      if (remindMe) {
        const reminder = {
          id: newId(),
          title: `Follow up: ₹${val.toLocaleString('en-IN')} loan with ${who}`,
          at: Date.now() + 7 * 86400000,
          done: false,
          createdAt: Date.now(),
        }
        await mutateReminders((reminders) => [...reminders, reminder].sort((a, b) => a.at - b.at))
      }
      setLoanPerson('')
      setLoanAmount('')
      setLoanNote('')
      setLoanDirection('lent')
      setRemindMe(false)
      setShowLoanForm(false)
    } finally {
      setSaving(false)
    }
  }

  function deleteLoanEntry(id) {
    deleteWithUndo({ list: loans, id, persist: persistLoans, ref: loansRef, label: () => 'Loan entry deleted' })
  }

  async function saveBudgetFor(catId) {
    if (saving) return
    const val = parseFloat(budgetAmount)
    if (!val || val <= 0 || val > MAX_AMOUNT) return
    setSaving(true)
    try {
      await persistBudgets({ ...budgets, [catId]: val })
      setEditBudgetCat(null)
    } finally {
      setSaving(false)
    }
  }

  function removeBudgetFor(catId) {
    const next = { ...budgets }
    delete next[catId]
    persistBudgets(next)
    setEditBudgetCat(null)
  }

  async function addGoal() {
    if (saving) return
    const target = parseFloat(goalTarget)
    if (!goalName.trim() || !target || target <= 0 || target > MAX_AMOUNT) return
    setSaving(true)
    try {
      await persistGoals([...goals, { id: newId(), name: goalName.trim(), target, saved: 0, icon: goalIcon, createdAt: Date.now() }])
      setShowGoalForm(false)
      setGoalName('')
      setGoalTarget('')
      setGoalIcon('🎯')
    } finally {
      setSaving(false)
    }
  }

  async function addFunds() {
    if (saving) return
    const val = parseFloat(fundAmount)
    if (!val || val <= 0 || val > MAX_AMOUNT || !fundGoalId) return
    setSaving(true)
    try {
      await persistGoals(goals.map((g) => (g.id === fundGoalId ? { ...g, saved: Math.max(0, g.saved + val) } : g)))
      setFundGoalId(null)
      setFundAmount('')
    } finally {
      setSaving(false)
    }
  }

  function deleteGoal(id) {
    deleteWithUndo({
      list: goals, id, persist: persistGoals, ref: goalsRef,
      label: (goal) => `Deleted "${goal.name}"`,
    })
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-text">Couldn't load Money: {error}</div>
      </div>
    )
  }
  if (!ready) {
    return <div className="empty-state"><div className="empty-text">Loading…</div></div>
  }

  // Computed
  const { start: mStart, end: mEnd } = monthRange(viewMonth)
  const monthExp = expenses.filter((e) => e.date >= mStart && e.date < mEnd)
  const income = monthExp.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0)
  const spent = monthExp.filter((e) => e.type !== 'income').reduce((s, e) => s + e.amount, 0)
  const balance = income - spent
  const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0

  const catSpending = {}
  monthExp
    .filter((e) => e.type !== 'income')
    .forEach((e) => {
      catSpending[e.category] = (catSpending[e.category] || 0) + e.amount
    })
  const catSorted = Object.entries(catSpending).sort((a, b) => b[1] - a[1])
  const maxCatSpend = catSorted[0]?.[1] || 1

  const trend = [-2, -1, 0].map((offset) => {
    const d = new Date(viewMonth)
    d.setMonth(d.getMonth() + offset)
    return { label: shortMonth(d.getTime()), ts: d.getTime(), ...monthTotals(expenses, d.getTime()) }
  })
  const maxTrend = Math.max(...trend.map((t) => Math.max(t.income, t.expense)), 1)
  const prevMonthBalance = trend[1].income - trend[1].expense
  const balanceDeltaPct =
    prevMonthBalance !== 0 ? Math.round(((balance - prevMonthBalance) / Math.abs(prevMonthBalance)) * 100) : null

  const filteredTxns = expenses
    .filter((e) =>
      typeFilter === 'all' ? true : typeFilter === 'income' ? e.type === 'income' : e.type !== 'income'
    )
    .filter((e) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        (e.note || '').toLowerCase().includes(q) ||
        (e.person || '').toLowerCase().includes(q) ||
        (CAT_MAP[e.category]?.label || '').toLowerCase().includes(q)
      )
    })
  const groups = groupByDate(filteredTxns)

  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0)

  const personSuggestions = [...new Set(expenses.map((e) => e.person).filter(Boolean))]
  const loanPeopleSuggestions = [...new Set(loans.map((l) => l.person))]
  const loanBalances = computeLoanBalances(loans)
  const allOwedToYou = Object.entries(loanBalances).filter(([, b]) => b > 0.5).sort((a, b) => b[1] - a[1])
  const allYouOwe = Object.entries(loanBalances).filter(([, b]) => b < -0.5).sort((a, b) => a[1] - b[1])
  const totalOwedToYou = allOwedToYou.reduce((s, [, b]) => s + b, 0)
  const totalYouOwe = allYouOwe.reduce((s, [, b]) => s + Math.abs(b), 0)
  const loanQ = loanSearch.trim().toLowerCase()
  const owedToYou = loanQ ? allOwedToYou.filter(([who]) => who.toLowerCase().includes(loanQ)) : allOwedToYou
  const youOwe = loanQ ? allYouOwe.filter(([who]) => who.toLowerCase().includes(loanQ)) : allYouOwe

  return (
    <div className="fade-in">
      {/* Sub-view tabs */}
      <div className="agent-bar" style={{ marginBottom: 10 }}>
        {[
          ['overview', '📊', 'Overview'],
          ['txns', '📋', 'Txns'],
          ['budget', '📐', 'Budget'],
          ['goals', '🎯', 'Goals'],
          ['loans', '🤝', 'Loans'],
        ].map(([id, icon, label]) => (
          <button
            key={id}
            className={`agent-pill${view === id ? ' active' : ''}`}
            onClick={() => setView(id)}
          >
            <span className="agent-pill-icon">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* ─── OVERVIEW ─── */}
      {view === 'overview' && (
        <>
          <div className="money-month-stepper">
            <button className="btn btn-ghost btn-sm" onClick={prevMonth}>
              ◀
            </button>
            <span className="h3">{formatMonth(viewMonth)}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextMonth}>
              ▶
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--success)', fontSize: 20 }}>
                {income > 0 ? `₹${income.toLocaleString('en-IN')}` : '—'}
              </div>
              <div className="stat-label">Income</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--danger)', fontSize: 20 }}>
                {spent > 0 ? `₹${spent.toLocaleString('en-IN')}` : '—'}
              </div>
              <div className="stat-label">Expenses</div>
            </div>
            <div className="stat-card">
              <div
                className="stat-value"
                style={{ color: balance >= 0 ? 'var(--accent)' : 'var(--danger)', fontSize: 20 }}
              >
                {income > 0 || spent > 0 ? `₹${balance.toLocaleString('en-IN')}` : '—'}
              </div>
              <div className="stat-label">Balance</div>
              {balanceDeltaPct !== null && (
                <div className={balanceDeltaPct >= 0 ? 'up' : 'down'} style={{ fontSize: 11 }}>
                  {balanceDeltaPct >= 0 ? '+' : ''}{balanceDeltaPct}% vs last month
                </div>
              )}
            </div>
            <div className="stat-card">
              <div
                className="stat-value"
                style={{
                  color:
                    savingsRate >= 20 ? 'var(--success)' : savingsRate >= 0 ? 'var(--warn)' : 'var(--danger)',
                  fontSize: 20,
                }}
              >
                {income > 0 ? `${savingsRate}%` : '—'}
              </div>
              <div className="stat-label">Savings Rate</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button
              className="btn btn-sm"
              style={{ flex: 1, background: 'var(--success-dim)', borderColor: 'transparent', color: 'var(--success)' }}
              onClick={() => openAdd('income')}
            >
              + Income
            </button>
            <button
              className="btn btn-sm"
              style={{ flex: 1, background: 'var(--danger-dim)', borderColor: 'transparent', color: 'var(--danger)' }}
              onClick={() => openAdd('expense')}
            >
              + Expense
            </button>
          </div>

          {catSorted.length > 0 && (
            <>
              <div className="section-header">
                <span className="section-title">Spending by Category</span>
              </div>
              {(showAllCats ? catSorted : catSorted.slice(0, 6)).map(([catId, total]) => {
                const c = CAT_MAP[catId]
                const pct = spent > 0 ? Math.round((total / spent) * 100) : 0
                const overBudget = budgets[catId] && total > budgets[catId]
                return (
                  <div key={catId} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{c?.emoji || '📦'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span style={{ fontWeight: 600 }}>{c?.label || catId}</span>
                        <span className="meta">
                          ₹{total.toLocaleString('en-IN')} ({pct}%)
                        </span>
                      </div>
                      <div className="exam-progress-bar">
                        <div
                          className="exam-progress-fill"
                          style={{
                            width: `${Math.min(100, (total / maxCatSpend) * 100)}%`,
                            background: overBudget ? 'var(--danger)' : 'var(--accent)',
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
              {catSorted.length > 6 && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', marginBottom: 10 }}
                  onClick={() => setShowAllCats((v) => !v)}
                >
                  {showAllCats ? 'Show less ▴' : `Show ${catSorted.length - 6} more ▾`}
                </button>
              )}
            </>
          )}

          {trend.some((t) => t.income > 0 || t.expense > 0) && (
            <>
              <div className="section-header" style={{ marginTop: 6 }}>
                <span className="section-title">3-Month Trend</span>
              </div>
              <div className="money-trend-row">
                {trend.map((t) => (
                  <div key={t.ts} className="money-trend-col">
                    <div className="money-trend-bars">
                      <div
                        className="money-trend-bar"
                        style={{
                          height: Math.max(4, (t.income / maxTrend) * 80),
                          background: 'var(--success-dim)',
                          borderColor: 'var(--success)',
                        }}
                      />
                      <div
                        className="money-trend-bar"
                        style={{
                          height: Math.max(4, (t.expense / maxTrend) * 80),
                          background: 'var(--danger-dim)',
                          borderColor: 'var(--danger)',
                        }}
                      />
                    </div>
                    <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>
                      {t.label}
                    </div>
                    <div style={{ fontSize: 10, textAlign: 'center', marginTop: 2 }}>
                      {t.income > 0 && (
                        <span style={{ color: 'var(--success)' }}>₹{shortAmount(t.income)}</span>
                      )}
                      {t.income > 0 && t.expense > 0 && <span className="meta"> / </span>}
                      {t.expense > 0 && (
                        <span style={{ color: 'var(--danger)' }}>₹{shortAmount(t.expense)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8, marginBottom: 8 }}>
                <span className="meta" style={{ fontSize: 11 }}>
                  <span style={{ color: 'var(--success)' }}>■</span> Income
                </span>
                <span className="meta" style={{ fontSize: 11 }}>
                  <span style={{ color: 'var(--danger)' }}>■</span> Expenses
                </span>
              </div>
            </>
          )}

          {income === 0 && spent === 0 && (
            <div className="empty-state">
              <div className="empty-icon">💰</div>
              <div className="empty-text">No transactions this month. Tap + Income or + Expense to start.</div>
            </div>
          )}
        </>
      )}

      {/* ─── TRANSACTIONS ─── */}
      {view === 'txns' && (
        <>
          <input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ marginBottom: 8, fontSize: 13 }}
          />

          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {[
              ['all', 'All'],
              ['income', '↑ Income'],
              ['expense', '↓ Expenses'],
            ].map(([f, label]) => (
              <button
                key={f}
                className={`chip${typeFilter === f ? '' : ' chip-muted'}`}
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => setTypeFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="section-header">
            <span className="section-title">
              {typeFilter === 'income' ? 'Income' : typeFilter === 'expense' ? 'Expenses' : 'All Transactions'}
            </span>
            <span className="meta">{filteredTxns.length} entries</span>
          </div>

          {groups.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">💸</div>
              <div className="empty-text">{search ? 'No matching transactions.' : 'No transactions yet.'}</div>
            </div>
          )}

          {groups.map(([dayKey, items]) => (
            <div key={dayKey}>
              <div
                className="meta"
                style={{ padding: '6px 0 4px', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}
              >
                <span>{formatDate(Number(dayKey))}</span>
                {items.some((e) => e.type !== 'income') && (
                  <span className="down">
                    ₹{items.reduce((s, e) => s + (e.type === 'income' ? 0 : e.amount), 0).toLocaleString('en-IN')} spent
                  </span>
                )}
              </div>
              {items.map((e) => {
                const c = CAT_MAP[e.category]
                const isIncome = e.type === 'income'
                return (
                  <div className="card" key={e.id} style={{ padding: '10px 14px', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 22 }}>{isIncome ? '💵' : c?.emoji || '📦'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>
                            {isIncome ? (e.note || 'Income') : c?.label || e.category}
                          </span>
                          <span
                            className={isIncome ? 'up' : 'down'}
                            style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' }}
                          >
                            {isIncome ? '+' : '-'}₹{e.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="meta" style={{ fontSize: 12, marginTop: 1 }}>
                          {formatTime(e.date)}
                          {(e.note || e.person) && !isIncome && ' · '}
                          {!isIncome && e.note}
                          {!isIncome && e.note && e.person && ' · '}
                          {!isIncome && e.person && `with ${e.person}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEdit(e)}
                          title="Edit"
                          aria-label="Edit"
                          style={{ padding: '4px 6px', fontSize: 14, minWidth: 44, minHeight: 44 }}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-danger-ghost btn-sm"
                          onClick={() => handleDelete(e.id)}
                          title="Delete"
                          aria-label="Delete"
                          style={{ padding: '4px 6px', fontSize: 14, minWidth: 44, minHeight: 44 }}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </>
      )}

      {/* ─── BUDGET ─── */}
      {view === 'budget' && (
        <>
          <div className="money-month-stepper">
            <button className="btn btn-ghost btn-sm" onClick={prevMonth}>
              ◀
            </button>
            <span className="h3">{formatMonth(viewMonth)}</span>
            <button className="btn btn-ghost btn-sm" onClick={nextMonth}>
              ▶
            </button>
          </div>

          <div className="stat-row" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 20, color: 'var(--accent)' }}>
                ₹{totalBudget.toLocaleString('en-IN')}
              </div>
              <div className="stat-label">Budget</div>
            </div>
            <div className="stat-card">
              <div
                className="stat-value"
                style={{
                  fontSize: 20,
                  color: spent > totalBudget && totalBudget > 0 ? 'var(--danger)' : 'var(--warn)',
                }}
              >
                ₹{spent.toLocaleString('en-IN')}
              </div>
              <div className="stat-label">Spent</div>
            </div>
            <div className="stat-card">
              <div
                className={`stat-value ${totalBudget - spent >= 0 ? 'up' : 'down'}`}
                style={{ fontSize: 20 }}
              >
                ₹{Math.abs(totalBudget - spent).toLocaleString('en-IN')}
              </div>
              <div className="stat-label">{totalBudget - spent >= 0 ? 'Left' : 'Over'}</div>
            </div>
          </div>

          <div className="section-header">
            <span className="section-title">Category Budgets</span>
          </div>

          {CATEGORIES.map((cat) => {
            const catSpent = catSpending[cat.id] || 0
            const budget = budgets[cat.id] || 0
            const pct = budget > 0 ? Math.round((catSpent / budget) * 100) : 0
            const isEditing = editBudgetCat === cat.id

            return (
              <div key={cat.id} className="card" style={{ padding: '10px 14px', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                        marginBottom: budget > 0 ? 4 : 0,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{cat.label}</span>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="number"
                            value={budgetAmount}
                            onChange={(e) => setBudgetAmount(e.target.value)}
                            placeholder="₹"
                            max={MAX_AMOUNT}
                            style={{ width: 80, padding: '2px 6px', fontSize: 12, textAlign: 'right' }}
                            autoFocus
                            onKeyDown={(e) => e.key === 'Enter' && saveBudgetFor(cat.id)}
                          />
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => saveBudgetFor(cat.id)}
                            disabled={!budgetAmount || parseFloat(budgetAmount) <= 0 || parseFloat(budgetAmount) > MAX_AMOUNT || saving}
                          >
                            ✓
                          </button>
                          {budget > 0 && (
                            <button
                              className="btn btn-danger-ghost btn-sm"
                              style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => removeBudgetFor(cat.id)}
                            >
                              Remove
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '2px 8px', fontSize: 11 }}
                            onClick={() => setEditBudgetCat(null)}
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <span
                          className="meta"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setEditBudgetCat(cat.id)
                            setBudgetAmount(budget > 0 ? String(budget) : '')
                          }}
                        >
                          {budget > 0
                            ? `₹${catSpent.toLocaleString('en-IN')} / ₹${budget.toLocaleString('en-IN')}`
                            : '+ Set budget'}
                        </span>
                      )}
                    </div>
                    {budget > 0 && (
                      <div className="exam-progress-bar">
                        <div
                          className="exam-progress-fill"
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            background:
                              pct > 100 ? 'var(--danger)' : pct > 80 ? 'var(--warn)' : 'var(--success)',
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}

      {/* ─── GOALS ─── */}
      {view === 'goals' && (
        <>
          <div className="section-header">
            <span className="section-title">Savings Goals</span>
            <button className="btn btn-sm btn-primary" onClick={() => setShowGoalForm(true)}>
              + Goal
            </button>
          </div>

          <Sheet open={showGoalForm} onClose={() => setShowGoalForm(false)}>
            <div className="h3" style={{ marginBottom: 10 }}>
              New Goal
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {GOAL_ICONS.map((icon) => (
                <button
                  key={icon}
                  className={`expense-cat-btn${goalIcon === icon ? ' active' : ''}`}
                  style={{ padding: 6, width: 40, height: 40 }}
                  onClick={() => setGoalIcon(icon)}
                >
                  <span style={{ fontSize: 18 }}>{icon}</span>
                </button>
              ))}
            </div>
            <input
              placeholder="Goal name"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            <input
              type="number"
              placeholder="Target amount (₹)"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addGoal()}
              max={MAX_AMOUNT}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={addGoal}
                disabled={!goalName.trim() || !goalTarget || parseFloat(goalTarget) > MAX_AMOUNT || saving}
              >
                Create
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowGoalForm(false)}>
                Cancel
              </button>
            </div>
          </Sheet>

          {goals.length === 0 && !showGoalForm && (
            <div className="empty-state">
              <div className="empty-icon">🎯</div>
              <div className="empty-text">No goals yet. Set a savings target to start tracking.</div>
            </div>
          )}

          <DndArea onMove={({ id, overId, after }) => persistGoals(placeItem(goals, id, overId, { after }))}>
          <DropList id="goals" type="goal" items={goals.map((g) => g.id)}>
          {goals.map((g) => {
            const pct = g.target > 0 ? Math.round((g.saved / g.target) * 100) : 0
            const isFunding = fundGoalId === g.id
            return (
              <SortableRow key={g.id} id={g.id} type="goal">
              {(handle) => (
              <div className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  {handle}
                  <span style={{ fontSize: 28 }}>{g.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</div>
                    <div className="meta" style={{ fontSize: 13 }}>
                      ₹{g.saved.toLocaleString('en-IN')} / ₹{g.target.toLocaleString('en-IN')}
                    </div>
                    {g.createdAt && <div className="meta" style={{ fontSize: 11 }}>added {formatAdded(g.createdAt)}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 18,
                        color: pct >= 100 ? 'var(--success)' : 'var(--accent)',
                      }}
                    >
                      {pct}%
                    </div>
                    <div className="meta" style={{ fontSize: 11 }}>
                      {pct >= 100 ? 'Done!' : `₹${(g.target - g.saved).toLocaleString('en-IN')} left`}
                    </div>
                  </div>
                </div>
                <div className="exam-progress-bar" style={{ height: 8, marginBottom: 10 }}>
                  <div
                    className="exam-progress-fill"
                    style={{
                      width: `${Math.min(100, pct)}%`,
                      background: pct >= 100 ? 'var(--success)' : 'var(--accent)',
                    }}
                  />
                </div>
                {isFunding ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="Amount (₹)"
                      value={fundAmount}
                      onChange={(e) => setFundAmount(e.target.value)}
                      style={{ flex: 1, fontSize: 13, padding: '6px 10px' }}
                      autoFocus
                      max={MAX_AMOUNT}
                      onKeyDown={(e) => e.key === 'Enter' && addFunds()}
                    />
                    <button
                      className="btn btn-success btn-sm"
                      onClick={addFunds}
                      disabled={!fundAmount || parseFloat(fundAmount) <= 0 || parseFloat(fundAmount) > MAX_AMOUNT || saving}
                    >
                      + Add
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setFundGoalId(null)
                        setFundAmount('')
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-sm"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setFundGoalId(g.id)
                        setFundAmount('')
                      }}
                    >
                      + Add Funds
                    </button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteGoal(g.id)}>
                      ×
                    </button>
                  </div>
                )}
              </div>
              )}
              </SortableRow>
            )
          })}
          </DropList>
          </DndArea>
        </>
      )}

      {/* ─── LOANS ─── */}
      {view === 'loans' && (
        <>
          <div className="stat-row" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 20, color: 'var(--success)' }}>
                {totalOwedToYou > 0 ? `₹${totalOwedToYou.toLocaleString('en-IN')}` : '—'}
              </div>
              <div className="stat-label">Owed to you</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ fontSize: 20, color: 'var(--danger)' }}>
                {totalYouOwe > 0 ? `₹${totalYouOwe.toLocaleString('en-IN')}` : '—'}
              </div>
              <div className="stat-label">You owe</div>
            </div>
          </div>

          <button
            className="btn btn-primary btn-sm"
            style={{ width: '100%', marginBottom: 14 }}
            onClick={() => setShowLoanForm(true)}
          >
            + Log a loan
          </button>

          {loans.length > 0 && (
            <input
              value={loanSearch}
              onChange={(e) => setLoanSearch(e.target.value)}
              placeholder="🔍 Filter by person..."
              style={{ marginBottom: 12, fontSize: 13 }}
            />
          )}

          {owedToYou.length === 0 && youOwe.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🤝</div>
              <div className="empty-text">
                {loans.length === 0
                  ? 'No loans tracked yet. Not counted in your expenses/income.'
                  : 'No one matches your filter.'}
              </div>
            </div>
          )}

          {owedToYou.length > 0 && (
            <>
              <div className="section-header">
                <span className="section-title">Owes you</span>
              </div>
              {owedToYou.map(([who, balance]) => (
                <LoanPersonCard
                  key={who}
                  person={who}
                  balance={balance}
                  loans={loans.filter((l) => l.person.trim().toLowerCase() === who.trim().toLowerCase())}
                  expanded={expandedPerson === who}
                  onToggle={() => setExpandedPerson(expandedPerson === who ? null : who)}
                  onDelete={deleteLoanEntry}
                />
              ))}
            </>
          )}

          {youOwe.length > 0 && (
            <>
              <div className="section-header" style={{ marginTop: 6 }}>
                <span className="section-title">You owe</span>
              </div>
              {youOwe.map(([who, balance]) => (
                <LoanPersonCard
                  key={who}
                  person={who}
                  balance={balance}
                  loans={loans.filter((l) => l.person.trim().toLowerCase() === who.trim().toLowerCase())}
                  expanded={expandedPerson === who}
                  onToggle={() => setExpandedPerson(expandedPerson === who ? null : who)}
                  onDelete={deleteLoanEntry}
                />
              ))}
            </>
          )}
        </>
      )}

      {/* ─── LOG A LOAN (bottom sheet) ─── */}
      <Sheet open={showLoanForm} onClose={() => setShowLoanForm(false)}>
        <div className="h3" style={{ marginBottom: 10 }}>Log a Loan</div>

        <input
          list="loan-person-suggestions"
          placeholder="Person (e.g. Raj)"
          value={loanPerson}
          onChange={(e) => setLoanPerson(e.target.value)}
          style={{ marginBottom: 10 }}
        />
            <datalist id="loan-person-suggestions">
              {loanPeopleSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>

            <input
              type="number"
              inputMode="decimal"
              placeholder="Amount (₹)"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLoan()}
              max={MAX_AMOUNT}
              style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 10 }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
              {LOAN_ACTIONS.map((a) => (
                <button
                  key={a.id}
                  className={`chip${loanDirection === a.id ? '' : ' chip-muted'}`}
                  style={{ cursor: 'pointer', border: 'none', padding: 8, textAlign: 'center' }}
                  onClick={() => setLoanDirection(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <input
              placeholder="Note (optional)"
              value={loanNote}
              onChange={(e) => setLoanNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLoan()}
              style={{ fontSize: 13 }}
            />

            <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={remindMe} onChange={(e) => setRemindMe(e.target.checked)} />
              Remind me to follow up in 7 days
            </label>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={addLoan}
                disabled={
                  !loanPerson.trim() || !loanAmount || parseFloat(loanAmount) <= 0 ||
                  parseFloat(loanAmount) > MAX_AMOUNT || saving
                }
              >
                + Log
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowLoanForm(false)}>
                Cancel
              </button>
            </div>
      </Sheet>

      {/* ─── ADD FORM (bottom sheet) ─── */}
      <Sheet open={showAdd} onClose={() => setShowAdd(false)}>
            <div className="h3" style={{ marginBottom: 10 }}>
              {editId ? 'Edit' : 'Add'} {txnType === 'income' ? 'Income' : 'Expense'}
            </div>

            {!editId && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <button
                  className={`chip${txnType === 'expense' ? '' : ' chip-muted'}`}
                  style={{ cursor: 'pointer', border: 'none', flex: 1, textAlign: 'center', padding: 8 }}
                  onClick={() => setTxnType('expense')}
                >
                  Expense
                </button>
                <button
                  className={`chip${txnType === 'income' ? '' : ' chip-muted'}`}
                  style={{
                    cursor: 'pointer',
                    border: 'none',
                    flex: 1,
                    textAlign: 'center',
                    padding: 8,
                    ...(txnType === 'income'
                      ? { background: 'var(--success-dim)', color: 'var(--success)' }
                      : {}),
                  }}
                  onClick={() => setTxnType('income')}
                >
                  Income
                </button>
              </div>
            )}

            <input
              type="number"
              inputMode="decimal"
              placeholder="Amount (₹)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              max={MAX_AMOUNT}
              style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}
            />

            <input
              type="date"
              value={txnDate}
              max={toDateInputValue(Date.now())}
              onChange={(e) => setTxnDate(e.target.value)}
              style={{ marginBottom: 10, fontSize: 13 }}
            />

            {txnType === 'expense' && (
              <div className="expense-cat-grid">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    className={`expense-cat-btn${category === c.id ? ' active' : ''}`}
                    onClick={() => setCategory(c.id)}
                  >
                    <span style={{ fontSize: 20 }}>{c.emoji}</span>
                    <span style={{ fontSize: 10, fontWeight: 600 }}>{c.label}</span>
                  </button>
                ))}
              </div>
            )}

            <input
              placeholder={txnType === 'income' ? 'Source (e.g. Salary, Freelance)' : 'Note (optional)'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              style={{ marginTop: 10, fontSize: 13 }}
            />

            <input
              list="person-suggestions"
              placeholder={txnType === 'income' ? 'Received from (optional)' : 'With (optional, e.g. Raj)'}
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              style={{ marginTop: 8, fontSize: 13 }}
            />
            <datalist id="person-suggestions">
              {personSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="btn btn-primary btn-sm"
                style={{
                  flex: 1,
                  ...(txnType === 'income'
                    ? { background: 'var(--success)', borderColor: 'var(--success)' }
                    : {}),
                }}
                onClick={handleSave}
                disabled={
                  !amount || parseFloat(amount) <= 0 || parseFloat(amount) > MAX_AMOUNT ||
                  (txnType === 'expense' && !category) || saving
                }
              >
                {editId ? 'Save' : txnType === 'income' ? '+ Add Income' : '+ Add Expense'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
            </div>
      </Sheet>

      {/* FAB */}
      {!showAdd && !showLoanForm && view !== 'loans' && (
        <button className="expense-fab" onClick={() => openAdd()}>
          +
        </button>
      )}
    </div>
  )
}

function LoanPersonCard({ person, balance, loans, expanded, onToggle, onDelete }) {
  const owesYou = balance > 0
  const sorted = [...loans].sort((a, b) => b.date - a.date)
  return (
    <div className="card" style={{ marginBottom: 8, padding: 0 }}>
      <button className="exam-section-header" onClick={onToggle}>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div className="h3">{person}</div>
          <div className="meta" style={{ fontSize: 12 }}>
            {sorted.length} entr{sorted.length === 1 ? 'y' : 'ies'}
          </div>
        </div>
        <span className={owesYou ? 'up' : 'down'} style={{ fontWeight: 700, marginRight: 8 }}>
          ₹{Math.abs(balance).toLocaleString('en-IN')}
        </span>
        <span className="exam-section-arrow">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 12px' }}>
          {sorted.map((l) => {
            const action = LOAN_ACTIONS.find((a) => a.id === l.direction)
            return (
              <div
                key={l.id}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}
              >
                <div>
                  <div style={{ fontSize: 13 }}>{action?.label || l.direction}</div>
                  <div className="meta" style={{ fontSize: 11 }}>
                    {formatDate(l.date)}, {formatTime(l.date)}{l.note ? ` · ${l.note}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={action?.sign > 0 ? 'up' : 'down'} style={{ fontWeight: 600 }}>
                    {action?.sign > 0 ? '+' : '-'}₹{l.amount.toLocaleString('en-IN')}
                  </span>
                  <button className="btn btn-danger-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => onDelete(l.id)}>
                    ×
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
