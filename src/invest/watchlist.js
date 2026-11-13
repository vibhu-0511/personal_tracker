// Pure watchlist helpers (extracted from tabs/Invest.jsx).

// Case-insensitive match on name or symbol; blank query returns the list as is.
export function filterWatchlist(items, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return items
  return items.filter((i) => i.name.toLowerCase().includes(q) || i.symbol?.toLowerCase().includes(q))
}

// IPOs first (earliest open date first), then everything else newest-added first.
export function sortWatchlist(items) {
  return [...items].sort((a, b) => {
    if (a.type === 'ipo' && b.type !== 'ipo') return -1
    if (b.type === 'ipo' && a.type !== 'ipo') return 1
    if (a.type === 'ipo' && b.type === 'ipo') return (a.ipo?.open || '').localeCompare(b.ipo?.open || '')
    return b.addedAt - a.addedAt
  })
}

// Count stock rows by day move. quotes is a map symbol -> quote. A stock is
// "unavailable" when it has no quote, the quote errored, or changePct is missing.
// Non-stock rows (IPO, MF) are ignored.
export function summarizeMovers(items, quotes) {
  const out = { up: 0, down: 0, flat: 0, unavailable: 0 }
  for (const item of items) {
    if (item.type !== 'stock') continue
    const q = quotes?.[item.symbol]
    if (!q || q.error || typeof q.changePct !== 'number') out.unavailable++
    else if (q.changePct > 0) out.up++
    else if (q.changePct < 0) out.down++
    else out.flat++
  }
  return out
}
