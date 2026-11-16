import { useMemo, useState } from 'react'
import { useMoney } from '../MoneyContext.jsx'
import { CATEGORIES, MAX_AMOUNT } from '../categories.js'
import { formatMonth, formatRupees } from '../format.js'
import { budgetStatus, categoryBreakdown, categoryBudgetStatus, totalBudget } from '../logic.js'
import EmptyState from '../../ui/EmptyState.jsx'
import Bar from '../../ui/Bar.jsx'
import './spend.css'

// Money > Budgets: per-category monthly limits with inline edit.
// Ports Expenses.jsx budget view (:725-862) and handlers (:292-310).
// budgets persists as a plain { catId: number } map (not per month), written only through persistBudgets.
// Bar colour thresholds match Expenses.jsx:850-851: over 100% danger, over 80% warn, otherwise success.

const WARN_PCT = 80
const OVER_PCT = 100

export function barColor(pct) {
  return pct > OVER_PCT ? 'var(--danger)' : pct > WARN_PCT ? 'var(--warn)' : 'var(--success)'
}

export function barTone(pct) {
  return pct > OVER_PCT ? 'danger' : pct > WARN_PCT ? 'warn' : 'success'
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
    <div className="spend-screen fade-in">
      <div className="spend-month">
        <button type="button" className="spend-month-btn" onClick={prevMonth} aria-label="Previous month">◀</button>
        <h2 className="spend-month-label">{formatMonth(viewMonth)}</h2>
        <button type="button" className="spend-month-btn" onClick={nextMonth} aria-label="Next month">▶</button>
      </div>

      <div className="spend-card">
        <div className="money-card-cols">
          <div className="money-card-col">
            <div className="spend-card-amount">{formatRupees(spent)}</div>
            <div className="spend-eyebrow">Spent</div>
          </div>
          <div className="money-card-col">
            <div className="spend-card-amount">{formatRupees(total.totalBudget)}</div>
            <div className="spend-eyebrow">Budget</div>
          </div>
          <div className="money-card-col">
            <div className="spend-card-amount" style={{ color: total.remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatRupees(Math.abs(total.remaining))}
            </div>
            <div className="spend-eyebrow">{total.remaining >= 0 ? 'Left' : 'Over'}</div>
          </div>
        </div>
      </div>

      <h3 className="spend-heading">Category Budgets</h3>

      <div className="money-cat-grid">
      {CATEGORIES.map((cat) => {
        const catSpent = catSpending[cat.id] || 0
        const budget = budgets[cat.id] || 0
        const status = categoryBudgetStatus(catSpent, budget)
        const isEditing = editCat === cat.id
        const warning = status.hasBudget && status.pct > WARN_PCT
          ? (status.pct > OVER_PCT ? `Over budget by ${formatRupees(catSpent - budget)}` : `${status.pct}% of budget used`)
          : null

        return (
          <div key={cat.id} className="spend-card money-budget-card">
            <div className="money-budget-row">
              <span className="spend-txn-emoji" aria-hidden="true">{cat.emoji}</span>
              <div className="money-budget-body">
                <div className="money-budget-head">
                  <span className="spend-cat-name">{cat.label}</span>
                  {isEditing ? (
                    <div className="money-budget-edit">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="₹"
                        max={MAX_AMOUNT}
                        aria-label={`${cat.label} monthly budget`}
                        className="money-budget-input"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveBudgetFor(cat.id)
                          else if (e.key === 'Escape') setEditCat(null)
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm money-budget-btn"
                        onClick={() => saveBudgetFor(cat.id)}
                        disabled={!canSave}
                        aria-label="Save budget"
                      >
                        ✓
                      </button>
                      {status.hasBudget && (
                        <button
                          type="button"
                          className="btn btn-danger-ghost btn-sm money-budget-btn"
                          onClick={() => removeBudgetFor(cat.id)}
                        >
                          Remove
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm money-budget-btn"
                        onClick={() => setEditCat(null)}
                        aria-label="Cancel"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="money-budget-set"
                      onClick={() => startEdit(cat.id, budget)}
                    >
                      {status.hasBudget
                        ? `${formatRupees(catSpent)} / ${formatRupees(budget)}`
                        : '+ Set budget'}
                    </button>
                  )}
                </div>
                {status.hasBudget && (
                  <Bar
                    value={Math.min(100, status.pct)}
                    tone={barTone(status.pct)}
                    label={`${cat.label} ${status.pct}% of budget used`}
                  />
                )}
                {warning && (
                  <div className="spend-mono" role="status" style={{ color: barColor(status.pct) }}>
                    ⚠️ {warning}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
      </div>
    </div>
  )
}
