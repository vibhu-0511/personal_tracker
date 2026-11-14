import { useEffect, useMemo, useRef, useState } from 'react'
import { newId } from '../../id.js'
import { deleteWithUndo } from '../../undo.js'
import { useLatest } from '../../useLatest.js'
import { useInspector, InspectorPane } from '../../shell/Inspector.jsx'
import { useInvest } from '../InvestContext.jsx'
import { market as defaultMarket, useQuotes } from '../useQuotes.js'
import { filterWatchlist, sortWatchlist } from '../watchlist.js'
import WatchRow, { WatchDetail } from './WatchRow.jsx'
import { AddStockForm, AddMfForm, AddIpoForm } from './AddForms.jsx'
import './watch.css'

const ADD_PILLS = [
  { type: 'stock', label: '+ Stock' },
  { type: 'mf', label: '+ Fund' },
  { type: 'ipo', label: '+ IPO' },
]

// Props-driven view. `quotesHook` and `market` are injectable so tests never
// touch the network; the defaults are the shared app client.
export function WatchView({
  items,
  onUpdate,
  initialType = null,
  onConsumeInitialType,
  quotesHook = useQuotes,
  market = defaultMarket,
}) {
  const [addType, setAddType] = useState(initialType || null)
  const [search, setSearch] = useState('')
  const itemsRef = useLatest(items)

  useEffect(() => {
    if (initialType) {
      setAddType(initialType)
      onConsumeInitialType?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType])

  // useQuotes keys on the symbol/code sets only, so note edits, deletes of
  // other rows and reorders never refetch.
  const stockSymbols = useMemo(() => items.filter((i) => i.type === 'stock').map((i) => i.symbol), [items])
  const mfCodes = useMemo(() => items.filter((i) => i.type === 'mf').map((i) => i.schemeCode), [items])
  const { quotes, navs, refreshing, refresh } = quotesHook({ stockSymbols, mfCodes })

  async function addItem(item) {
    await onUpdate([...itemsRef.current, { id: newId(), addedAt: Date.now(), note: '', ...item }])
    setAddType(null)
  }

  function removeItem(id) {
    deleteWithUndo({
      list: itemsRef.current, id, persist: onUpdate, ref: itemsRef,
      label: (item) => `Removed "${item.name}"`,
    })
  }

  async function updateNote(id, note) {
    await onUpdate(itemsRef.current.map((i) => (i.id === id ? { ...i, note } : i)))
  }

  const sorted = useMemo(() => sortWatchlist(filterWatchlist(items, search)), [items, search])

  // Selection lives here; the inspector (inline pane from 1024px, Sheet below)
  // is re-fed on every change so a note edit or a fresh quote shows at once.
  const { open: openInspector, close: closeInspector, node: inspectorNode, wide } = useInspector()
  const [selectedId, setSelectedId] = useState(null)
  const openedRef = useRef(false)
  const selected = selectedId ? items.find((i) => i.id === selectedId) || null : null
  const selQuote = selected?.type === 'stock' ? quotes[selected.symbol] : null
  const selNav = selected?.type === 'mf' ? navs[selected.schemeCode] : null

  useEffect(() => {
    if (!selected) {
      if (openedRef.current) { openedRef.current = false; closeInspector() }
      if (selectedId) setSelectedId(null) // the selected item was deleted
      return
    }
    openedRef.current = true
    openInspector(
      <WatchDetail
        item={selected}
        quote={selQuote}
        nav={selNav}
        onNote={(note) => updateNote(selected.id, note)}
        onDelete={() => removeItem(selected.id)}
      />,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selQuote, selNav])

  // The inspector closed itself (x, Escape, Sheet dismissed): drop the selection.
  useEffect(() => {
    if (inspectorNode == null && openedRef.current) {
      openedRef.current = false
      setSelectedId(null)
    }
  }, [inspectorNode])

  // Leaving the screen empties the inspector.
  useEffect(() => () => closeInspector(), [closeInspector])

  const toggle = (type) => setAddType((cur) => (cur === type ? null : type))

  return (
    <div className="watch-panes">
      <div className="watch-list">
      <div className="agent-bar">
        {ADD_PILLS.map((p) => (
          <button key={p.type} className={`agent-pill${addType === p.type ? ' active' : ''}`} onClick={() => toggle(p.type)}>
            {p.label}
          </button>
        ))}
      </div>

      {stockSymbols.length + mfCodes.length > 0 && (
        <div className="watch-toolbar">
          <button className="btn btn-ghost btn-sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : '↻ Refresh prices'}
          </button>
        </div>
      )}

      {addType === 'stock' && <AddStockForm market={market} onAdd={addItem} onCancel={() => setAddType(null)} />}
      {addType === 'mf' && <AddMfForm market={market} onAdd={addItem} onCancel={() => setAddType(null)} />}
      {addType === 'ipo' && <AddIpoForm onAdd={addItem} onCancel={() => setAddType(null)} />}

      {items.length > 0 && (
        <input
          className="watch-filter"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Filter watchlist..."
          aria-label="Filter watchlist"
        />
      )}

      {sorted.length === 0 && (
        <div className="empty-state watch-empty">
          <div className="empty-text">
            {items.length === 0
              ? 'Your watchlist is empty. Add a stock, fund, or IPO to track.'
              : 'No watchlist items match your filter.'}
          </div>
        </div>
      )}

      {sorted.map((item) => (
        <WatchRow
          key={item.id}
          item={item}
          quote={item.type === 'stock' ? quotes[item.symbol] : null}
          nav={item.type === 'mf' ? navs[item.schemeCode] : null}
          selected={item.id === selectedId}
          onSelect={() => setSelectedId((cur) => (cur === item.id ? null : item.id))}
        />
      ))}
      </div>

      {wide && (
        <aside className="watch-inspector" aria-label="Watch details">
          {inspectorNode != null
            ? <InspectorPane label="Watch details" />
            : <div className="meta watch-inspector-empty">Select an item to see its note and details.</div>}
        </aside>
      )}
    </div>
  )
}

// Registry screen: reads the shared watchlist from InvestContext.
export default function WatchScreen({ initialType, onConsumeInitialType }) {
  const { watchlist, updateWatchlist } = useInvest()
  return (
    <WatchView
      items={watchlist}
      onUpdate={updateWatchlist}
      initialType={initialType}
      onConsumeInitialType={onConsumeInitialType}
    />
  )
}
