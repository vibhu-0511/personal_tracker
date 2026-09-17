import { useEffect, useState } from 'react'
import { getChecklists, saveChecklists } from '../store.js'
import { showToast } from '../toast.js'

export default function Checklist() {
  const [sections, setSections] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [addingSection, setAddingSection] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [editingSectionId, setEditingSectionId] = useState(null)
  const [editSectionName, setEditSectionName] = useState('')
  const [itemDrafts, setItemDrafts] = useState({})

  useEffect(() => {
    getChecklists().then(setSections)
  }, [])

  async function persist(next) {
    setSections(next)
    await saveChecklists(next)
  }

  function addSection() {
    const name = newSectionName.trim()
    if (!name) return
    const section = { id: String(Date.now()), name, createdAt: Date.now(), items: [] }
    persist([section, ...sections])
    setNewSectionName('')
    setAddingSection(false)
    setExpanded(section.id)
  }

  function startRename(section) {
    setEditingSectionId(section.id)
    setEditSectionName(section.name)
  }
  function saveRename(id) {
    const name = editSectionName.trim()
    if (!name) return
    persist(sections.map((s) => (s.id === id ? { ...s, name } : s)))
    setEditingSectionId(null)
  }

  function removeSection(id) {
    const section = sections.find((s) => s.id === id)
    const prev = sections
    persist(sections.filter((s) => s.id !== id))
    if (expanded === id) setExpanded(null)
    if (section) showToast(`Deleted "${section.name}"`, { undo: () => persist(prev) })
  }

  function addItem(sectionId) {
    const text = (itemDrafts[sectionId] || '').trim()
    if (!text) return
    const item = { id: String(Date.now()), text, checked: false, createdAt: Date.now() }
    persist(sections.map((s) => (s.id === sectionId ? { ...s, items: [...s.items, item] } : s)))
    setItemDrafts((d) => ({ ...d, [sectionId]: '' }))
  }

  function toggleItem(sectionId, itemId) {
    persist(
      sections.map((s) =>
        s.id === sectionId
          ? { ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)) }
          : s
      )
    )
  }

  function removeItem(sectionId, itemId) {
    persist(
      sections.map((s) => (s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s))
    )
  }

  return (
    <div className="fade-in">
      {sections.length === 0 && !addingSection && (
        <div className="empty-state">
          <div className="empty-icon">☑️</div>
          <div className="empty-text">No checklists yet. Add a section to get started.</div>
        </div>
      )}

      {sections.map((section) => {
        const isOpen = expanded === section.id
        const done = section.items.filter((i) => i.checked).length
        return (
          <div key={section.id} className="card" style={{ marginBottom: 8, padding: 0 }}>
            {editingSectionId === section.id ? (
              <div style={{ display: 'flex', gap: 8, padding: 14 }}>
                <input
                  value={editSectionName}
                  onChange={(e) => setEditSectionName(e.target.value)}
                  autoFocus
                  style={{ flex: 1 }}
                  onKeyDown={(e) => e.key === 'Enter' && saveRename(section.id)}
                />
                <button className="btn btn-primary btn-sm" onClick={() => saveRename(section.id)}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditingSectionId(null)}>Cancel</button>
              </div>
            ) : (
              <button className="exam-section-header" onClick={() => setExpanded(isOpen ? null : section.id)}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="h3">{section.name}</div>
                  <div className="meta" style={{ fontSize: 12 }}>{done}/{section.items.length} done</div>
                </div>
                <span className="exam-section-arrow">{isOpen ? '▲' : '▼'}</span>
              </button>
            )}

            {isOpen && (
              <div style={{ padding: '0 16px 12px' }}>
                {section.items.map((item) => (
                  <div key={item.id} className="exam-topic-row">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => toggleItem(section.id, item.id)}
                    />
                    <span
                      style={{
                        flex: 1,
                        textDecoration: item.checked ? 'line-through' : 'none',
                        opacity: item.checked ? 0.5 : 1,
                      }}
                    >
                      {item.text}
                    </span>
                    <button className="life-icon-btn" title="Delete item" onClick={() => removeItem(section.id, item.id)}>
                      🗑️
                    </button>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input
                    value={itemDrafts[section.id] || ''}
                    onChange={(e) => setItemDrafts((d) => ({ ...d, [section.id]: e.target.value }))}
                    placeholder="Add item..."
                    style={{ flex: 1 }}
                    onKeyDown={(e) => e.key === 'Enter' && addItem(section.id)}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => addItem(section.id)}>Add</button>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => startRename(section)}>Rename</button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => removeSection(section.id)}>
                    Delete section
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {addingSection ? (
        <div className="card" style={{ marginTop: 12 }}>
          <input
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            placeholder="Section name"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && addSection()}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={addSection} disabled={!newSectionName.trim()}>
              Create
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setAddingSection(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => setAddingSection(true)}>
          + New section
        </button>
      )}
    </div>
  )
}
