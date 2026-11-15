// NoteInspector: the side panel for one selected note (R2-12).
//
//   <NoteInspector note notes onChange onDelete onClose sketchSlot />
//
//   note        the selected note `{ id, parentId, body, tags[], pinned, color, createdAt }`
//   notes       every note, used for the parent picker (and to keep it cycle-free)
//   onChange    (id, patch) -> void; patches are merged into the note by the screen
//   onDelete    (id) -> void; the screen owns the cascade confirm and the undo toast
//   onClose     optional; shows a Close button when given
//   sketchSlot  optional node rendered in the labelled Sketch slot (the R2-19 component)
//
// Rendered by Notes.jsx in the MasterDetail inspector pane from 1024px, and below the body
// editor in the detail Sheet / full-screen editor on narrower containers. The body text is
// edited in Notes.jsx, not here. The tag field is a draft that commits on blur / Enter and is
// keyed by note id, so a sync refresh that re-renders the same note keeps the cursor.
import { useState } from 'react'
import { canNest } from '../../dnd/logic.js'
import { formatAdded } from '../../time.js'

export const NOTE_COLORS = ['', 'red', 'orange', 'green', 'blue', 'purple']

const field = { display: 'flex', flexDirection: 'column', gap: 4 }
const fieldLabel = { fontSize: 12, opacity: 0.7 }

export function noteLabel(note, max = 40) {
  const line = (note.body || '').split('\n')[0].trim() || '(empty note)'
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export function parseTags(str) {
  return str.split(',').map((t) => t.trim()).filter(Boolean)
}

export default function NoteInspector({ note, notes, onChange, onDelete, onClose, sketchSlot }) {
  // Re-key on the id so drafts reset when the selection moves to another note.
  return (
    <NoteFields
      key={note.id}
      note={note}
      notes={notes}
      onChange={onChange}
      onDelete={onDelete}
      onClose={onClose}
      sketchSlot={sketchSlot}
    />
  )
}

function NoteFields({ note, notes, onChange, onDelete, onClose, sketchSlot }) {
  const tags = note.tags || []
  const [tagDraft, setTagDraft] = useState(tags.join(', '))

  function commitTags() {
    const next = parseTags(tagDraft)
    if (next.join('\u0000') !== tags.join('\u0000')) onChange(note.id, { tags: next })
    setTagDraft(next.join(', '))
  }

  // A note can't move under itself or one of its own descendants (canNest walks the chain).
  const parentOptions = notes.filter((n) => n.id !== note.id && canNest(note.id, n.id, notes))
  const parentId = note.parentId || ''
  const parentKnown = !parentId || parentOptions.some((n) => n.id === parentId)

  return (
    <div className="note-inspector" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="life-section-label" style={{ flex: 1, margin: 0 }}>Note</div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close inspector">
            Close
          </button>
        )}
      </div>

      <label style={field}>
        <span style={fieldLabel}>Tags</span>
        <input
          aria-label="Note tags"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onBlur={commitTags}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') setTagDraft(tags.join(', '))
          }}
          placeholder="tags, comma separated"
        />
      </label>

      <div style={field}>
        <span style={fieldLabel}>Colour</span>
        <div className="note-color-picker" role="group" aria-label="Note colour">
          {NOTE_COLORS.map((c) => (
            <button
              key={c || 'none'}
              type="button"
              className={`note-swatch${c ? ` note-swatch-${c}` : ' note-swatch-none'}${(note.color || '') === c ? ' active' : ''}`}
              aria-label={c || 'no colour'}
              aria-pressed={(note.color || '') === c}
              onClick={() => onChange(note.id, { color: c })}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`chip${note.pinned ? '' : ' chip-muted'}`}
          style={{ cursor: 'pointer', border: 'none' }}
          aria-pressed={Boolean(note.pinned)}
          onClick={() => onChange(note.id, { pinned: !note.pinned })}
        >
          📌 {note.pinned ? 'Pinned' : 'Pin'}
        </button>
      </div>

      <label style={field}>
        <span style={fieldLabel}>Parent</span>
        <select
          aria-label="Parent note"
          value={parentId}
          onChange={(e) => onChange(note.id, { parentId: e.target.value || null })}
        >
          <option value="">None (top level)</option>
          {!parentKnown && <option value={parentId}>(missing parent)</option>}
          {parentOptions.map((n) => (
            <option key={n.id} value={n.id}>{noteLabel(n)}</option>
          ))}
        </select>
      </label>

      {/* Slot for the Sketch component (R2-19). Pass it as `sketchSlot`. */}
      <section data-slot="sketch" aria-label="Sketch">
        <div className="life-section-label">Sketch</div>
        {sketchSlot || <div className="meta" style={{ fontSize: 12 }}>No sketch yet.</div>}
      </section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-danger-ghost btn-sm" onClick={() => onDelete(note.id)}>
          Delete
        </button>
      </div>
      <div className="meta" style={{ fontSize: 11 }}>created {formatAdded(note.createdAt)}</div>
    </div>
  )
}
