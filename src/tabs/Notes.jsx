import { useEffect, useState } from 'react'
import { getNotes, saveNotes } from '../store.js'

export default function Notes() {
  const [notes, setNotes] = useState([])
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [filter, setFilter] = useState('')

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

  async function remove(id) {
    await persist(notes.filter((n) => n.id !== id))
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
    <div>
      <div className="card">
        <textarea
          rows={4}
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
        <button className="act" style={{ marginTop: 8 }} onClick={add}>
          Add note
        </button>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter notes…"
        style={{ marginBottom: 12 }}
      />

      {shown.length === 0 && <div className="card muted">No notes yet.</div>}
      {shown.map((n) => (
        <div className="card" key={n.id}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {new Date(n.createdAt).toLocaleString()}
            {n.tags.length > 0 && ` · ${n.tags.join(', ')}`}
          </div>
          <button className="act" style={{ marginTop: 8 }} onClick={() => remove(n.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}
