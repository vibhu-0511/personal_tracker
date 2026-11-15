import { useEffect, useMemo, useState } from 'react'
import Row from '../../ui/Row.jsx'
import EmptyState from '../../ui/EmptyState.jsx'
import { groupByDate, isIncome } from '../logic.js'
import { categoryInfo, CAT_MAP } from '../categories.js'
import { formatDate, formatRupees } from '../format.js'
import { formatTime } from '../../time.js'
import { useMoney } from '../MoneyContext.jsx'
import { useInspector } from '../../shell/inspectorContext.js'
import { deleteWithUndo } from '../../undo.js'

// Searchable, type-filtered transaction list grouped by day. Ports Expenses.jsx Txns (:615-723).
// Tapping a row calls onSelect(expense) when given (SpendScreen opens TxnDetail in the inspector
// pane, or the Sheet below 1024px); without onSelect it falls back to onEdit(expense).
// `selectedId` highlights a row. TxnDetail (exported below) is the inspector body.

export const TYPE_FILTERS = [
  ['all', 'All'],
  ['income', '↑ Income'],
  ['expense', '↓ Expenses'],
]

// Pure, so it can be tested without React. Matches note, person and category label.
export function filterTxns(expenses, typeFilter, search) {
  const q = (search || '').trim().toLowerCase()
  return expenses.filter((e) => {
    if (typeFilter === 'income' && !isIncome(e)) return false
    if (typeFilter === 'expense' && isIncome(e)) return false
    if (!q) return true
    return (
      (e.note || '').toLowerCase().includes(q) ||
      (e.person || '').toLowerCase().includes(q) ||
      (CAT_MAP[e.category]?.label || '').toLowerCase().includes(q)
    )
  })
}

function rowTitle(e) {
  if (isIncome(e)) return e.note || 'Income'
  return categoryInfo(e.category).label
}

function rowSub(e) {
  const parts = [formatTime(e.date)]
  if (!isIncome(e)) {
    if (e.note) parts.push(e.note)
    if (e.person) parts.push(`with ${e.person}`)
  }
  return parts.join(' · ')
}

const HEADINGS = { all: 'All Transactions', income: 'Income', expense: 'Expenses' }

export default function TxnList({ expenses, onEdit, onDelete, onSelect, selectedId = null }) {
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  const filtered = useMemo(() => filterTxns(expenses, typeFilter, search), [expenses, typeFilter, search])
  const groups = useMemo(() => groupByDate(filtered), [filtered])

  function handleTap(e) {
    if (onSelect) onSelect(e)
    else onEdit?.(e)
  }

  return (
    <section className="spend-txns" aria-label="Transactions">
      <input
        type="search"
        className="spend-search"
        placeholder="Search transactions..."
        aria-label="Search transactions"
        value={search}
        onChange={(ev) => setSearch(ev.target.value)}
      />

      <div className="spend-filters" role="group" aria-label="Filter by type">
        {TYPE_FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            className="spend-filter"
            data-active={typeFilter === f ? '' : undefined}
            aria-pressed={typeFilter === f}
            onClick={() => setTypeFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="spend-txns-head">
        <h3 className="spend-heading">{HEADINGS[typeFilter]}</h3>
        <span className="spend-meta">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
      </div>

      {groups.length === 0 && (
        <EmptyState icon="💸" text={search ? 'No matching transactions.' : 'No transactions yet.'} />
      )}

      {groups.map(([dayKey, items]) => {
        const daySpent = items.reduce((s, e) => s + (isIncome(e) ? 0 : e.amount), 0)
        return (
          <div key={dayKey} className="spend-day">
            <div className="spend-day-head">
              <span>{formatDate(Number(dayKey))}</span>
              {items.some((e) => !isIncome(e)) && (
                <span className="spend-expense-text">{formatRupees(daySpent)} spent</span>
              )}
            </div>
            <ul className="spend-day-list">
              {items.map((e) => {
                const income = isIncome(e)
                return (
                  <Row
                    key={e.id}
                    lead={<span className="spend-txn-emoji" aria-hidden="true">{income ? '💵' : categoryInfo(e.category).emoji}</span>}
                    title={
                      <span className="spend-txn-title">
                        <span>{rowTitle(e)}</span>
                        <span className={income ? 'spend-income-text' : 'spend-expense-text'}>
                          {income ? '+' : '-'}{formatRupees(e.amount)}
                        </span>
                      </span>
                    }
                    sub={rowSub(e)}
                    selected={selectedId === e.id}
                    onSelect={() => handleTap(e)}
                    trail={
                      <button
                        type="button"
                        className="spend-delete"
                        title="Delete"
                        aria-label={`Delete ${rowTitle(e)}`}
                        onClick={() => onDelete?.(e.id)}
                      >
                        ×
                      </button>
                    }
                  />
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}

// Inspector body for one transaction. Reads the live record by id, so edits and sync
// refreshes show up while it is open; closes itself when the record is gone (deleted).
export function TxnDetail({ id }) {
  const { expenses, expensesRef, persistExpenses, openEdit } = useMoney()
  const { close, wide } = useInspector()
  const e = expenses.find((x) => x.id === id)

  useEffect(() => {
    if (!e) close()
  }, [e, close])

  if (!e) return null
  const income = isIncome(e)

  function handleEdit() {
    if (!wide) close() // the edit sheet replaces the detail Sheet; the pane can stay open
    openEdit(e)
  }

  function handleDelete() {
    deleteWithUndo({
      list: expenses, id: e.id, persist: persistExpenses, ref: expensesRef, label: () => 'Entry deleted',
    })
    close()
  }

  return (
    <div className="money-detail">
      <div className="money-detail-head">
        <span className="money-detail-icon" aria-hidden="true">{income ? '💵' : categoryInfo(e.category).emoji}</span>
        <h3 className="money-detail-title">{income ? 'Income' : categoryInfo(e.category).label}</h3>
      </div>
      <div className={`money-detail-amount ${income ? 'spend-income-text' : 'spend-expense-text'}`}>
        {income ? '+' : '-'}{formatRupees(e.amount)}
      </div>
      <dl className="money-detail-fields">
        <dt>Date</dt>
        <dd>{formatDate(e.date)}, {formatTime(e.date)}</dd>
        {e.note && (<><dt>Note</dt><dd>{e.note}</dd></>)}
        {!income && e.person && (<><dt>With</dt><dd>{e.person}</dd></>)}
      </dl>
      <div className="money-detail-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={handleEdit}>Edit</button>
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={handleDelete}>Delete</button>
      </div>
    </div>
  )
}
