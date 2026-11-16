import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { parseQuick } from '../logic.js'
import { useLatest } from '../../useLatest.js'
import { deleteWithUndo } from '../../undo.js'
import { newId } from '../../id.js'
import Icon from '../../ui/Icon.jsx'
import { getNotes } from '../../store.js'
import { navigate } from '../../router.js'
import { deriveNoteTitle } from '../noteTitle.js'
import { useLife } from '../LifeData.jsx'
import { isRepeating } from '../reminderLogic.js'
import { reminderICSDataUrl, downloadReminderICS } from '../icsClient.js'
import MasterDetail from '../ui/MasterDetail.jsx'
import ReminderInspector from './ReminderInspector.jsx'
// MasterDetail's layout rules (shared with Tasks.jsx), then this screen's own styles.
import '../life.css'
import '../reminders.css'

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


const startOfDay = (d, plus = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plus).getTime()

// Overdue, Today (still open today), Tomorrow, Later and Done, each sorted by time.
// Overdue is anything open whose time has passed, including earlier today.
export function groupReminders(list, now) {
  const nowMs = now.getTime()
  const tomorrow = startOfDay(now, 1)
  const dayAfter = startOfDay(now, 2)
  const out = { overdue: [], today: [], tomorrow: [], later: [], done: [] }
  for (const r of [...list].sort((a, b) => a.at - b.at)) {
    if (r.done) out.done.push(r)
    else if (r.at <= nowMs) out.overdue.push(r)
    else if (r.at < tomorrow) out.today.push(r)
    else if (r.at < dayAfter) out.tomorrow.push(r)
    else out.later.push(r)
  }
  return out
}

// The overdue chip: 7 PM today, or 7 PM tomorrow once today's 7 PM has passed.
function overdueChipTarget(now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19).getTime()
  if (today > now.getTime()) return { at: today, label: 'Today 7 PM' }
  return { at: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 19).getTime(), label: 'Tomorrow 7 PM' }
}

const timeOf = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

