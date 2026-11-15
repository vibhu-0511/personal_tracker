import { useEffect, useState } from 'react'
import './watch.css'

// Add forms for the watchlist. Each calls onAdd with the item fields only
// ({type, symbol|schemeCode, name, priceAtAdd, ipo}); the screen adds id,
// addedAt and note. `market` is the injected market client (getQuotes/searchMf).

export function AddStockForm({ onAdd, onCancel, market }) {
  const [symbol, setSymbol] = useState('')
  const [exch, setExch] = useState('NS')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    const sym = symbol.trim().toUpperCase()
    if (!sym || busy) return
    const full = `${sym}.${exch}`
    setBusy(true)
    setError('')
    try {
      const got = await market.getQuotes([full], { force: true })
      const q = got?.[full]
      if (!q || q.error) throw new Error('Symbol not found')
      await onAdd({ type: 'stock', symbol: full, name: q.name || sym, priceAtAdd: q.price ?? null })
      setSymbol('')
    } catch (e) {
      setError(String(e.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card watch-form">
      <div className="watch-form-row">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. RELIANCE"
          aria-label="Stock symbol"
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <select value={exch} onChange={(e) => setExch(e.target.value)} aria-label="Exchange">
          <option value="NS">NSE</option>
          <option value="BO">BSE</option>
        </select>
      </div>
      {error && <div className="meta watch-form-error">{error}</div>}
      <div className="watch-form-actions">
        <button className="btn btn-primary btn-sm" disabled={!symbol.trim() || busy} onClick={submit}>
          {busy ? 'Checking…' : 'Add'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export function AddMfForm({ onAdd, onCancel, market }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) { setResults([]); setBusy(false); return undefined }
    let live = true
    const t = setTimeout(() => {
      setBusy(true)
      market.searchMf(q)
        .then((list) => { if (live) setResults(list || []) })
        .catch(() => { if (live) setResults([]) })
        .finally(() => { if (live) setBusy(false) })
    }, 400)
    return () => { live = false; clearTimeout(t) }
  }, [query, market])

  async function pick(scheme) {
    await onAdd({ type: 'mf', schemeCode: scheme.schemeCode, name: scheme.schemeName })
    setQuery('')
    setResults([])
  }

  return (
    <div className="card watch-form">
      <input
        className="watch-full"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a fund, e.g. Parag Parikh Flexi Cap"
        aria-label="Search mutual funds"
      />
      {busy && <div className="meta watch-form-hint">Searching…</div>}
      {results.map((r) => (
        <button key={r.schemeCode} className="invest-mod-btn watch-result" onClick={() => pick(r)}>
          <span className="watch-result-name">{r.schemeName}</span>
        </button>
      ))}
      <div className="watch-form-actions">
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export function AddIpoForm({ onAdd, onCancel }) {
  const [name, setName] = useState('')
  const [open, setOpen] = useState('')
  const [close, setClose] = useState('')
  const [priceBand, setPriceBand] = useState('')
  const [link, setLink] = useState('')

  async function submit() {
    if (!name.trim()) return
    await onAdd({ type: 'ipo', name: name.trim(), ipo: { open, close, priceBand: priceBand.trim(), link: link.trim() } })
    setName('')
    setOpen('')
    setClose('')
    setPriceBand('')
    setLink('')
  }

  return (
    <div className="card watch-form">
      <input className="watch-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Company / IPO name" aria-label="IPO name" />
      <div className="watch-form-row">
        <input type="date" value={open} onChange={(e) => setOpen(e.target.value)} aria-label="Opens" />
        <input type="date" value={close} onChange={(e) => setClose(e.target.value)} aria-label="Closes" />
      </div>
      <input className="watch-full" value={priceBand} onChange={(e) => setPriceBand(e.target.value)} placeholder="Price band, e.g. 96-101" aria-label="Price band" />
      <input className="watch-full" value={link} onChange={(e) => setLink(e.target.value)} placeholder="NSE/BSE/RHP link" aria-label="Link" />
      <div className="watch-form-actions">
        <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={submit}>Add</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
