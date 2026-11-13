import { useState } from 'react'
import './watch.css'

// Tiny decorative trend line from a quote's recent closes. Local stand-in for
// src/charts/Sparkline.jsx (R4-02), which is not on this branch yet.
function sparkPoints(closes, width, height) {
  const pts = (closes || []).filter((c) => typeof c === 'number' && Number.isFinite(c))
  if (pts.length < 2) return null
  const min = Math.min(...pts)
  const span = (Math.max(...pts) - min) || 1
  const pad = 2
  return pts
    .map((c, i) => {
      const x = pad + (i / (pts.length - 1)) * (width - pad * 2)
      const y = pad + (1 - (c - min) / span) * (height - pad * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function RowSpark({ closes, width = 72, height = 24 }) {
  const points = sparkPoints(closes, width, height)
  if (!points) return null
  const tone = closes[closes.length - 1] >= closes[0] ? 'up' : 'down'
  return (
    <svg className="watch-spark" data-tone={tone} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`

// One watchlist item. Pure view: quote/nav come from the parent (useQuotes), and
// onNote/onDelete only touch the persisted list, so a note edit never refetches.
export default function WatchRow({ item, quote, nav, onDelete, onNote }) {
  const [editing, setEditing] = useState(false)
  const [noteText, setNoteText] = useState(item.note || '')

  function startEdit() {
    setNoteText(item.note || '')
    setEditing(true)
  }

  function saveNote() {
    onNote(noteText.trim())
    setEditing(false)
  }

  const screenerUrl = item.type === 'stock'
    ? `https://www.screener.in/company/${item.symbol.replace(/\.(NS|BO)$/, '')}/`
    : null

  return (
    <div className="card watch-row">
      <div className="watch-row-head">
        <div>
          <div className="h3 watch-row-title">
            {screenerUrl ? <a href={screenerUrl} target="_blank" rel="noreferrer">{item.name}</a> : item.name}
          </div>
          <div className="meta">
            {item.type === 'stock' && item.symbol}
            {item.type === 'mf' && 'Mutual Fund'}
            {item.type === 'ipo' && `IPO · ${item.ipo?.open || '?'} – ${item.ipo?.close || '?'}`}
          </div>
        </div>

        <div className="watch-row-price">
          {item.type === 'stock' && (
            quote ? (
              quote.error ? (
                <span className="meta">price unavailable</span>
              ) : (
                <>
                  <div className="watch-row-price-main">{quote.price != null ? `₹${quote.price.toFixed(2)}` : '—'}</div>
                  {quote.changePct != null && (
                    <div className={`watch-row-sub ${quote.changePct >= 0 ? 'up' : 'down'}`}>{signed(quote.changePct)}%</div>
                  )}
                  {quote.price != null && item.priceAtAdd != null && (
                    <div className={`watch-row-fine ${quote.price >= item.priceAtAdd ? 'up' : 'down'}`}>
                      {quote.price >= item.priceAtAdd ? '+' : ''}₹{(quote.price - item.priceAtAdd).toFixed(2)} since added
                    </div>
                  )}
                  {quote.low52 != null && quote.high52 != null && (
                    <div className="meta watch-row-fine">52w ₹{quote.low52}–₹{quote.high52}</div>
                  )}
                  <RowSpark closes={quote.closes} />
                </>
              )
            ) : <span className="meta">loading…</span>
          )}
          {item.type === 'mf' && (
            nav ? (
              nav.error ? <span className="meta">NAV unavailable</span> : (
                <>
                  <div className="watch-row-price-main">₹{nav.nav}</div>
                  <div className="meta watch-row-fine">{nav.date}</div>
                </>
              )
            ) : <span className="meta">loading…</span>
          )}
          {item.type === 'ipo' && item.ipo?.priceBand && <div className="meta">₹{item.ipo.priceBand}</div>}
        </div>
      </div>

      {editing ? (
        <div className="watch-note-edit">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Why are you watching this?"
            aria-label={`Note for ${item.name}`}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') saveNote(); else if (e.key === 'Escape') setEditing(false) }}
          />
          <button className="btn btn-primary btn-sm" onClick={saveNote}>Save</button>
        </div>
      ) : item.note ? (
        <div className="meta watch-note" role="button" tabIndex={0} onClick={startEdit} onKeyDown={(e) => { if (e.key === 'Enter') startEdit() }}>{item.note}</div>
      ) : (
        <button className="btn btn-ghost btn-sm watch-note-add" onClick={startEdit}>+ Add note</button>
      )}

      <div className="watch-row-foot">
        {item.type === 'ipo' && item.ipo?.link ? (
          <a href={item.ipo.link} target="_blank" rel="noreferrer" className="meta">RHP / NSE page →</a>
        ) : <span />}
        <button className="btn btn-danger-ghost btn-sm" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}
