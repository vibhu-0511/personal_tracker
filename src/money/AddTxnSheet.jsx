import { useMemo, useState } from 'react'
import Sheet from '../Sheet.jsx'
import { newId } from '../id.js'
import { useMoney } from './MoneyContext.jsx'
import { CATEGORIES, MAX_AMOUNT } from './categories.js'
import { toDateInputValue, fromDateInputValue } from './format.js'

// Add / edit an income or expense entry. Driven entirely by MoneyContext's
// sheetRequest: { mode: 'add', type } | { mode: 'edit', expense } | null.
// Ports Expenses.jsx openAdd/openEdit/handleSave and the add-form sheet.

export function isValidAmount(val) {
  return Boolean(val) && val > 0 && val <= MAX_AMOUNT
}

function initialState(request) {
  if (request.mode === 'edit') {
    const e = request.expense
    return {
      amount: String(e.amount),
      category: e.category,
      note: e.note || '',
      person: e.person || '',
      type: e.type || 'expense',
      date: toDateInputValue(e.date),
    }
  }
  return {
    amount: '',
    category: '',
    note: '',
    person: '',
    type: request.type || 'expense',
    date: toDateInputValue(Date.now()),
  }
}

function TxnForm({ request }) {
  const { expenses, persistExpenses, closeSheet, saving, runSaving } = useMoney()
  const editing = request.mode === 'edit' ? request.expense : null
  const editId = editing ? editing.id : null

  const [init] = useState(() => initialState(request))
  const [amount, setAmount] = useState(init.amount)
  const [category, setCategory] = useState(init.category)
  const [note, setNote] = useState(init.note)
  const [person, setPerson] = useState(init.person)
  const [txnType, setTxnType] = useState(init.type)
  const [txnDate, setTxnDate] = useState(init.date)

  const personSuggestions = useMemo(
    () => [...new Set(expenses.map((e) => e.person).filter(Boolean))],
    [expenses]
  )

  const val = parseFloat(amount)
  const canSave = isValidAmount(val) && !(txnType === 'expense' && !category) && !saving

  async function handleSave() {
    if (saving) return
    if (!isValidAmount(val)) return
    if (txnType === 'expense' && !category) return
    const saved = await runSaving(async () => {
      const cat = txnType === 'income' ? 'income' : category
      const withPerson = person.trim() || undefined
      if (editId) {
        await persistExpenses(
          expenses.map((e) =>
            e.id === editId
              ? {
                  ...e, amount: val, category: cat, note: note.trim(), type: txnType, person: withPerson,
                  date: fromDateInputValue(txnDate, e.date),
                }
              : e
          )
        )
      } else {
        await persistExpenses([
          {
            id: newId(), amount: val, category: cat, note: note.trim(),
            date: fromDateInputValue(txnDate, Date.now()),
            type: txnType, person: withPerson,
          },
          ...expenses,
        ])
      }
    })
    if (saved) closeSheet()
  }

  return (
    <>
      <div className="h3" style={{ marginBottom: 10 }}>
        {editId ? 'Edit' : 'Add'} {txnType === 'income' ? 'Income' : 'Expense'}
      </div>

      {!editId && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <button
            className={`chip${txnType === 'expense' ? '' : ' chip-muted'}`}
            style={{ cursor: 'pointer', border: 'none', flex: 1, textAlign: 'center', padding: 8 }}
            onClick={() => setTxnType('expense')}
          >
            Expense
          </button>
          <button
            className={`chip${txnType === 'income' ? '' : ' chip-muted'}`}
            style={{
              cursor: 'pointer',
              border: 'none',
              flex: 1,
              textAlign: 'center',
              padding: 8,
              ...(txnType === 'income'
                ? { background: 'var(--success-dim)', color: 'var(--success)' }
                : {}),
            }}
            onClick={() => setTxnType('income')}
          >
            Income
          </button>
        </div>
      )}

      <input
        type="number"
        inputMode="decimal"
        placeholder="Amount (₹)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        max={MAX_AMOUNT}
        style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}
      />

      <input
        type="date"
        value={txnDate}
        max={toDateInputValue(Date.now())}
        onChange={(e) => setTxnDate(e.target.value)}
        style={{ marginBottom: 10, fontSize: 13 }}
      />

      {txnType === 'expense' && (
        <div className="expense-cat-grid">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`expense-cat-btn${category === c.id ? ' active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              <span style={{ fontSize: 20 }}>{c.emoji}</span>
              <span style={{ fontSize: 10, fontWeight: 600 }}>{c.label}</span>
            </button>
          ))}
        </div>
      )}

      <input
        placeholder={txnType === 'income' ? 'Source (e.g. Salary, Freelance)' : 'Note (optional)'}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        style={{ marginTop: 10, fontSize: 13 }}
      />

      <input
        list="person-suggestions"
        placeholder={txnType === 'income' ? 'Received from (optional)' : 'With (optional, e.g. Raj)'}
        value={person}
        onChange={(e) => setPerson(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        style={{ marginTop: 8, fontSize: 13 }}
      />
      <datalist id="person-suggestions">
        {personSuggestions.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{
            flex: 1,
            ...(txnType === 'income'
              ? { background: 'var(--success)', borderColor: 'var(--success)' }
              : {}),
          }}
          onClick={handleSave}
          disabled={!canSave}
        >
          {editId ? 'Save' : txnType === 'income' ? '+ Add Income' : '+ Add Expense'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={closeSheet}>
          Cancel
        </button>
      </div>
    </>
  )
}

export default function AddTxnSheet() {
  const { sheetRequest, closeSheet } = useMoney()
  // The form is keyed per request so each open starts from fresh state
  // (blank for add, the entry's values for edit) and unmounts on close.
  const key = sheetRequest
    ? sheetRequest.mode === 'edit' ? `edit:${sheetRequest.expense.id}` : `add:${sheetRequest.type || 'expense'}`
    : 'closed'
  return (
    <Sheet open={Boolean(sheetRequest)} onClose={closeSheet}>
      {sheetRequest && <TxnForm key={key} request={sheetRequest} />}
    </Sheet>
  )
}
