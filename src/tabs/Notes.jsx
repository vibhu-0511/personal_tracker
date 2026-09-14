import { useEffect, useState } from 'react'
import { getNotes, saveNotes } from '../store.js'

const COLORS = ['', 'red', 'orange', 'green', 'blue', 'purple']

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [color, setColor] = useState('')
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editColor, setEditColor] = useState('')

  useEffect(() => {
    getNotes().then(setNotes)
  }, [])

  async function persist(next) {
    setNotes(next)
    await saveNotes(next)
  }

  async function add() {
    const text = body.trim()
    if (!text) return
    const note = {
      id: String(Date.now()),
      createdAt: Date.now(),
      body: text,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      pinned: false,
      color,
    }
    await persist([note, ...notes])
    setBody('')
    setTags('')
    setColor('')
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

  async function togglePin(id) {
    const next = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))
    await persist(next)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function remove(id) {
    await persist(notes.filter((n) => n.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const q = filter.trim().toLowerCase()
  const filtered = q
    ? notes.filter(
        (n) =>
          n.body.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      )
    : notes
  const shown = [...filtered].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

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
        <div className="note-color-picker" style={{ marginTop: 8 }}>
          {COLORS.map((c) => (
            <button
              key={c || 'none'}
              className={`note-swatch${c ? ` note-swatch-${c}` : ' note-swatch-none'}${color === c ? ' active' : ''}`}
              onClick={() => setColor(c)}
              aria-label={c || 'no color'}
            />
          ))}
        </div>
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
        <span className="section-title">{shown.length} note{shown.length !== 1 ? 's' : ''}</span>
      </div>

      {shown.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <div className="empty-text">
            {notes.length === 0 ? 'No notes yet. Start capturing what you learn.' : 'No notes match your filter.'}
          </div>
        </div>
      )}

      {shown.map((n) => (
        <div className={`note-card${n.pinned ? ' note-pinned' : ''}`} data-color={n.color || undefined} key={n.id}>
          {editingId === n.id ? (
            <>
              <textarea
                rows={3}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                autoFocus
              />
              <input
                style={{ marginTop: 8 }}
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="tags, comma separated"
              />
              <div className="note-color-picker" style={{ marginTop: 8 }}>
                {COLORS.map((c) => (
                  <button
                    key={c || 'none'}
                    className={`note-swatch${c ? ` note-swatch-${c}` : ' note-swatch-none'}${editColor === c ? ' active' : ''}`}
                    onClick={() => setEditColor(c)}
                    aria-label={c || 'no color'}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => saveEdit(n.id)}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="note-body">{n.pinned && <span title="Pinned">📌 </span>}{n.body}</div>
              <div className="note-footer">
                <div>
                  <div className="meta">{new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
                  <div className="note-tags">
                    {n.tags.map((t) => (
                      <span className="chip" key={t}>{t}</span>
                    ))}
                  </div>
                </div>
                <div className="note-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => togglePin(n.id)}>{n.pinned ? 'Unpin' : 'Pin'}</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(n)}>Edit</button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(n.id)}>Delete</button>
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