function relative(ms, nowMs) {
  const mins = Math.round(Math.abs(ms - nowMs) / 60_000)
  const span = mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`
  return ms > nowMs ? `in ${span}` : `${span} ago`
}

// Mono meta line, e.g. "5:00 PM · in 42 min".
function metaLine(at, now, kind) {
  const nowMs = now.getTime()
  const sameDay = startOfDay(new Date(at)) === startOfDay(now)
  const day = new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  if (kind === 'done') return sameDay ? timeOf(at) : `${day} · ${timeOf(at)}`
  if (kind === 'overdue') return `${sameDay ? timeOf(at) : `${day} · ${timeOf(at)}`} · ${relative(at, nowMs)}`
  if (sameDay) return `${timeOf(at)} · ${relative(at, nowMs)}`
  return `${day} · ${timeOf(at)}`
}

// Phone only (hidden from 600px in reminders.css): two pinned notes, newest first when
// nothing is pinned, with a link to the Notes view.
function PinnedNotes() {
  const [notes, setNotes] = useState([])
  useEffect(() => {
    let off = false
    Promise.resolve(getNotes()).then((n) => { if (!off && Array.isArray(n)) setNotes(n) }).catch(() => {})
    return () => { off = true }
  }, [])
  const pinned = notes.filter((n) => n.pinned && !n.parentId).slice(0, 2)
  if (pinned.length === 0) return null
  return (
    <section className="rem-pinned" aria-label="Pinned notes">
      <h3 className="rem-section-label">
        <span>Pinned notes</span>
        <button className="rem-link" onClick={() => navigate('/life/notes')}>See all</button>
      </h3>
      {pinned.map((n) => {
        const { title, excerpt } = deriveNoteTitle(n.body ?? n.text)
        return (
          <div key={n.id} className="rem-note">
            <Icon name="pin" size={16} className="rem-note-pin" />
            <div className="rem-main">
              <div className="rem-title">{title || 'Untitled'}</div>
              {excerpt && <div className="rem-excerpt">{excerpt}</div>}
            </div>
          </div>
        )
      })}
    </section>
  )
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
  const { snoozeReminder, rescheduleReminder, setReminderRepeat, completeReminder } = useLife()

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
  const sections = groupReminders(visible, now)
  const overdueTarget = overdueChipTarget(now)

  const rowSelect = (id) => ({
    'data-reminder-id': id,
    'data-selected': id === currentId ? 'true' : undefined,
    'aria-current': id === currentId ? 'true' : undefined,
    tabIndex: 0,
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

  function renderRow(r, kind) {
    const repeating = isRepeating(r)
    return (
      <motion.div
        key={r.id}
        layout
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: 40 }}
        className={`rem-row${kind === 'overdue' ? ' overdue' : ''}${kind === 'done' ? ' done' : ''}`}
        {...rowSelect(r.id)}
      >
        <button
          className={`rem-check${kind === 'done' ? ' done' : ''}`}
          onClick={() => (kind === 'done' ? toggle(r.id) : completeReminder(r.id))}
          aria-label={kind === 'done' ? 'Mark not done' : 'Mark done'}
        >
          {kind === 'done' && <Icon name="check" size={18} />}
        </button>
        <div className="rem-main">
          <div className="rem-title">{r.title}</div>
          <div className="rem-meta">{metaLine(r.at, now, kind)}</div>
        </div>
        {repeating && <Icon name="repeat" size={16} className="rem-repeat" label="Repeats" />}
        {kind === 'overdue' && (
          <button
            className="rem-chip"
            onClick={() => rescheduleReminder(r.id, overdueTarget.at)}
            aria-label={`Reschedule to ${overdueTarget.label}`}
          >
            {overdueTarget.label}
          </button>
        )}
      </motion.div>
    )
  }

  const SECTION_DEFS = [
    { id: 'overdue', label: 'Overdue', count: (n) => String(n), items: sections.overdue },
    { id: 'today', label: 'Today', count: (n) => `${n} left`, items: sections.today },
    { id: 'tomorrow', label: 'Tomorrow', count: null, items: sections.tomorrow },
    { id: 'later', label: 'Later', count: null, items: sections.later },
    { id: 'done', label: 'Done', count: (n) => String(n), items: sections.done },
  ]

  const list = (
    <div className="rem-list">
      <div className="life-quick-add">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder='Remind me… "call mom tomorrow 6pm"'
          aria-label="New reminder"
          onKeyDown={(e) => e.key === 'Enter' && addReminder()}
        />
        <button className="btn btn-primary btn-sm" onClick={addReminder} disabled={!quick.trim()}>
          Add
        </button>
      </div>

      {reminders.length > 0 && (
        <input
          className="rem-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter reminders"
          aria-label="Filter reminders"
        />
      )}

      {SECTION_DEFS.filter((d) => d.items.length > 0).map((d) => (
        <section key={d.id} className="rem-section" data-section={d.id} aria-label={d.label}>
          <h3 className={`rem-section-label${d.id === 'overdue' ? ' overdue' : ''}`}>
            <span>{d.label}</span>
            {d.count && <span className="rem-count">{d.count(d.items.length)}</span>}
          </h3>
          <AnimatePresence initial={false}>{d.items.map((r) => renderRow(r, d.id === 'overdue' || d.id === 'done' ? d.id : 'open'))}</AnimatePresence>
        </section>
      ))}

      {visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-text">
            {reminders.length === 0 ? 'No reminders yet. Tap + to add one.' : 'No reminders match your filter.'}
          </div>
        </div>
      )}

      <PinnedNotes />
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
        onReschedule={rescheduleReminder}
        onRepeat={setReminderRepeat}
        onSnooze={snoozeReminder}
        onToggle={(id) => (selected.done ? toggle(id) : completeReminder(id))}
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
