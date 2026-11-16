// Notes screen (R2-12): tree list, body editor and inspector.
//
//   <Notes syncTick selectedId onSelect />
//
// Layout comes from MasterDetail, measured against `.app-root` like the other Life screens:
//   >= 1280px     tree list | body editor | inspector, all inline
//   1024-1279px   tree list | inspector; the body editor opens in the side Sheet
//   600-1023px    tree list; the body editor and inspector open together in the side Sheet
//   < 600px       a tapped note replaces the list with a full-screen editor and a Back control
// The selected id lives at the top of this screen (or in the `selectedId` / `onSelect` props
// once a route owns it), never in the rows or the editors, so a sync refresh keeps it open.
import { useEffect, useState } from 'react'
import { getNotes, saveNotes } from '../../store.js'
import { showToast } from '../../toast.js'
import { useHydrate } from '../../useHydrate.js'
import { useLatest } from '../../useLatest.js'
import { deleteWithUndo } from '../../undo.js'
import { newId } from '../../id.js'
import { DndArea, DropList, DropZone, SortableRow, useDragging } from '../../dnd/Dnd.jsx'
import { placeItem, canNest } from '../../dnd/logic.js'
import { buildChildMap, sortSiblings, collectDescendantIds, countDescendants } from '../notesTree.js'
import { deriveNoteTitle } from '../noteTitle.js'
import '../notes.css'
import MasterDetail from '../ui/MasterDetail.jsx'
import NoteInspector, { NOTE_COLORS as COLORS, parseTags } from './NoteInspector.jsx'

// Same thresholds as life.css / MasterDetail.jsx; change them together.
const PHONE_MAX = 600
const INSPECTOR_MIN = 1024
const DETAIL_INLINE_MIN = 1280

function measureWidth() {
  if (typeof document === 'undefined') return 1280
  const el = document.querySelector('.app-root')
  return el ? el.clientWidth : window.innerWidth
}

