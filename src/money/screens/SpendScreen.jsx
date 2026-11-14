import { useMoney } from '../MoneyContext.jsx'
import { deleteWithUndo } from '../../undo.js'
import { formatMonth } from '../format.js'
import EmptyState from '../../ui/EmptyState.jsx'
import SpendSummary from './SpendSummary.jsx'
import TxnList, { TxnDetail } from './TxnList.jsx'
import { useInspector } from '../../shell/inspectorContext.js'
import './spend.css'

// Money > Spend: Overview and Txns merged (blueprint money.spend = spend + recent).
// Stacked in a narrow main area, side by side in a wide one (spend.css, `money` container).
// Selecting a row opens TxnDetail through useInspector(): the right-hand pane from 1024px,
// the Sheet below. onSelectTxn / selectedId still override that when a caller passes them.

export default function SpendScreen({ onSelectTxn, selectedId = null }) {
  const {
    expenses, budgets, expensesRef, viewMonth, prevMonth, nextMonth,
    persistExpenses, openAdd, openEdit, ready, error,
  } = useMoney()

  const { node, open } = useInspector()

  if (error) return <EmptyState icon="⚠️" text={`Couldn't load Money: ${error}`} />
  if (!ready) return <EmptyState text="Loading…" />

  const openedId = node?.type === TxnDetail ? node.props.id : null
  const activeId = selectedId ?? openedId
  const handleSelect = onSelectTxn ?? ((e) => open(<TxnDetail key={e.id} id={e.id} />))

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
          onSelect={handleSelect}
          selectedId={activeId}
        />
      </div>
    </div>
  )
}
