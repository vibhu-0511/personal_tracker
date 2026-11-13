import { useMoney } from '../MoneyContext.jsx'
import { deleteWithUndo } from '../../undo.js'
import { formatMonth } from '../format.js'
import EmptyState from '../../ui/EmptyState.jsx'
import SpendSummary from './SpendSummary.jsx'
import TxnList from './TxnList.jsx'
import './spend.css'

// Money > Spend: Overview and Txns merged (blueprint money.spend = spend + recent).
// Stacked on phones; summary and list sit side by side from 1024px (spend.css).
// onSelectTxn(expense) / selectedId let the shell inspector show a TxnDetail (R4-22).

export default function SpendScreen({ onSelectTxn, selectedId = null }) {
  const {
    expenses, budgets, expensesRef, viewMonth, prevMonth, nextMonth,
    persistExpenses, openAdd, openEdit, ready, error,
  } = useMoney()

  if (error) return <EmptyState icon="⚠️" text={`Couldn't load Money: ${error}`} />
  if (!ready) return <EmptyState text="Loading…" />

  function handleDelete(id) {
    deleteWithUndo({
      list: expenses, id, persist: persistExpenses, ref: expensesRef, label: () => 'Entry deleted',
    })
  }

  return (
    <div className="spend-screen fade-in">
      <div className="spend-month">
        <button type="button" className="spend-month-btn" onClick={prevMonth} aria-label="Previous month">◀</button>
        <h2 className="spend-month-label">{formatMonth(viewMonth)}</h2>
        <button type="button" className="spend-month-btn" onClick={nextMonth} aria-label="Next month">▶</button>
      </div>

      <div className="spend-layout">
        <SpendSummary expenses={expenses} budgets={budgets} viewMonth={viewMonth} onAdd={openAdd} />
        <TxnList
          expenses={expenses}
          onEdit={openEdit}
          onDelete={handleDelete}
          onSelect={onSelectTxn}
          selectedId={selectedId}
        />
      </div>
    </div>
  )
}
