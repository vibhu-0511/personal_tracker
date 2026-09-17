import { useState } from 'react'
import { getNotes, saveNotes } from '../store.js'
import { showToast } from '../toast.js'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'
import { deleteWithUndo } from '../undo.js'
import { newId } from '../id.js'

const COLORS = ['', 'red', 'orange', 'green', 'blue', 'purple']

function buildChildMap(notes) {
  const map = {}
  for (const n of notes) {
    const p = n.parentId || null
    ;(map[p] ||= []).push(n)
  }
  return map
}

function sortSiblings(list) {
  return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
}

function collectDescendantIds(id, childMap) {
  const kids = childMap[id] || []
  return kids.flatMap((k) => [k.id, ...collectDescendantIds(k.id, childMap)])
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

function NoteItem({ note, depth, showTree, childMap, expandedIds, ctx }) {
  const children = childMap[note.id] || []
  const hasChildren = children.length > 0
  const isExpanded = expandedIds.has(note.id)
  const isEditing = ctx.editingId === note.id
  const isConfirming = ctx.confirmDeleteId === note.id
  const isSubComposing = ctx.subComposeFor === note.id
  const descCount = ctx.descCount(note.id)

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className={`note-card${note.pinned ? ' note-pinned' : ''}`} data-color={note.color || undefined}>
        {isEditing ? (
          <>
            <textarea rows={3} value={ctx.editBody} onChange={(e) => ctx.setEditBody(e.target.value)} autoFocus />
            <input
              style={{ marginTop: 8 }}
              value={ctx.editTags}
              onChange={(e) => ctx.setEditTags(e.target.value)}
              placeholder="tags, comma separated"
            />
            <ColorPicker value={ctx.editColor} onChange={ctx.setEditColor} />
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button className="btn btn-primary btn-sm" onClick={() => ctx.saveEdit(note.id)}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={ctx.cancelEdit}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="note-body">
              {showTree && hasChildren && (
                <button
                  onClick={() => ctx.toggleExpand(note.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', marginRight: 6, color: 'inherit', padding: 0 }}
                >
                  {isExpanded ? '▾' : '▸'}
                </button>
              )}
              {note.pinned && <span title="Pinned">📌 </span>}
              {note.body}
            </div>
            <div className="note-footer">
              <div>
                <div className="meta">
                  {new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="meta">
                    Delete this note and its {descCount} sub-note{descCount !== 1 ? 's' : ''}?
                  </span>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => ctx.confirmCascadeDelete(note.id)}>
                    Delete
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => ctx.setConfirmDeleteId(null)}>Cancel</button>
                </div>
              ) : (
                <div className="note-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => ctx.togglePin(note.id)}>
                    {note.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => ctx.setSubComposeFor(isSubComposing ? null : note.id)}
                  >
                    + Sub-note
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => ctx.startEdit(note)}>Edit</button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => ctx.remove(note.id)}>Delete</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {isSubComposing && (
        <div style={{ marginLeft: 20 }}>
          <SubComposeForm
            onAdd={(text, tagsStr, color) => ctx.addSubNote(note.id, text, tagsStr, color)}
            onCancel={() => ctx.setSubComposeFor(null)}
          />
        </div>
      )}

      {showTree && hasChildren && isExpanded &&
        sortSiblings(children).map((child) => (
          <NoteItem
            key={child.id}
            note={child}
            depth={depth + 1}
            showTree={showTree}
            childMap={childMap}
            expandedIds={expandedIds}
            ctx={ctx}
          />
        ))}
    </div>
  )
}

export default function Notes({ syncTick = 0 }) {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [color, setColor] = useState('')
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editColor, setEditColor] = useState('')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [subComposeFor, setSubComposeFor] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const notesRef = useLatest(notes)

  const { ready, error } = useHydrate([() => getNotes().then(setNotes)], [syncTick])

  async function persist(next) {
    setNotes(next)
    await saveNotes(next)
  }

  async function addNoteWith(text, tagsStr, noteColor, parentId) {
    const note = {
      id: newId(),
      createdAt: Date.now(),
      body: text,
      tags: tagsStr.split(',').map((t) => t.trim()).filter(Boolean),
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

  function startEdit(note) {
    setEditingId(note.id)
    setEditBody(note.body)
    setEditTags(note.tags.join(', '))
    setEditColor(note.color || '')
  }

  async function saveEdit(id) {
    const text = editBody.trim()
    if (!text) return
    const next = notes.map((n) =>
      n.id === id
        ? { ...n, body: text, tags: editTags.split(',').map((t) => t.trim()).filter(Boolean), color: editColor }
        : n
    )
    await persist(next)
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function togglePin(id) {
    const next = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    await persist(next)
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

  async function remove(id) {
    const descIds = collectDescendantIds(id, childMap)
    if (descIds.length > 0) {
      setConfirmDeleteId(id)
      return
    }
    if (editingId === id) setEditingId(null)
    deleteWithUndo({ list: notes, id, persist, ref: notesRef, label: () => 'Note deleted' })
  }

  async function confirmCascadeDelete(id) {
    const descIds = collectDescendantIds(id, childMap)
    const idsToRemove = new Set([id, ...descIds])
    const removed = notes.filter((n) => idsToRemove.has(n.id))
    await persist(notes.filter((n) => !idsToRemove.has(n.id)))
    setConfirmDeleteId(null)
    if (editingId && idsToRemove.has(editingId)) setEditingId(null)
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

  const q = filter.trim().toLowerCase()
  const isFiltering = q.length > 0
  const filtered = isFiltering
    ? notes.filter((n) => n.body.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
    : notes

  const ctx = {
    filter,
    editingId, editBody, setEditBody, editTags, setEditTags, editColor, setEditColor,
    startEdit, saveEdit, cancelEdit,
    togglePin,
    remove,
    confirmDeleteId, setConfirmDeleteId, confirmCascadeDelete,
    subComposeFor, setSubComposeFor, addSubNote,
    toggleExpand,
    onTagClick: (t) => setFilter((f) => (f.trim().toLowerCase() === t.toLowerCase() ? '' : t)),
    descCount: (id) => collectDescendantIds(id, childMap).length,
  }

  return (
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

      {isFiltering ? (
        filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <div className="empty-text">No notes match your filter.</div>
          </div>
        ) : (
          sortSiblings(filtered).map((n) => (
            <NoteItem key={n.id} note={n} depth={0} showTree={false} childMap={childMap} expandedIds={expandedIds} ctx={ctx} />
          ))
        )
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <div className="empty-text">No notes yet. Start capturing what you learn.</div>
        </div>
      ) : (
        sortSiblings(childMap[null] || []).map((n) => (
          <NoteItem key={n.id} note={n} depth={0} showTree={true} childMap={childMap} expandedIds={expandedIds} ctx={ctx} />
        ))
      )}
    </div>
  )
}
