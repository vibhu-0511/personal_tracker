import { useEffect, useState } from 'react'
import { getNotes, saveNotes } from '../store.js'

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editBody, setEditBody] = useState('')
  const [editTags, setEditTags] = useState('')

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
    }
    await persist([note, ...notes])
    setBody('')
    setTags('')
  }

  function startEdit(note) {
    setEditingId(note.id)
    setEditBody(note.body)
    setEditTags(note.tags.join(', '))
  }

  async function saveEdit(id) {
    const text = editBody.trim()
    if (!text) return
    const next = notes.map((n) =>
      n.id === id
        ? { ...n, body: text, tags: editTags.split(',').map((t) => t.trim()).filter(Boolean) }
        : n
    )
    await persist(next)
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function remove(id) {
    await persist(notes.filter((n) => n.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const q = filter.trim().toLowerCase()
  const shown = q
    ? notes.filter(
        (n) =>
          n.body.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      )
    : notes

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
        <div className="note-card" key={n.id}>
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
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                <button className="btn btn-primary btn-sm" onClick={() => saveEdit(n.id)}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <div className="note-body">{n.body}</div>
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
