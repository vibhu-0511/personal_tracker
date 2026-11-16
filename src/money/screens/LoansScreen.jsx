import { useMemo, useState } from 'react'
import { useMoney } from '../MoneyContext.jsx'
import { computeLoanBalances } from '../logic.js'
import { formatRupees } from '../format.js'
import { useInspector } from '../../shell/inspectorContext.js'
import LoanPersonCard, { LoanPersonDetail } from './LoanPersonCard.jsx'
import LoanFormSheet from './LoanFormSheet.jsx'
import EmptyState from '../../ui/EmptyState.jsx'
import './spend.css'

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
    <div className="spend-screen fade-in">
      <div className="spend-card">
        <div className="money-card-cols">
          <div className="money-card-col">
            <div className="spend-card-amount" style={{ color: 'var(--success)' }}>
              {totalOwedToYou > 0 ? formatRupees(totalOwedToYou) : '—'}
            </div>
            <div className="spend-eyebrow">Owed to you</div>
          </div>
          <div className="money-card-col">
            <div className="spend-card-amount" style={{ color: 'var(--danger)' }}>
              {totalYouOwe > 0 ? formatRupees(totalYouOwe) : '—'}
            </div>
            <div className="spend-eyebrow">You owe</div>
          </div>
        </div>
      </div>

      <button type="button" className="money-action money-action-wide" onClick={() => setShowForm(true)}>
        + Log a loan
      </button>

      {loans.length > 0 && (
        <input
          className="spend-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Filter by person..."
          aria-label="Filter by person"
        />
      )}

      {shownOwed.length === 0 && shownOwe.length === 0 && (
        <EmptyState
          icon="🤝"
          text={loans.length === 0
            ? 'No loans tracked yet. Not counted in your expenses/income.'
            : 'No one matches your filter.'}
        />
      )}

      {shownOwed.length > 0 && (
        <>
          <h3 className="spend-heading">Owes you</h3>
          <div className="money-people">{renderCards(shownOwed)}</div>
        </>
      )}

      {shownOwe.length > 0 && (
        <>
          <h3 className="spend-heading">You owe</h3>
          <div className="money-people">{renderCards(shownOwe)}</div>
        </>
      )}

      <LoanFormSheet open={showForm} onClose={() => setShowForm(false)} />
    </div>
  )
}
