import { LOAN_ACTIONS } from '../logic.js'
import { formatDate, formatRupees } from '../format.js'
import { formatTime } from '../../time.js'

// One person's loan ledger: the net balance (passed in, computed by
// computeLoanBalances) and an expandable list of their entries.
// Ports Expenses.jsx LoanPersonCard.
export default function LoanPersonCard({ person, balance, loans, expanded, onToggle, onDelete }) {
  const owesYou = balance > 0
  const sorted = [...loans].sort((a, b) => b.date - a.date)
  return (
    <div className="card" style={{ marginBottom: 8, padding: 0 }}>
      <button className="exam-section-header" onClick={onToggle} aria-expanded={expanded}>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div className="h3">{person}</div>
          <div className="meta" style={{ fontSize: 12 }}>
            {sorted.length} entr{sorted.length === 1 ? 'y' : 'ies'}
          </div>
        </div>
        <span className={owesYou ? 'up' : 'down'} style={{ fontWeight: 700, marginRight: 8 }}>
          {formatRupees(Math.abs(balance))}
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
                    {action?.sign > 0 ? '+' : '-'}{formatRupees(l.amount)}
                  </span>
                  <button
                    className="btn btn-danger-ghost btn-sm"
                    style={{ padding: '2px 6px' }}
                    onClick={() => onDelete(l.id)}
                    aria-label="Delete loan entry"
                  >
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
