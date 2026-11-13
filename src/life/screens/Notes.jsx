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
import { formatAdded } from '../../time.js'
import { buildChildMap, sortSiblings, collectDescendantIds, countDescendants } from '../notesTree.js'
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
  const preview = (note.body || '').trim() || '(empty note)'

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        className={`note-card${note.pinned ? ' note-pinned' : ''}`}
        data-color={note.color || undefined}
        data-selected={isSelected ? 'true' : undefined}
        style={isSelected ? { borderColor: 'var(--accent)' } : undefined}
      >
        <div className="note-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          {handle}
          {showTree && hasChildren && (
            <button
              onClick={() => ctx.toggleExpand(note.id)}
              aria-label={isExpanded ? 'Collapse sub-notes' : 'Expand sub-notes'}
              aria-expanded={isExpanded}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}
            >
              {isExpanded ? '▾' : '▸'}
            </button>
          )}
          <button
            type="button"
            className="note-open"
            aria-label={`Open note: ${preview.split('\n')[0]}`}
            aria-current={isSelected ? 'true' : undefined}
            onClick={() => ctx.select(note.id)}
            style={{
              flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none',
              color: 'inherit', font: 'inherit', padding: 0, cursor: 'pointer',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
            }}
          >
            {note.pinned && <span title="Pinned">📌 </span>}
            {preview}
          </button>
        </div>
        <div className="note-footer">
          <div>
            <div className="meta">{formatAdded(note.createdAt)}</div>
            <div className="note-tags">
              {note.tags.map((t) => (
                <button
                  key={t}
                  className={`chip${ctx.filter.trim().toLowerCase() === t.toLowerCase() ? '' : ' chip-muted'}`}
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => ctx.onTagClick(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
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
  const isFiltering = q.length > 0
  const filtered = isFiltering
    ? notes.filter((n) => n.body.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
    : notes

  const ctx = {
    filter,
    selectedId: selected?.id ?? null,
    select,
    remove,
    // When the editor sits in a Sheet or replaces the list, the row is not visible: the editor
    // shows the confirm instead.
    editorHostsConfirm: !detailInline && selected != null && confirmDeleteId === selected.id,
    confirmDeleteId, setConfirmDeleteId, confirmCascadeDelete,
    subComposeFor, setSubComposeFor, addSubNote,
    toggleExpand,
    onTagClick: (t) => setFilter((f) => (f.trim().toLowerCase() === t.toLowerCase() ? '' : t)),
    descCount: (id) => countDescendants(id, childMap),
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

      {/* Filter */}
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="🔍 Filter notes..."
        style={{ marginBottom: 12 }}
      />

      <div className="section-header">
        <span className="section-title">
          {(isFiltering ? filtered.length : notes.length)} note{(isFiltering ? filtered.length : notes.length) !== 1 ? 's' : ''}
        </span>
      </div>

      <DndArea onMove={onMove}>
        {isFiltering ? (
          filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <div className="empty-text">No notes match your filter.</div>
            </div>
          ) : (
            sortSiblings(filtered).map((n) => (
              <NoteRow key={n.id} note={n} depth={0} showTree={false} childMap={childMap} expandedIds={expandedIds} ctx={ctx} />
            ))
          )
        ) : notes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <div className="empty-text">No notes yet. Start capturing what you learn.</div>
          </div>
        ) : (
          <DropList id="root" type="note" items={sortSiblings(childMap[null] || []).map((n) => n.id)}>
            {sortSiblings(childMap[null] || []).map((n) => (
              <NoteRow key={n.id} note={n} depth={0} showTree={true} childMap={childMap} expandedIds={expandedIds} ctx={ctx} />
            ))}
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
