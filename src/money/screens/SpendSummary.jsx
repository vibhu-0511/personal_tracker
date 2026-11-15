import { useState } from 'react'
import Stat from '../../ui/Stat.jsx'
import Bar from '../../ui/Bar.jsx'
import EmptyState from '../../ui/EmptyState.jsx'
import {
  monthSummary, categoryBreakdown, monthTrend, trendMax, balanceDeltaPct, categoryBudgetStatus,
} from '../logic.js'
import { categoryInfo } from '../categories.js'
import { formatRupees, shortAmount } from '../format.js'

// Month stats, category bars and the 3-month trend for the viewed month.
// Ports Expenses.jsx Overview (:438-613). Pure view: all numbers come from logic.js.

const CATS_COLLAPSED = 6
const TREND_BAR_PX = 80

function savingsTone(rate) {
  if (rate >= 20) return 'success'
  return rate >= 0 ? 'warn' : 'danger'
}

export default function SpendSummary({ expenses, budgets, viewMonth, onAdd }) {
  const [showAllCats, setShowAllCats] = useState(false)

  const { income, spent, balance, savingsRate } = monthSummary(expenses, viewMonth)
  const { items: cats } = categoryBreakdown(expenses, viewMonth)
  const maxCat = cats[0]?.total || 1
  const trend = monthTrend(expenses, viewMonth)
  const maxTrend = trendMax(trend)
  // trend is oldest first, so index 1 is last month.
  const prev = trend[trend.length - 2]
  const deltaPct = prev ? balanceDeltaPct(balance, prev.income - prev.expense) : null
  const hasMonthData = income > 0 || spent > 0

  const visibleCats = showAllCats ? cats : cats.slice(0, CATS_COLLAPSED)

  return (
    <section className="spend-summary" aria-label="Month summary">
      <div className="spend-stats">
        <Stat label="Income" value={income > 0 ? formatRupees(income) : '—'} tone="success" />
        <Stat label="Expenses" value={spent > 0 ? formatRupees(spent) : '—'} tone="danger" />
        <div className="spend-stat-cell">
          <Stat
            label="Balance"
            value={hasMonthData ? formatRupees(balance) : '—'}
            tone={balance >= 0 ? 'accent' : 'danger'}
          />
          {deltaPct !== null && (
            <div className={`spend-delta ${deltaPct >= 0 ? 'up' : 'down'}`}>
              {deltaPct >= 0 ? '+' : ''}{deltaPct}% vs last month
            </div>
          )}
        </div>
        <Stat
          label="Savings Rate"
          value={income > 0 ? `${savingsRate}%` : '—'}
          tone={income > 0 ? savingsTone(savingsRate) : 'default'}
        />
      </div>

      <div className="spend-add">
        <button type="button" className="spend-add-btn spend-add-income" onClick={() => onAdd('income')}>
          + Income
        </button>
        <button type="button" className="spend-add-btn spend-add-expense" onClick={() => onAdd('expense')}>
          + Expense
        </button>
      </div>

      {cats.length > 0 && (
        <div className="spend-block">
          <h3 className="spend-heading">Spending by Category</h3>
          <ul className="spend-cats">
            {visibleCats.map(({ id, total, pct }) => {
              const c = categoryInfo(id)
              const over = categoryBudgetStatus(total, budgets?.[id]).over
              return (
                <li key={id} className="spend-cat">
                  <span className="spend-cat-emoji" aria-hidden="true">{c.emoji}</span>
                  <div className="spend-cat-body">
                    <div className="spend-cat-head">
                      <span className="spend-cat-name">{c.label}</span>
                      <span className="spend-meta">{formatRupees(total)} ({pct}%)</span>
                    </div>
                    <Bar
                      value={(total / maxCat) * 100}
                      tone={over ? 'danger' : 'default'}
                      label={`${c.label} ${pct}% of spending${over ? ', over budget' : ''}`}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
          {cats.length > CATS_COLLAPSED && (
            <button type="button" className="spend-more" onClick={() => setShowAllCats((v) => !v)}>
              {showAllCats ? 'Show less ▴' : `Show ${cats.length - CATS_COLLAPSED} more ▾`}
            </button>
          )}
        </div>
      )}

      {trend.some((t) => t.income > 0 || t.expense > 0) && (
        <div className="spend-block">
          <h3 className="spend-heading">3-Month Trend</h3>
          <div className="spend-trend">
            {trend.map((t) => (
              <div key={t.ts} className="spend-trend-col">
                <div className="spend-trend-bars">
                  <div
                    className="spend-trend-bar spend-trend-income"
                    style={{ height: Math.max(4, (t.income / maxTrend) * TREND_BAR_PX) }}
                  />
                  <div
                    className="spend-trend-bar spend-trend-expense"
                    style={{ height: Math.max(4, (t.expense / maxTrend) * TREND_BAR_PX) }}
                  />
                </div>
                <div className="spend-meta">{t.label}</div>
                <div className="spend-trend-amounts">
                  {t.income > 0 && <span className="spend-income-text">₹{shortAmount(t.income)}</span>}
                  {t.income > 0 && t.expense > 0 && <span className="spend-meta"> / </span>}
                  {t.expense > 0 && <span className="spend-expense-text">₹{shortAmount(t.expense)}</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="spend-legend">
            <span className="spend-meta"><span className="spend-income-text">■</span> Income</span>
            <span className="spend-meta"><span className="spend-expense-text">■</span> Expenses</span>
          </div>
        </div>
      )}

      {!hasMonthData && (
        <EmptyState icon="💰" text="No transactions this month. Tap + Income or + Expense to start." />
      )}
    </section>
  )
}
