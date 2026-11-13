import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { parseQuick } from '../logic.js'
import { useLatest } from '../../useLatest.js'
import { deleteWithUndo } from '../../undo.js'
import { newId } from '../../id.js'

export default function RemindersView({ reminders, onUpdate, now }) {
  const [quick, setQuick] = useState('')
  const [filter, setFilter] = useState('')
  const remindersRef = useLatest(reminders)

  function addReminder() {
    const text = quick.trim()
    if (!text) return
    const { title, date, at } = parseQuick(text, now)
    const when =
      at ||
      (date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 0) : null) ||
      new Date(now.getTime() + 3_600_000)
    const reminder = {
      id: newId(),
      title: title || text,
      at: when.getTime(),
      done: false,
      createdAt: Date.now(),
    }
    onUpdate([...reminders, reminder].sort((a, b) => a.at - b.at))
    setQuick('')
  }

  function toggle(id) {
    onUpdate(reminders.map((r) => (r.id === id ? { ...r, done: !r.done } : r)))
  }
  function remove(id) {
    deleteWithUndo({
      list: reminders, id, persist: onUpdate, ref: remindersRef,
      label: (reminder) => `Deleted "${reminder.title}"`,
    })
  }

  function icsHref(r) {
    return `/api/ics?title=${encodeURIComponent(r.title)}&start=${encodeURIComponent(new Date(r.at).toISOString())}`
  }

  const nowMs = now.getTime()
  const q = filter.trim().toLowerCase()
  const visible = q ? reminders.filter((r) => r.title.toLowerCase().includes(q)) : reminders
  const due = visible.filter((r) => !r.done && r.at <= nowMs)
  const upcoming = visible.filter((r) => !r.done && r.at > nowMs).sort((a, b) => a.at - b.at)
  const done = visible.filter((r) => r.done)

  return (
    <div>
      {due.length > 0 && (
        <div className="life-reminder-banner">
          ⏰ {due.length} reminder{due.length > 1 ? 's' : ''} due: {due.map((r) => r.title).join(', ')}
        </div>
      )}

      <div className="life-quick-add">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder='Remind me… "call mom tomorrow 6pm"'
          onKeyDown={(e) => e.key === 'Enter' && addReminder()}
        />
        <button className="btn btn-primary btn-sm" onClick={addReminder} disabled={!quick.trim()}>
          Add
        </button>
      </div>

      {reminders.length > 0 && (
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="🔍 Filter reminders..."
          style={{ marginBottom: 12 }}
        />
      )}

      {(due.length > 0 || upcoming.length > 0) && <div className="life-section-label">Upcoming</div>}
      <AnimatePresence initial={false}>
        {[...due, ...upcoming].map((r) => (
          <motion.div
            key={r.id}
            layout
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className={`life-row${r.at <= nowMs ? ' overdue' : ''}`}
          >
            <button className="life-check" onClick={() => toggle(r.id)} aria-label="Mark done" />
            <div className="life-row-title">{r.title}</div>
            <div className="life-row-due">
              {new Date(r.at).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
            <a className="life-icon-btn" href={icsHref(r)} title="Add to Calendar" aria-label="Add to Calendar">
              📅
            </a>
            <button className="life-icon-btn" title="Delete" aria-label="Delete" onClick={() => remove(r.id)}>
              🗑️
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⏰</div>
          <div className="empty-text">
            {reminders.length === 0 ? 'No reminders yet.' : 'No reminders match your filter.'}
          </div>
        </div>
      )}

      {done.length > 0 && (
        <>
          <div className="life-section-label">Done ({done.length})</div>
          {done.map((r) => (
            <div key={r.id} className="life-row done">
              <button className="life-check done" aria-label="Mark not done" onClick={() => toggle(r.id)}>
                ✓
              </button>
              <div className="life-row-title">{r.title}</div>
              <button className="life-icon-btn" title="Delete" aria-label="Delete" onClick={() => remove(r.id)}>
                🗑️
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
