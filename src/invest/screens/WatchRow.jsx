import { useState } from 'react'
import Spark from '../../ui/Spark.jsx'
import './watch.css'

const signed = (n, digits = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(digits)}`

function screenerUrlFor(item) {
  return item.type === 'stock'
    ? `https://www.screener.in/company/${item.symbol.replace(/\.(NS|BO)$/, '')}/`
    : null
}

function RowSpark({ closes }) {
  const pts = (closes || []).filter((c) => typeof c === 'number' && Number.isFinite(c))
  if (pts.length < 2) return null
  const tone = pts[pts.length - 1] >= pts[0] ? 'success' : 'danger'
  return <Spark className="watch-spark" points={pts} width={72} height={24} tone={tone} />
}

// One watchlist row: a dense, selectable summary. Pure view: quote/nav come from
// the parent (useQuotes). Selecting hands the item to the inspector (WatchDetail);
// the row itself never edits, so a note edit never refetches.
export default function WatchRow({ item, quote, nav, selected = false, onSelect }) {
  return (
    <div className={`card watch-row${selected ? ' selected' : ''}`}>
      <button
        type="button"
        className="watch-row-main"
        aria-pressed={selected}
        aria-label={`${item.name}, show details`}
        onClick={onSelect}
      >
        <div className="watch-row-head">
          <div className="watch-row-id">
            <div className="h3 watch-row-title">{item.name}</div>
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
        {item.note && <div className="meta watch-note">{item.note}</div>}
      </button>
    </div>
  )
}

// Inspector body for the selected item: note editor, price detail, IPO
// details and delete. Keyed by id so note drafts reset when selection moves.
export function WatchDetail({ item, quote, nav, onNote, onDelete }) {
  return <WatchFields key={item.id} item={item} quote={quote} nav={nav} onNote={onNote} onDelete={onDelete} />
}

function WatchFields({ item, quote, nav, onNote, onDelete }) {
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

  const screenerUrl = screenerUrlFor(item)
  const ipo = item.type === 'ipo' ? item.ipo || {} : null

  return (
    <div className="watch-detail">
      <div>
        <div className="h3 watch-detail-title">{item.name}</div>
        <div className="meta">
          {item.type === 'stock' && item.symbol}
          {item.type === 'mf' && 'Mutual Fund'}
          {item.type === 'ipo' && 'IPO'}
        </div>
      </div>

      {item.type === 'stock' && quote && !quote.error && (
        <dl className="watch-facts">
          {quote.price != null && item.priceAtAdd != null && (
            <>
              <dt>Since added</dt>
              <dd className={quote.price >= item.priceAtAdd ? 'up' : 'down'}>
                {quote.price >= item.priceAtAdd ? '+' : ''}₹{(quote.price - item.priceAtAdd).toFixed(2)}
              </dd>
            </>
          )}
          {quote.low52 != null && quote.high52 != null && (
            <>
              <dt>52 week range</dt>
              <dd>₹{quote.low52}–₹{quote.high52}</dd>
            </>
          )}
        </dl>
      )}
      {item.type === 'mf' && nav && !nav.error && (
        <dl className="watch-facts">
          <dt>NAV</dt>
          <dd>₹{nav.nav}</dd>
          <dt>As of</dt>
          <dd>{nav.date}</dd>
        </dl>
      )}
      {ipo && (
        <dl className="watch-facts">
          <dt>Opens</dt>
          <dd>{ipo.open || '?'}</dd>
          <dt>Closes</dt>
          <dd>{ipo.close || '?'}</dd>
          {ipo.priceBand && (
            <>
              <dt>Price band</dt>
              <dd>₹{ipo.priceBand}</dd>
            </>
          )}
        </dl>
      )}

      <section aria-label="Note">
        <div className="meta watch-detail-label">Note</div>
        {editing ? (
          <div className="watch-note-edit">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Why are you watching this?"
              aria-label={`Note for ${item.name}`}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNote()
                else if (e.key === 'Escape') { e.stopPropagation(); setEditing(false) }
              }}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={saveNote}>Save</button>
          </div>
        ) : item.note ? (
          <div className="watch-note-text" role="button" tabIndex={0} onClick={startEdit} onKeyDown={(e) => { if (e.key === 'Enter') startEdit() }}>
            {item.note}
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm watch-note-add" onClick={startEdit}>+ Add note</button>
        )}
      </section>

      <div className="watch-detail-actions">
        {screenerUrl && <a href={screenerUrl} target="_blank" rel="noreferrer" className="meta">Screener →</a>}
        {ipo?.link && <a href={ipo.link} target="_blank" rel="noreferrer" className="meta">RHP / NSE page →</a>}
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}
