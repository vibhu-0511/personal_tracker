import { useMemo, useState } from 'react'
import { useMoney } from '../MoneyContext.jsx'
import { computeLoanBalances } from '../logic.js'
import { formatRupees } from '../format.js'
import { useInspector } from '../../shell/inspectorContext.js'
import LoanPersonCard, { LoanPersonDetail } from './LoanPersonCard.jsx'
import LoanFormSheet from './LoanFormSheet.jsx'

// Loans view: who owes you, who you owe; a person's ledger opens in the inspector pane / Sheet.
// Ports Expenses.jsx loans view. Balances come only from computeLoanBalances;
// balances inside +-0.5 are treated as settled and hidden (as before).

const SETTLED = 0.5

export default function LoansScreen() {
  const { loans } = useMoney()
  const { node, open } = useInspector()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const openPerson = node?.type === LoanPersonDetail ? node.props.person : null

  const { owedToYou, youOwe, totalOwedToYou, totalYouOwe } = useMemo(() => {
    const entries = Object.entries(computeLoanBalances(loans))
    const owed = entries.filter(([, b]) => b > SETTLED).sort((a, b) => b[1] - a[1])
    const owe = entries.filter(([, b]) => b < -SETTLED).sort((a, b) => a[1] - b[1])
    return {
      owedToYou: owed,
      youOwe: owe,
      totalOwedToYou: owed.reduce((s, [, b]) => s + b, 0),
      totalYouOwe: owe.reduce((s, [, b]) => s + Math.abs(b), 0),
    }
  }, [loans])

  const q = search.trim().toLowerCase()
  const shownOwed = q ? owedToYou.filter(([who]) => who.toLowerCase().includes(q)) : owedToYou
  const shownOwe = q ? youOwe.filter(([who]) => who.toLowerCase().includes(q)) : youOwe

  function renderCards(list) {
    return list.map(([who, balance]) => (
      <LoanPersonCard
        key={who}
        person={who}
        balance={balance}
        count={loans.filter((l) => l.person.trim().toLowerCase() === who.trim().toLowerCase()).length}
        selected={openPerson === who}
        onSelect={() => open(<LoanPersonDetail key={who} person={who} />)}
      />
    ))
  }

  return (
    <>
      <div className="money-stats-row">
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--success)' }}>
            {totalOwedToYou > 0 ? formatRupees(totalOwedToYou) : '—'}
          </div>
          <div className="stat-label">Owed to you</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--danger)' }}>
            {totalYouOwe > 0 ? formatRupees(totalYouOwe) : '—'}
          </div>
          <div className="stat-label">You owe</div>
        </div>
      </div>

      <button
        className="btn btn-primary btn-sm"
        style={{ width: '100%', marginBottom: 14 }}
        onClick={() => setShowForm(true)}
      >
        + Log a loan
      </button>

      {loans.length > 0 && (
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Filter by person..."
          style={{ marginBottom: 12, fontSize: 13 }}
        />
      )}

      {shownOwed.length === 0 && shownOwe.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🤝</div>
          <div className="empty-text">
            {loans.length === 0
              ? 'No loans tracked yet. Not counted in your expenses/income.'
              : 'No one matches your filter.'}
          </div>
        </div>
      )}

      {shownOwed.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Owes you</span>
          </div>
          <div className="money-people">{renderCards(shownOwed)}</div>
        </>
      )}

      {shownOwe.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 6 }}>
            <span className="section-title">You owe</span>
          </div>
          <div className="money-people">{renderCards(shownOwe)}</div>
        </>
      )}

      <LoanFormSheet open={showForm} onClose={() => setShowForm(false)} />
    </>
  )
}
