// Money formatters moved out of src/tabs/Expenses.jsx. Pure functions; dates are local time.

export function startOfDay(d) {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  return t.getTime()
}

export function toDateInputValue(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function fromDateInputValue(str, fallbackTs) {
  if (!str) return fallbackTs
  const [y, m, d] = str.split('-').map(Number)
  const base = new Date(fallbackTs)
  return new Date(y, m - 1, d, base.getHours(), base.getMinutes(), base.getSeconds()).getTime()
}

export function formatMonth(ts) {
  return new Date(ts).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function shortMonth(ts) {
  return new Date(ts).toLocaleDateString('en-IN', { month: 'short' })
}

// Compact amount for chart labels: 950, 5k, 1.2L, 1.0Cr (no rupee sign).
export function shortAmount(n) {
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}

// Full amount with rupee sign and Indian digit grouping, e.g. ₹1,23,456.
export function formatRupees(n) {
  return `₹${Number(n).toLocaleString('en-IN')}`
}

// "Today" / "Yesterday" / short date such as "3 Nov". `now` is injectable for tests.
export function formatDate(ts, now = Date.now()) {
  const diff = startOfDay(now) - startOfDay(ts)
  if (diff === 0) return 'Today'
  if (diff === 86400000) return 'Yesterday'
  return new Date(ts).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
}
