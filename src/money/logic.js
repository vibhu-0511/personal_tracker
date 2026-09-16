// Loan ledger math. Positive balance = they owe you; negative = you owe them.

export const LOAN_ACTIONS = [
  { id: 'lent', label: 'I lent them money', sign: 1 },
  { id: 'theyRepaid', label: 'They paid me back', sign: -1 },
  { id: 'borrowed', label: 'I borrowed from them', sign: -1 },
  { id: 'iRepaid', label: 'I paid them back', sign: 1 },
]

const SIGN = Object.fromEntries(LOAN_ACTIONS.map((a) => [a.id, a.sign]))

export function computeLoanBalances(loans) {
  const balances = {}
  const displayNames = {} // normalized key -> first-seen display casing
  for (const l of loans) {
    const norm = l.person.trim().toLowerCase()
    if (!(norm in displayNames)) displayNames[norm] = l.person.trim()
    const key = displayNames[norm]
    balances[key] = (balances[key] || 0) + l.amount * SIGN[l.direction]
  }
  return balances
}
