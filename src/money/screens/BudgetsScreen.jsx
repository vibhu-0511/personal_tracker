import { useMemo, useState } from 'react'
import { useMoney } from '../MoneyContext.jsx'
import { CATEGORIES, MAX_AMOUNT } from '../categories.js'
import { formatMonth, formatRupees } from '../format.js'
import { budgetStatus, categoryBreakdown, categoryBudgetStatus, totalBudget } from '../logic.js'
import EmptyState from '../../ui/EmptyState.jsx'

// Money > Budgets: per-category monthly limits with inline edit.
// Ports Expenses.jsx budget view (:725-862) and handlers (:292-310).
// budgets persists as a plain { catId: number } map (not per month), written only through persistBudgets.
// Bar colour thresholds match Expenses.jsx:850-851: over 100% danger, over 80% warn, otherwise success.

const WARN_PCT = 80
const OVER_PCT = 100

export function barColor(pct) {
  return pct > OVER_PCT ? 'var(--danger)' : pct > WARN_PCT ? 'var(--warn)' : 'var(--success)'
}

function validAmount(raw) {
  const val = parseFloat(raw)
  return val > 0 && val <= MAX_AMOUNT ? val : null
}

export default function BudgetsScreen() {
  const {
    expenses, budgets, viewMonth, prevMonth, nextMonth,
    persistBudgets, saving, runSaving, ready, error,
  } = useMoney()
  const [editCat, setEditCat] = useState(null)
  const [amount, setAmount] = useState('')

  const { spent, catSpending } = useMemo(() => {
    const breakdown = categoryBreakdown(expenses, viewMonth)
    return {
      spent: breakdown.spent,
      catSpending: Object.fromEntries(breakdown.items.map((i) => [i.id, i.total])),
    }
  }, [expenses, viewMonth])

  if (error) return <EmptyState icon="⚠️" text={`Couldn't load Money: ${error}`} />
  if (!ready) return <EmptyState text="Loading…" />

  const total = budgetStatus(spent, totalBudget(budgets))

  function startEdit(catId, current) {
    setEditCat(catId)
    setAmount(current > 0 ? String(current) : '')
  }

  async function saveBudgetFor(catId) {
    const val = validAmount(amount)
    if (val === null) return
    const ok = await runSaving(() => persistBudgets({ ...budgets, [catId]: val }))
    if (ok) setEditCat(null)
  }

  function removeBudgetFor(catId) {
    const next = { ...budgets }
    delete next[catId]
    persistBudgets(next)
    setEditCat(null)
  }

  const canSave = validAmount(amount) !== null && !saving

  return (
    <div className="fade-in">
      <div className="money-month-stepper">
        <button type="button" className="btn btn-ghost btn-sm" onClick={prevMonth} aria-label="Previous month">
          ◀
        </button>
        <span className="h3">{formatMonth(viewMonth)}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={nextMonth} aria-label="Next month">
          ▶
        </button>
      </div>

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--accent)' }}>
            {formatRupees(total.totalBudget)}
          </div>
          <div className="stat-label">Budget</div>
        </div>
        <div className="stat-card">
          <div
            className="stat-value"
            style={{ fontSize: 20, color: total.over ? 'var(--danger)' : 'var(--warn)' }}
          >
            {formatRupees(spent)}
          </div>
          <div className="stat-label">Spent</div>
        </div>
        <div className="stat-card">
          <div className={`stat-value ${total.remaining >= 0 ? 'up' : 'down'}`} style={{ fontSize: 20 }}>
            {formatRupees(Math.abs(total.remaining))}
          </div>
          <div className="stat-label">{total.remaining >= 0 ? 'Left' : 'Over'}</div>
        </div>
      </div>

      <div className="section-header">
        <span className="section-title">Category Budgets</span>
      </div>

      {CATEGORIES.map((cat) => {
        const catSpent = catSpending[cat.id] || 0
        const budget = budgets[cat.id] || 0
        const status = categoryBudgetStatus(catSpent, budget)
        const isEditing = editCat === cat.id
        const warning = status.hasBudget && status.pct > WARN_PCT
          ? (status.pct > OVER_PCT ? `Over budget by ${formatRupees(catSpent - budget)}` : `${status.pct}% of budget used`)
          : null

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
                    marginBottom: status.hasBudget ? 4 : 0,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{cat.label}</span>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="₹"
                        max={MAX_AMOUNT}
                        aria-label={`${cat.label} monthly budget`}
                        style={{ width: 80, padding: '2px 6px', fontSize: 12, textAlign: 'right' }}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveBudgetFor(cat.id)
                          else if (e.key === 'Escape') setEditCat(null)
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => saveBudgetFor(cat.id)}
                        disabled={!canSave}
                        aria-label="Save budget"
                      >
                        ✓
                      </button>
                      {status.hasBudget && (
                        <button
                          type="button"
                          className="btn btn-danger-ghost btn-sm"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={() => removeBudgetFor(cat.id)}
                        >
                          Remove
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => setEditCat(null)}
                        aria-label="Cancel"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="meta"
                      style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                      onClick={() => startEdit(cat.id, budget)}
                    >
                      {status.hasBudget
                        ? `${formatRupees(catSpent)} / ${formatRupees(budget)}`
                        : '+ Set budget'}
                    </button>
                  )}
                </div>
                {status.hasBudget && (
                  <div className="exam-progress-bar">
                    <div
                      className="exam-progress-fill"
                      style={{ width: `${Math.min(100, status.pct)}%`, background: barColor(status.pct) }}
                    />
                  </div>
                )}
                {warning && (
                  <div
                    className="meta"
                    role="status"
                    style={{ marginTop: 4, fontSize: 11, color: barColor(status.pct) }}
                  >
                    ⚠️ {warning}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
