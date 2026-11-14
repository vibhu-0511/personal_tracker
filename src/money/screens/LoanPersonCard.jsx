import { useEffect } from 'react'
import { useMoney } from '../MoneyContext.jsx'
import { useInspector } from '../../shell/inspectorContext.js'
import { LOAN_ACTIONS, computeLoanBalances } from '../logic.js'
import { formatDate, formatRupees } from '../format.js'
import { formatTime } from '../../time.js'
import { deleteWithUndo } from '../../undo.js'

// One person in the Loans list: a selectable row with the net balance (passed in, computed by
// computeLoanBalances). Selecting it opens LoanPersonDetail, the ledger, in the inspector pane
// (from 1024px) or the Sheet; it replaces the old inline accordion. Ports Expenses.jsx LoanPersonCard.
export default function LoanPersonCard({ person, balance, count, selected = false, onSelect }) {
  const owesYou = balance > 0
  return (
    <div className="card money-person-card" style={{ padding: 0 }} data-selected={selected ? '' : undefined}>
      <button
        type="button"
        className="money-person-main"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
      >
        <span className="money-person-text">
          <span className="h3">{person}</span>
          <span className="money-small">{count} entr{count === 1 ? 'y' : 'ies'}</span>
        </span>
        <span className={`money-person-balance ${owesYou ? 'up' : 'down'}`}>
          {formatRupees(Math.abs(balance))}
        </span>
        <span className="money-person-chevron" aria-hidden="true">›</span>
      </button>
    </div>
  )
}

// Inspector body: one person's entries, newest first. `person` is the display name key used by
// computeLoanBalances. Reads live loans; closes itself when the person has no entries left.
export function LoanPersonDetail({ person }) {
  const { loans, loansRef, persistLoans } = useMoney()
  const { close } = useInspector()
  const norm = person.trim().toLowerCase()
  const mine = loans.filter((l) => l.person.trim().toLowerCase() === norm)
  const sorted = [...mine].sort((a, b) => b.date - a.date)
  const balance = Object.values(computeLoanBalances(mine))[0] ?? 0

  useEffect(() => {
    if (mine.length === 0) close()
  }, [mine.length, close])

  if (mine.length === 0) return null

  function deleteEntry(id) {
    deleteWithUndo({ list: loans, id, persist: persistLoans, ref: loansRef, label: () => 'Loan entry deleted' })
  }

  return (
    <div className="money-detail">
      <div className="money-detail-head">
        <h3 className="money-detail-title">{person}</h3>
      </div>
      <div>
        <div className={`money-detail-amount ${balance > 0 ? 'up' : 'down'}`}>{formatRupees(Math.abs(balance))}</div>
        <div className="money-small">
          {balance > 0 ? 'owes you' : balance < 0 ? 'you owe' : 'settled'} · {sorted.length} entr{sorted.length === 1 ? 'y' : 'ies'}
        </div>
      </div>
      <ul className="money-detail-ledger">
        {sorted.map((l) => {
          const action = LOAN_ACTIONS.find((a) => a.id === l.direction)
          return (
            <li key={l.id} className="money-detail-entry">
              <div className="money-detail-entry-main">
                <div className="money-detail-entry-label">{action?.label || l.direction}</div>
                <div className="money-detail-entry-meta">
                  {formatDate(l.date)}, {formatTime(l.date)}{l.note ? ` · ${l.note}` : ''}
                </div>
              </div>
              <div className="money-detail-entry-amount">
                <span className={action?.sign > 0 ? 'up' : 'down'}>
                  {action?.sign > 0 ? '+' : '-'}{formatRupees(l.amount)}
                </span>
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  style={{ padding: '2px 6px' }}
                  onClick={() => deleteEntry(l.id)}
                  aria-label="Delete loan entry"
                >
                  ×
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
