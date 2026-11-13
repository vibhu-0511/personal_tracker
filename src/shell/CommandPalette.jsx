import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { navigate } from '../router.js'
import { filterCommands, navigationCommands, registry } from './commands.js'
import { buildIndex, searchIndex } from './searchIndex.js'

// Cmd/Ctrl+K palette on a native <dialog> with showModal(), like Sheet.jsx:
// Escape, focus trap and focus restore come from the browser.
//   open, onClose  controlled visibility
//   tasks, notes   optional data for search (the shell passes what it has)
export default function CommandPalette({ open, onClose, tasks, notes }) {
  const ref = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  const registered = useSyncExternalStore(registry.subscribe, registry.list, registry.list)
  const index = useMemo(() => buildIndex({ tasks, notes }), [tasks, notes])

  const rows = useMemo(() => {
    const cmds = filterCommands([...registered, ...navigationCommands()], query).map((c) => ({
      key: `cmd:${c.id}`,
      title: c.label,
      subtitle: c.hint ?? 'Command',
      run: c.run,
    }))
    const found = searchIndex(index, query, 12).map((e) => ({
      key: e.id,
      title: e.title,
      subtitle: e.subtitle,
      run: () => navigate(e.path),
    }))
    // Commands first. With no query the screen list would just repeat the
    // "Go to" commands, so only show search hits once the user types.
    return query.trim() ? [...cmds, ...found] : cmds
  }, [registered, index, query])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setQuery('')
      setActive(0)
      dialog.showModal()
      inputRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  function choose(row) {
    if (!row) return
    onClose()
    row.run()
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(rows[active])
    }
  }

  return (
    <dialog
      ref={ref}
      className="palette-dialog"
      aria-label="Command palette"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      <input
        ref={inputRef}
        className="palette-input"
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={rows[active] ? `palette-opt-${active}` : undefined}
        aria-autocomplete="list"
        placeholder="Search commands, screens, tasks, notes"
        autoComplete="off"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <ul id="palette-list" ref={listRef} className="palette-list" role="listbox">
        {rows.map((row, i) => (
          <li
            key={row.key}
            id={`palette-opt-${i}`}
            role="option"
            aria-selected={i === active}
            className="palette-item"
            onMouseMove={() => i !== active && setActive(i)}
            onClick={() => choose(row)}
          >
            <span className="palette-item-title">{row.title}</span>
            <span className="palette-item-sub">{row.subtitle}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="palette-empty" role="presentation">No matches</li>}
      </ul>
    </dialog>
  )
}
