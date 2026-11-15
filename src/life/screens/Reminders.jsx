import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { parseQuick } from '../logic.js'
import { useLatest } from '../../useLatest.js'
import { deleteWithUndo } from '../../undo.js'
import { newId } from '../../id.js'
import { reminderICSDataUrl, downloadReminderICS } from '../icsClient.js'
import MasterDetail from '../ui/MasterDetail.jsx'
import ReminderInspector from './ReminderInspector.jsx'
// MasterDetail's layout rules (shared with Tasks.jsx).
import '../life.css'

// The inspector pane starts at 1024px of `.app-root` (errata C-4), the same container
// MasterDetail measures. Below it the same editor opens as a Sheet.
const INSPECTOR_MIN = 1024

function measureWide() {
  if (typeof document === 'undefined') return false
  const el = document.querySelector('.app-root')
  return (el ? el.clientWidth : window.innerWidth) >= INSPECTOR_MIN
}

function useInspectorPane() {
  const [wide, setWide] = useState(measureWide)
  useEffect(() => {
    const el = typeof document === 'undefined' ? null : document.querySelector('.app-root')
    const measure = () => setWide(measureWide())
    measure()
    if (el && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  return wide
}

// Props: reminders, onUpdate, now as before; selectedId/onSelect optionally control the
// selection (a route param later). Until the parent passes them the screen keeps the id in
// its own top-level state, so a sync refresh that swaps `reminders` keeps the inspector open.

export default function RemindersView({ reminders, onUpdate, now, selectedId, onSelect }) {
  const [quick, setQuick] = useState('')
  const [filter, setFilter] = useState('')
  const [localSelected, setLocalSelected] = useState(null)
  const remindersRef = useLatest(reminders)
  const wide = useInspectorPane()

  const controlled = selectedId !== undefined
  const currentId = controlled ? selectedId : localSelected
  const selected = currentId ? reminders.find((r) => r.id === currentId) || null : null
  function select(id) {
    if (!controlled) setLocalSelected(id)
    onSelect?.(id)
  }

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
  // Edit title and/or time; the list is re-sorted by `at` after every change.
  function patchReminder(id, patch) {
    onUpdate(
      remindersRef.current
        .map((r) => (r.id === id ? { ...r, ...patch } : r))
        .sort((a, b) => a.at - b.at)
    )
  }
  function remove(id) {
    if (id === currentId) select(null)
    deleteWithUndo({
      list: reminders, id, persist: onUpdate, ref: remindersRef,
      label: (reminder) => `Deleted "${reminder.title}"`,
    })
  }

  // Add-to-calendar is generated on the device (no API call, no navigation away from the app).
  function addToCalendar(r, e) {
    if (e) e.preventDefault()
    downloadReminderICS(r)
  }
  function icsHref(r) {
    return reminderICSDataUrl(r)
  }

  const nowMs = now.getTime()
  const q = filter.trim().toLowerCase()
  const visible = q ? reminders.filter((r) => r.title.toLowerCase().includes(q)) : reminders
  const due = visible.filter((r) => !r.done && r.at <= nowMs)
  const upcoming = visible.filter((r) => !r.done && r.at > nowMs).sort((a, b) => a.at - b.at)
  const done = visible.filter((r) => r.done)

  const rowSelect = (id) => ({
    'data-reminder-id': id,
    'data-selected': id === currentId ? 'true' : undefined,
    'aria-current': id === currentId ? 'true' : undefined,
    tabIndex: 0,
    style: {
      cursor: 'pointer',
      ...(id === currentId ? { boxShadow: 'inset 0 0 0 2px var(--accent)' } : null),
    },
    onClick: (e) => {
      if (e.target.closest('button, input, a')) return
      select(id)
    },
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        select(id)
      }
    },
  })

  const list = (
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
            {...rowSelect(r.id)}
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
            <a
              className="life-icon-btn"
              href={icsHref(r)}
              title="Add to Calendar"
              aria-label="Add to Calendar"
              onClick={(e) => addToCalendar(r, e)}
            >
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
            <div key={r.id} className="life-row done" {...rowSelect(r.id)}>
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

  // ReminderInspector renders Add to Calendar as a plain link (icsHref), which would navigate
  // the WebView; the capture handler turns that click into the on-device download instead.
  const editor = selected && (
    <div
      style={{ display: 'contents' }}
      onClickCapture={(e) => {
        if (e.target.closest('a[aria-label="Add to Calendar"]')) addToCalendar(selected, e)
      }}
    >
      <ReminderInspector
        reminder={selected}
        onChange={patchReminder}
        onToggle={toggle}
        onDelete={remove}
        icsHref={icsHref}
        onClose={wide ? () => select(null) : undefined}
      />
    </div>
  )

  // The editor is mounted in exactly one place: the inspector pane from 1024px, otherwise the
  // detail Sheet (MasterDetail decides inline vs Sheet at 1280, so `detail` stays empty while
  // the inspector pane is showing).
  return (
    <MasterDetail
      list={list}
      inspector={wide ? (editor || <div className="meta">Select a reminder to edit it.</div>) : null}
      detail={wide ? null : editor}
      hasSelection={Boolean(selected)}
      onBack={() => select(null)}
    />
  )
}