function useAppWidth() {
  const [width, setWidth] = useState(measureWidth)
  useEffect(() => {
    const el = typeof document === 'undefined' ? null : document.querySelector('.app-root')
    const measure = () => setWidth(measureWidth())
    measure()
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return width
}

function relativeDay(ts) {
  const d = new Date(ts)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function PinIcon() {
  return (
    <svg className="note-pin-icon" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Pinned">
      <title>Pinned</title>
      <path d="M16 3l5 5-2 1-3 3v3l-2 2-3-3-6 6-1-1 6-6-3-3 2-2h3l3-3z" />
    </svg>
  )
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="note-color-picker" style={{ marginTop: 8 }}>
      {COLORS.map((c) => (
        <button
          key={c || 'none'}
          className={`note-swatch${c ? ` note-swatch-${c}` : ' note-swatch-none'}${value === c ? ' active' : ''}`}
          onClick={() => onChange(c)}
          aria-label={c || 'no color'}
        />
      ))}
    </div>
  )
}

function SubComposeForm({ onAdd, onCancel }) {
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [color, setColor] = useState('')
  return (
    <div className="card" style={{ marginTop: 8, marginBottom: 8 }}>
      <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Sub-note..." autoFocus />
      <input
        style={{ marginTop: 8 }}
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="tags, comma separated"
      />
      <ColorPicker value={color} onChange={setColor} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => body.trim() && onAdd(body.trim(), tags, color)}
          disabled={!body.trim()}
        >
          Add
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// "Delete this note and its N sub-notes?" with Delete / Cancel. Shown in the row while the list
// is visible, and in the editor when the editor covers the list (Sheet and full-screen modes).
function DeleteConfirm({ count, onConfirm, onCancel }) {
  return (
    <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="meta">
        Delete this note and its {count} sub-note{count !== 1 ? 's' : ''}?
      </span>
      <button className="btn btn-danger-ghost btn-sm" onClick={onConfirm}>Delete</button>
      <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
    </div>
  )
}

function NoteRow({ note, depth, showTree, childMap, expandedIds, ctx }) {
  return (
    <SortableRow id={note.id} type="note" disabled={!showTree}>
      {(handle) => (
        <NoteItem
          note={note} depth={depth} showTree={showTree} childMap={childMap}
          expandedIds={expandedIds} ctx={ctx} handle={handle}
        />
      )}
    </SortableRow>
  )
}

function NoteItem({ note, depth, showTree, childMap, expandedIds, ctx, handle }) {
  const dragging = useDragging()
  const children = childMap[note.id] || []
  const hasChildren = children.length > 0
  const isExpanded = expandedIds.has(note.id)
  const isSelected = ctx.selectedId === note.id
  const isConfirming = ctx.confirmDeleteId === note.id && !ctx.editorHostsConfirm
  const isSubComposing = ctx.subComposeFor === note.id
  const descCount = ctx.descCount(note.id)
  const { title: derivedTitle, excerpt } = deriveNoteTitle(note.body ?? note.text)
  const title = derivedTitle || '(empty note)'
  const meta = [
    (note.tags || []).map((t) => `#${t}`).join(' '),
    descCount > 0 ? `${descCount} sub-note${descCount !== 1 ? 's' : ''}` : '',
    relativeDay(note.createdAt),
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        className={`note-card${note.pinned ? ' note-pinned' : ''}`}
        data-color={note.color || undefined}
        data-selected={isSelected ? 'true' : undefined}
      >
        <div className="note-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          {handle}
          {showTree && hasChildren && (
            <button
              className="note-expand"
              onClick={() => ctx.toggleExpand(note.id)}
              aria-label={isExpanded ? 'Collapse sub-notes' : 'Expand sub-notes'}
              aria-expanded={isExpanded}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          )}
          <span className="note-dot" aria-hidden="true" />
          <button
            type="button"
            className="note-open"
            aria-label={`Open note: ${title}`}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => ctx.select(note.id)}
          >
            <span className="note-title-line">
              <span className="note-title">{title}</span>
              {note.pinned && <PinIcon />}
            </span>
            {excerpt && <span className="note-excerpt">{excerpt}</span>}
            <span className="note-meta" style={{ display: 'block' }}>{meta}</span>
          </button>
        </div>
        <div className="note-row-foot">
          {isConfirming ? (
            <DeleteConfirm
              count={descCount}
              onConfirm={() => ctx.confirmCascadeDelete(note.id)}
              onCancel={() => ctx.setConfirmDeleteId(null)}
            />
          ) : (
            <div className="note-actions">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => ctx.setSubComposeFor(isSubComposing ? null : note.id)}
              >
                + Sub-note
              </button>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => ctx.remove(note.id)}>Delete</button>
            </div>
          )}
        </div>
      </div>

      {isSubComposing && (
        <div style={{ marginLeft: 20 }}>
          <SubComposeForm
            onAdd={(text, tagsStr, color) => ctx.addSubNote(note.id, text, tagsStr, color)}
            onCancel={() => ctx.setSubComposeFor(null)}
          />
        </div>
      )}

      {showTree && hasChildren && isExpanded && (
        <DropList id={`n:${note.id}`} type="note" items={sortSiblings(children).map((c) => c.id)}>
          {sortSiblings(children).map((child) => (
            <NoteRow
              key={child.id}
              note={child}
              depth={depth + 1}
              showTree={showTree}
              childMap={childMap}
              expandedIds={expandedIds}
              ctx={ctx}
            />
          ))}
        </DropList>
      )}

      {showTree && dragging?.type === 'note' && !(hasChildren && isExpanded) &&
        dragging.id !== note.id && !collectDescendantIds(dragging.id, childMap).includes(note.id) && (
          <div style={{ marginLeft: 20 }}>
            <DropZone id={`n:${note.id}`} type="note" label="↳ nest inside" />
          </div>
        )}
    </div>
  )
}

// The body editor for the selected note. The text is a draft that commits on blur, keyed by
// note id; an unedited draft follows the stored body, so a sync refresh shows up while a draft
// the user is typing is left alone.
function NoteBodyEditor({ note, onChange }) {
  return <BodyField key={note.id} note={note} onChange={onChange} />
}

function BodyField({ note, onChange }) {
  const [draft, setDraft] = useState(note.body)
  const [seen, setSeen] = useState(note.body)
  if (note.body !== seen) {
    setSeen(note.body)
    if (draft === seen) setDraft(note.body)
  }

  function commit() {
    const next = draft.trim()
    if (!next) {
      setDraft(note.body) // an empty note is not allowed; revert
      return
    }
    if (next !== note.body) onChange(note.id, { body: next })
    if (next !== draft) setDraft(next)
  }

  return (
    <textarea
      aria-label="Note body"
      className="note-editor"
      rows={12}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      style={{ width: '100%', minHeight: 220, resize: 'vertical' }}
    />
  )
}

