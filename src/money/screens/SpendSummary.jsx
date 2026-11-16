import { useState } from 'react'
import Bar from '../../ui/Bar.jsx'
import SegDots from '../../ui/SegDots.jsx'
import EmptyState from '../../ui/EmptyState.jsx'
import {
  monthSummary, categoryBreakdown, monthTrend, trendMax, categoryBudgetStatus, totalBudget, budgetStatus,
} from '../logic.js'
import { categoryInfo } from '../categories.js'
import { formatRupees, shortAmount } from '../format.js'

// Spend top block (E4-04): month card, logging strip, "Nothing spent today", add buttons.
// SpendBreakdown (category bars and 3-month trend) is rendered below the day list by SpendScreen.
// Pure view: all numbers come from logic.js and dayLog.js via props.

const CATS_COLLAPSED = 6
const TREND_BAR_PX = 80

export default function SpendSummary({
  expenses, budgets, viewMonth, onAdd, logStreak = 0, strip = [], onNoSpend,
}) {
  const { income, spent } = monthSummary(expenses, viewMonth)
  const hasMonthData = income > 0 || spent > 0
  const b = budgetStatus(spent, totalBudget(budgets))
  const loggedCount = strip.filter(Boolean).length
  const todayLogged = strip.length > 0 && strip[strip.length - 1]

  return (
    <section className="spend-summary" aria-label="Month summary">
      <div className="spend-card">
        <div className="spend-card-amount">{formatRupees(spent)}</div>
        {b.hasBudget ? (
          <>
            <div className="spend-card-of">of {formatRupees(b.totalBudget)}</div>
            <Bar
              value={b.pct}
              tone={b.over ? 'danger' : 'default'}
              label={`${b.pct}% of budget used`}
            />
            <div className="spend-card-left" data-over={b.over ? '' : undefined}>
              {b.over
                ? `${formatRupees(-b.remaining)} over · ${b.pct}% of budget used`
                : `${formatRupees(b.remaining)} left · ${b.pct}% of budget used`}
            </div>
          </>
        ) : (
          <div className="spend-card-of">No budget set. Add one under Budgets.</div>
        )}
      </div>

      <div className="spend-log">
        <div className="spend-log-head">
          <span className="spend-eyebrow">Logged {logStreak} {logStreak === 1 ? 'day' : 'days'} in a row</span>
          <span className="spend-mono">{loggedCount} of {strip.length}</span>
        </div>
        <SegDots filled={loggedCount} total={strip.length} label={`${loggedCount} of ${strip.length} days logged this month`} className="spend-log-dots" />
      </div>

      {!todayLogged && onNoSpend && (
        <button type="button" className="spend-nospend" onClick={onNoSpend}>Nothing spent today</button>
      )}

      <div className="spend-add">
        <button type="button" className="spend-add-btn spend-add-income" onClick={() => onAdd('income')}>
          + Income
        </button>
        <button type="button" className="spend-add-btn spend-add-expense" onClick={() => onAdd('expense')}>
          + Expense
        </button>
      </div>

      {!hasMonthData && (
        <EmptyState icon="💰" text="No transactions this month. Tap + Income or + Expense to start." />
      )}
    </section>
  )
}

export function SpendBreakdown({ expenses, budgets, viewMonth }) {
  const [showAllCats, setShowAllCats] = useState(false)
  const { items: cats } = categoryBreakdown(expenses, viewMonth)
  const maxCat = cats[0]?.total || 1
  const trend = monthTrend(expenses, viewMonth)
  const maxTrend = trendMax(trend)
  const visibleCats = showAllCats ? cats : cats.slice(0, CATS_COLLAPSED)

  if (cats.length === 0 && !trend.some((t) => t.income > 0 || t.expense > 0)) return null

  return (
    <section className="spend-breakdown" aria-label="Breakdown">
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
    </section>
  )
}
