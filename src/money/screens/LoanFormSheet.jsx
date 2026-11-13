import { useMemo, useState } from 'react'
import Sheet from '../../Sheet.jsx'
import { newId } from '../../id.js'
import { mutateReminders } from '../../store.js'
import { useMoney } from '../MoneyContext.jsx'
import { LOAN_ACTIONS } from '../logic.js'
import { MAX_AMOUNT } from '../categories.js'
import { formatRupees } from '../format.js'

// Log a loan entry, optionally with a follow-up reminder 7 days out.
// Ports Expenses.jsx addLoan and the "Log a Loan" sheet.

const FOLLOW_UP_MS = 7 * 86400000

function LoanForm({ onClose }) {
  const { loans, persistLoans, saving, runSaving } = useMoney()
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState('lent')
  const [note, setNote] = useState('')
  const [remindMe, setRemindMe] = useState(false)

  const suggestions = useMemo(() => [...new Set(loans.map((l) => l.person))], [loans])

  const val = parseFloat(amount)
  const who = person.trim()
  const valid = Boolean(val) && val > 0 && val <= MAX_AMOUNT && Boolean(who)

  async function handleSave() {
    if (saving || !valid) return
    const saved = await runSaving(async () => {
      const now = Date.now()
      await persistLoans([
        { id: newId(), person: who, amount: val, direction, note: note.trim(), date: now },
        ...loans,
      ])
      if (remindMe) {
        // Shape must stay equal to the reminders created in the Life area.
        const reminder = {
          id: newId(),
          title: `Follow up: ${formatRupees(val)} loan with ${who}`,
          at: now + FOLLOW_UP_MS,
          done: false,
          createdAt: now,
        }
        await mutateReminders((reminders) => [...reminders, reminder].sort((a, b) => a.at - b.at))
      }
    })
    if (saved) onClose()
  }

  return (
    <>
      <div className="h3" style={{ marginBottom: 10 }}>Log a Loan</div>

      <input
        list="loan-person-suggestions"
        placeholder="Person (e.g. Raj)"
        value={person}
        onChange={(e) => setPerson(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <datalist id="loan-person-suggestions">
        {suggestions.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <input
        type="number"
        inputMode="decimal"
        placeholder="Amount (₹)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        max={MAX_AMOUNT}
        style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 10 }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
        {LOAN_ACTIONS.map((a) => (
          <button
            key={a.id}
            className={`chip${direction === a.id ? '' : ' chip-muted'}`}
            style={{ cursor: 'pointer', border: 'none', padding: 8, textAlign: 'center' }}
            onClick={() => setDirection(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>

      <input
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        style={{ fontSize: 13 }}
      />

      <label className="meta" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, cursor: 'pointer' }}>
        <input type="checkbox" checked={remindMe} onChange={(e) => setRemindMe(e.target.checked)} />
        Remind me to follow up in 7 days
      </label>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={handleSave}
          disabled={!valid || saving}
        >
          + Log
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  )
}

export default function LoanFormSheet({ open, onClose }) {
  return (
    <Sheet open={open} onClose={onClose}>
      {/* Mounted only while open so every opening starts from a blank form. */}
      {open && <LoanForm onClose={onClose} />}
    </Sheet>
  )
}