// Props:
//   syncTick               re-hydrates the notes when the sync engine refreshes the store
//   selectedId, onSelect   optional; the selected note id owned by a parent (route param). Until
//                          the parent passes them the screen keeps the id in its own state.
export default function Notes({ syncTick = 0, selectedId, onSelect }) {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [color, setColor] = useState('')
  const [filter, setFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [subComposeFor, setSubComposeFor] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [localSelected, setLocalSelected] = useState(null)
  const notesRef = useLatest(notes)
  const width = useAppWidth()

  const { ready, error } = useHydrate([() => getNotes().then(setNotes)], [syncTick])

  const controlled = selectedId !== undefined
  const currentId = controlled ? selectedId : localSelected
  const selected = currentId ? notes.find((n) => n.id === currentId) || null : null
  function select(id) {
    if (!controlled) setLocalSelected(id)
    onSelect?.(id)
  }

  async function persist(next) {
    setNotes(next)
    await saveNotes(next)
  }

  async function addNoteWith(text, tagsStr, noteColor, parentId) {
    const note = {
      id: newId(),
      createdAt: Date.now(),
      body: text,
      tags: parseTags(tagsStr),
      pinned: false,
      color: noteColor,
      parentId,
    }
    await persist([note, ...notes])
    return note
  }

  async function add() {
    const text = body.trim()
    if (!text) return
    await addNoteWith(text, tags, color, null)
    setBody('')
    setTags('')
    setColor('')
  }

  async function addSubNote(parentId, text, tagsStr, noteColor) {
    await addNoteWith(text, tagsStr, noteColor, parentId)
    setSubComposeFor(null)
    setExpandedIds((prev) => new Set(prev).add(parentId))
  }

  function patchNote(id, patch) {
    if ('parentId' in patch && !canNest(id, patch.parentId, notesRef.current)) return
    persist(notesRef.current.map((n) => (n.id === id ? { ...n, ...patch } : n)))
    if (patch.parentId) setExpandedIds((prev) => new Set(prev).add(patch.parentId))
  }

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const childMap = buildChildMap(notes)

  function onMove({ id, from, to, overId, after }) {
    const parentId = to === 'root' ? null : to.slice(2)
    if (!canNest(id, parentId, notes)) return
    persist(placeItem(notes, id, overId, { patch: from === to ? {} : { parentId }, after }))
    if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId))
  }

  async function remove(id) {
    const descIds = collectDescendantIds(id, childMap)
    if (descIds.length > 0) {
      setConfirmDeleteId(id)
      return
    }
    if (currentId === id) select(null)
    deleteWithUndo({ list: notes, id, persist, ref: notesRef, label: () => 'Note deleted' })
  }

  async function confirmCascadeDelete(id) {
    const descIds = collectDescendantIds(id, childMap)
    const idsToRemove = new Set([id, ...descIds])
    const removed = notes.filter((n) => idsToRemove.has(n.id))
    await persist(notes.filter((n) => !idsToRemove.has(n.id)))
    setConfirmDeleteId(null)
    if (currentId && idsToRemove.has(currentId)) select(null)
    showToast(`Deleted ${removed.length} note${removed.length !== 1 ? 's' : ''}`, {
      undo: () => persist([...removed, ...notesRef.current]),
    })
  }

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-text">Couldn't load notes: {error}</div>
      </div>
    )
  }
  if (!ready) {
    return <div className="empty-state"><div className="empty-text">Loading…</div></div>
  }

  const phone = width < PHONE_MAX
  const inspectorPane = width >= INSPECTOR_MIN
  const detailInline = width >= DETAIL_INLINE_MIN

  const q = filter.trim().toLowerCase()
  const tagQ = tagFilter.trim().toLowerCase()
  const isFiltering = q.length > 0 || tagQ.length > 0
  const filtered = isFiltering
    ? notes.filter(
        (n) =>
          (!q || (n.body ?? n.text ?? '').toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))) &&
          (!tagQ || n.tags.some((t) => t.toLowerCase() === tagQ)),
      )
    : notes

  // Tag chips: every tag in use, most used first (case-insensitive, first spelling wins).
  const tagCounts = new Map()
  for (const n of notes) {
    for (const t of n.tags) {
      const k = t.toLowerCase()
      const cur = tagCounts.get(k)
      tagCounts.set(k, { label: cur ? cur.label : t, n: (cur ? cur.n : 0) + 1 })
    }
  }
  const tagChips = [...tagCounts.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))

  const ctx = {
    selectedId: selected?.id ?? null,
    select,
    remove,
    // When the editor sits in a Sheet or replaces the list, the row is not visible: the editor
    // shows the confirm instead.
    editorHostsConfirm: !detailInline && selected != null && confirmDeleteId === selected.id,
    confirmDeleteId, setConfirmDeleteId, confirmCascadeDelete,
    subComposeFor, setSubComposeFor, addSubNote,
    toggleExpand,
    descCount: (id) => countDescendants(id, childMap),
  }

  // Pinned rows come first (sortSiblings), so the headings sit inline in the one sorted list and
  // the root DropList keeps a single container id.
  function sections(sorted, showTree) {
    const pinned = sorted.filter((n) => n.pinned).length
    const out = []
    sorted.forEach((n, i) => {
      if (i === 0 && pinned > 0) {
        out.push(<div key="h-pinned" className="notes-section-label">Pinned <span className="count">{pinned}</span></div>)
      }
      if (i === pinned) {
        out.push(<div key="h-recent" className="notes-section-label">Recent <span className="count">{sorted.length - pinned}</span></div>)
      }
      out.push(
        <NoteRow key={n.id} note={n} depth={0} showTree={showTree} childMap={childMap} expandedIds={expandedIds} ctx={ctx} />,
      )
    })
    return out
  }

  const list = (
    <div className="fade-in">
      {/* Compose */}
      <div className="card card-glow" style={{ marginBottom: 12 }}>
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you learn today?"
        />
        <input
          style={{ marginTop: 8 }}
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags, comma separated"
        />
        <ColorPicker value={color} onChange={setColor} />
        <button
          className="btn btn-primary btn-sm"
          style={{ marginTop: 10 }}
          onClick={add}
          disabled={!body.trim()}
        >
          Add note
        </button>
      </div>

      {/* Search + tag chips */}
      <input
        className="notes-search"
        type="search"
        aria-label="Search notes"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search notes"
      />
      <div className="notes-chips" role="group" aria-label="Filter by tag">
        <button type="button" className="notes-chip" aria-pressed={!tagQ} onClick={() => setTagFilter('')}>All</button>
        {tagChips.map(([k, { label }]) => (
          <button
            key={k}
            type="button"
            className="notes-chip"
            aria-pressed={tagQ === k}
            onClick={() => setTagFilter(tagQ === k ? '' : label)}
          >
            #{label}
          </button>
        ))}
      </div>

      <DndArea onMove={onMove}>
        {isFiltering ? (
          filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <div className="empty-text">No notes match your filter.</div>
            </div>
          ) : (
            sections(sortSiblings(filtered), false)
          )
        ) : notes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <div className="empty-text">No notes yet. Start capturing what you learn.</div>
          </div>
        ) : (
          <DropList id="root" type="note" items={sortSiblings(childMap[null] || []).map((n) => n.id)}>
            {sections(sortSiblings(childMap[null] || []), true)}
          </DropList>
        )}
      </DndArea>
    </div>
  )

  const inspector = selected && (
    <NoteInspector
      note={selected}
      notes={notes}
      onChange={patchNote}
      onDelete={remove}
      onClose={inspectorPane ? () => select(null) : undefined}
    />
  )

  const confirmBar = ctx.editorHostsConfirm && (
    <DeleteConfirm
      count={ctx.descCount(selected.id)}
      onConfirm={() => confirmCascadeDelete(selected.id)}
      onCancel={() => setConfirmDeleteId(null)}
    />
  )

  // The body editor is mounted in one place: inline from 1280px, otherwise in the detail Sheet
  // (or the phone's full-screen view). Below 1024px the inspector has no pane of its own, so it
  // follows the body inside the same container.
  const editor = selected && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {confirmBar}
      <NoteBodyEditor note={selected} onChange={patchNote} />
      {!inspectorPane && inspector}
    </div>
  )

  if (phone && selected) {
    return (
      <div className="note-fullscreen fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button type="button" className="md-back" onClick={() => select(null)}>Back</button>
        {editor}
      </div>
    )
  }

  return (
    <MasterDetail
      list={list}
      detail={phone ? null : editor || null}
      inspector={inspectorPane ? (inspector || <div className="meta">Select a note to edit it.</div>) : null}
      hasSelection={Boolean(selected) && !phone}
      onBack={() => select(null)}
    />
  )
}
