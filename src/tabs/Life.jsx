import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'motion/react'
import {
  getTasks, saveTasks, getReminders, saveReminders, getHabits, saveHabits, getMoodLog, saveMoodLog,
} from '../store.js'
import {
  dateKey,
  streaks,
  multiplier,
  earnings,
  petState,
  parseQuick,
  crossedMilestone,
  CATEGORY_LABELS,
  DOMAINS,
  computeStats,
  TITLES,
  unlockedTitles,
  MANUAL_MOODS,
  ensureTodayEntry,
  logManualMood,
  emotionSummary,
} from '../life/logic.js'
import Notes from './Notes.jsx'
import Checklist from './Checklist.jsx'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'
import { deleteWithUndo } from '../undo.js'
import { newId } from '../id.js'

const VIEWS = [
  { id: 'tasks', icon: '✅', label: 'Tasks' },
  { id: 'reminders', icon: '⏰', label: 'Reminders' },
  { id: 'habits', icon: '🐾', label: 'Habits' },
  { id: 'growth', icon: '🌟', label: 'Growth' },
  { id: 'checklist', icon: '☑️', label: 'Checklist' },
  { id: 'notes', icon: '📝', label: 'Notes' },
]

const URGENCY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'important', label: 'Important' },
  { id: 'not-important', label: 'Not important' },
  { id: 'extras', label: 'Extras' },
]

function quadrantLabel(t) {
  if (t.urgent && t.important) return { label: 'Urgent', cls: 'chip' }
  if (t.important) return { label: 'Important', cls: 'chip' }
  if (t.urgent) return { label: 'Not important', cls: 'chip-muted' }
  return null
}

function matchesUrgency(t, f) {
  if (f === 'urgent') return t.urgent && t.important
  if (f === 'important') return t.important && !t.urgent
  if (f === 'not-important') return t.urgent && !t.important
  if (f === 'extras') return !t.urgent && !t.important
  return true
}

const SPECIES = ['🐶', '🐱', '🐰', '🦊', '🐼', '🐧', '🐉']

async function fireConfetti() {
  const confetti = (await import('canvas-confetti')).default
  confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 }, disableForReducedMotion: true })
}

export default function Life({ syncTick = 0 }) {
  const [view, setView] = useState('tasks')
  const [tasks, setTasks] = useState([])
  const [reminders, setReminders] = useState([])
  const [habits, setHabits] = useState([])
  const [moodLog, setMoodLog] = useState([])
  const [now, setNow] = useState(() => new Date())

  const { ready, error } = useHydrate([
    () => getTasks().then(setTasks),
    () => getReminders().then(setReminders),
    () => getHabits().then(setHabits),
    () => getMoodLog().then(setMoodLog),
  ], [syncTick])

  // Auto-derive today's mood entry from habit behavior, once, unless already
  // logged. Gated on `ready`: habits and moodLog hydrate from independent
  // promises, and racing ahead on a partial load (e.g. habits resolved,
  // moodLog didn't yet) would derive from an empty moodLog and overwrite the
  // real history.
  useEffect(() => {
    if (!ready) return
    const next = ensureTodayEntry(moodLog, habits, now)
    if (next !== moodLog) {
      setMoodLog(next)
      saveMoodLog(next)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, habits, now])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!navigator.setAppBadge) return
    const dueTasks = tasks.filter((t) => !t.done && t.due && t.due <= dateKey(now)).length
    const dueReminders = reminders.filter((r) => !r.done && r.at <= now.getTime()).length
    const n = dueTasks + dueReminders
    if (n > 0) navigator.setAppBadge(n).catch(() => {})
    else navigator.clearAppBadge?.().catch(() => {})
  }, [tasks, reminders, now])

  async function updateTasks(next) {
    setTasks(next)
    await saveTasks(next)
  }
  async function updateReminders(next) {
    setReminders(next)
    await saveReminders(next)
  }
  async function updateHabits(next) {
    setHabits(next)
    await saveHabits(next)
  }
  async function updateMoodLog(next) {
    setMoodLog(next)
    await saveMoodLog(next)
  }

  const walletTotal = useMemo(
    () => habits.reduce((sum, h) => sum + earnings(h, now).total, 0),
    [habits, now]
  )
  const tasksDueToday = tasks.filter((t) => !t.done && t.due === dateKey(now)).length
  const remindersDue = reminders.filter((r) => !r.done && r.at <= now.getTime()).length

  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-text">Couldn't load Life: {error}</div>
      </div>
    )
  }
  if (!ready) {
    return <div className="empty-state"><div className="empty-text">Loading…</div></div>
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="fade-in">
        <div className="life-stats">
          <div className="life-stat life-total-wallet">
            <div className="life-stat-value">₹{Math.round(walletTotal)}</div>
            <div className="life-stat-label">Wallet</div>
          </div>
          <div className="life-stat">
            <div className="life-stat-value">{tasksDueToday}</div>
            <div className="life-stat-label">Due today</div>
          </div>
          <div className="life-stat">
            <div className="life-stat-value">{remindersDue}</div>
            <div className="life-stat-label">Reminders</div>
          </div>
        </div>

        <div className="agent-bar">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`agent-pill${view === v.id ? ' active' : ''}`}
              onClick={() => setView(v.id)}
            >
              <span className="agent-pill-icon">{v.icon}</span>
              {v.label}
            </button>
          ))}
        </div>

        {view === 'tasks' && <TasksView tasks={tasks} onUpdate={updateTasks} now={now} />}
        {view === 'reminders' && <RemindersView reminders={reminders} onUpdate={updateReminders} now={now} />}
        {view === 'habits' && <HabitsView habits={habits} onUpdate={updateHabits} now={now} />}
        {view === 'growth' && (
          <GrowthView habits={habits} moodLog={moodLog} onMoodLog={updateMoodLog} now={now} />
        )}
        {view === 'checklist' && <Checklist syncTick={syncTick} />}
        {view === 'notes' && <Notes syncTick={syncTick} />}
      </div>
    </MotionConfig>
  )
}

function TasksView({ tasks, onUpdate, now }) {
  const [quick, setQuick] = useState('')
  const [filter, setFilter] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDue, setEditDue] = useState('')
  const todayKey = dateKey(now)
  const tasksRef = useLatest(tasks)

  function addTask() {
    const text = quick.trim()
    if (!text) return
    const { title, date, at } = parseQuick(text, now)
    const task = {
      id: newId(),
      title: title || text,
      due: date ? dateKey(date) : null,
      dueAt: at ? at.getTime() : null,
      done: false,
      doneAt: null,
      createdAt: Date.now(),
      urgent: false,
      important: false,
    }
    onUpdate([task, ...tasks])
    setQuick('')
  }

  function toggleFlag(id, flag) {
    onUpdate(tasks.map((t) => (t.id === id ? { ...t, [flag]: !t[flag] } : t)))
  }

  async function toggle(id) {
    const task = tasks.find((t) => t.id === id)
    const wasDone = task.done
    const next = tasks.map((t) =>
      t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? Date.now() : null } : t
    )
    await onUpdate(next)
    if (!wasDone) {
      const hadDueToday = tasks.some((t) => !t.done && t.due === todayKey)
      const stillDueToday = next.some((t) => !t.done && t.due === todayKey)
      if (hadDueToday && !stillDueToday) fireConfetti()
    }
  }

  function remove(id) {
    deleteWithUndo({
      list: tasks, id, persist: onUpdate, ref: tasksRef,
      label: (task) => `Deleted "${task.title}"`,
    })
  }

  function startEdit(t) {
    setEditingId(t.id)
    setEditTitle(t.title)
    setEditDue(t.due || '')
  }
  function cancelEdit() {
    setEditingId(null)
  }
  function saveEdit(id) {
    const title = editTitle.trim()
    if (!title) return
    onUpdate(tasks.map((t) => (t.id === id ? { ...t, title, due: editDue || null } : t)))
    setEditingId(null)
  }

  const q = filter.trim().toLowerCase()
  let visible = q ? tasks.filter((t) => t.title.toLowerCase().includes(q)) : tasks
  if (urgencyFilter !== 'all') visible = visible.filter((t) => matchesUrgency(t, urgencyFilter))

  const overdue = visible.filter((t) => !t.done && t.due && t.due < todayKey)
  const dueToday = visible.filter((t) => !t.done && t.due === todayKey)
  const upcoming = visible
    .filter((t) => !t.done && t.due && t.due > todayKey)
    .sort((a, b) => a.due.localeCompare(b.due))
  const noDate = visible.filter((t) => !t.done && !t.due)
  const done = visible.filter((t) => t.done)

  const editProps = {
    editingId, editTitle, setEditTitle, editDue, setEditDue,
    onStartEdit: startEdit, onSaveEdit: saveEdit, onCancelEdit: cancelEdit,
  }

  return (
    <div>
      <div className="life-quick-add">
        <input
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          placeholder='Add a task… "gym tomorrow 5pm"'
          onKeyDown={(e) => e.key === 'Enter' && addTask()}
        />
        <button className="btn btn-primary btn-sm" onClick={addTask} disabled={!quick.trim()}>
          Add
        </button>
      </div>

      {tasks.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {URGENCY_FILTERS.map((f) => (
              <button
                key={f.id}
                className={`chip${urgencyFilter === f.id ? '' : ' chip-muted'}`}
                style={{ cursor: 'pointer', border: 'none' }}
                onClick={() => setUrgencyFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="🔍 Filter tasks..."
            style={{ marginBottom: 12 }}
          />
        </>
      )}

      <TaskSection label="Overdue" items={overdue} overdue {...editProps} onToggle={toggle} onRemove={remove} onToggleFlag={toggleFlag} />
      <TaskSection label="Today" items={dueToday} {...editProps} onToggle={toggle} onRemove={remove} onToggleFlag={toggleFlag} />
      <TaskSection label="Upcoming" items={upcoming} {...editProps} onToggle={toggle} onRemove={remove} onToggleFlag={toggleFlag} />
      <TaskSection label="No date" items={noDate} {...editProps} onToggle={toggle} onRemove={remove} onToggleFlag={toggleFlag} />
      {done.length > 0 && <DoneTaskSection items={done} onToggle={toggle} onRemove={remove} />}

      {visible.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <div className="empty-text">{tasks.length === 0 ? 'No tasks yet.' : 'No tasks match your filter.'}</div>
        </div>
      )}
    </div>
  )
}

function TaskSection({
  label, items, overdue, onToggle, onRemove, onToggleFlag,
  editingId, editTitle, setEditTitle, editDue, setEditDue, onStartEdit, onSaveEdit, onCancelEdit,
}) {
  if (items.length === 0) return null
  return (
    <>
      <div className="life-section-label">{label}</div>
      <AnimatePresence initial={false}>
        {items.map((t) =>
          editingId === t.id ? (
            <motion.div key={t.id} layout className="life-row">
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                autoFocus
                style={{ flex: 1 }}
                onKeyDown={(e) => e.key === 'Enter' && onSaveEdit(t.id)}
              />
              <input
                type="date"
                value={editDue}
                onChange={(e) => setEditDue(e.target.value)}
                style={{ width: 140 }}
              />
              <button className="btn btn-primary btn-sm" onClick={() => onSaveEdit(t.id)}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={onCancelEdit}>Cancel</button>
            </motion.div>
          ) : (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className={`life-row${overdue ? ' overdue' : ''}`}
            >
              <button className="life-check" onClick={() => onToggle(t.id)} aria-label="Mark done" />
              <div className="life-row-title">{t.title}</div>
              {quadrantLabel(t) && (
                <span className={quadrantLabel(t).cls} style={{ flexShrink: 0 }}>
                  {quadrantLabel(t).label}
                </span>
              )}
              {t.due && (
                <div className="life-row-due">
                  {t.due}
                  {t.dueAt && ` · ${new Date(t.dueAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                </div>
              )}
              <button
                className="life-icon-btn"
                title="Urgent"
                style={{ opacity: t.urgent ? 1 : 0.3 }}
                onClick={() => onToggleFlag(t.id, 'urgent')}
              >
                🔥
              </button>
              <button
                className="life-icon-btn"
                title="Important"
                style={{ opacity: t.important ? 1 : 0.3 }}
                onClick={() => onToggleFlag(t.id, 'important')}
              >
                ⭐
              </button>
              <button className="life-icon-btn" title="Edit" onClick={() => onStartEdit(t)}>
                ✎
              </button>
              <button className="life-icon-btn" title="Delete" onClick={() => onRemove(t.id)}>
                🗑️
              </button>
            </motion.div>
          )
        )}
      </AnimatePresence>
    </>
  )
}

function DoneTaskSection({ items, onToggle, onRemove }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="life-section-label"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▾' : '▸'} Done ({items.length})
      </button>
      {open && (
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="life-row done"
            >
              <button className="life-check done" onClick={() => onToggle(t.id)}>
                ✓
              </button>
              <div className="life-row-title">{t.title}</div>
              <button className="life-icon-btn" title="Delete" onClick={() => onRemove(t.id)}>
                🗑️
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </>
  )
}

function RemindersView({ reminders, onUpdate, now }) {
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
            <a className="life-icon-btn" href={icsHref(r)} title="Add to Calendar">
              📅
            </a>
            <button className="life-icon-btn" title="Delete" onClick={() => remove(r.id)}>
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
              <button className="life-check done" onClick={() => toggle(r.id)}>
                ✓
              </button>
              <div className="life-row-title">{r.title}</div>
              <button className="life-icon-btn" title="Delete" onClick={() => remove(r.id)}>
                🗑️
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

function HabitsView({ habits, onUpdate, now }) {
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('exercise')
  const [species, setSpecies] = useState(SPECIES[0])
  const [domain, setDomain] = useState('other')
  const [coinFlash, setCoinFlash] = useState({}) // habitId -> amount, for the floating +₹ animation
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState('exercise')
  const [editDomain, setEditDomain] = useState('other')
  const habitsRef = useLatest(habits)

  function addHabit() {
    const n = name.trim()
    if (!n) return
    const habit = { id: newId(), name: n, category, species, domain, createdAt: Date.now(), checkins: [] }
    onUpdate([...habits, habit])
    setName('')
    setDomain('other')
    setShowAdd(false)
  }

  function removeHabit(id) {
    deleteWithUndo({
      list: habits, id, persist: onUpdate, ref: habitsRef,
      label: (habit) => `Deleted "${habit.name}"`,
    })
  }

  function startEditHabit(h) {
    setEditingId(h.id)
    setEditName(h.name)
    setEditCategory(h.category)
    setEditDomain(h.domain)
  }
  function cancelEditHabit() {
    setEditingId(null)
  }
  function saveEditHabit(id) {
    const n = editName.trim()
    if (!n) return
    onUpdate(habits.map((h) => (h.id === id ? { ...h, name: n, category: editCategory, domain: editDomain } : h)))
    setEditingId(null)
  }

  async function checkIn(habit) {
    const key = dateKey(now)
    const already = habit.checkins.includes(key)
    const nextCheckins = already ? habit.checkins.filter((c) => c !== key) : [...habit.checkins, key]
    const nextHabit = { ...habit, checkins: nextCheckins }
    await onUpdate(habits.map((h) => (h.id === habit.id ? nextHabit : h)))

    if (!already) {
      const amount = earnings(nextHabit, now).today
      setCoinFlash((f) => ({ ...f, [habit.id]: amount }))
      setTimeout(() => setCoinFlash((f) => { const n = { ...f }; delete n[habit.id]; return n }), 1000)

      const prevBest = streaks(habit.checkins, now).best
      const newBest = streaks(nextCheckins, now).best
      if (crossedMilestone(prevBest, newBest)) fireConfetti()
    }
  }

  return (
    <div>
      <AnimatePresence initial={false}>
        {habits.map((h) => {
          const pet = petState(h, now)
          const { current, best } = streaks(h.checkins, now)
          const money = earnings(h, now)
          const checkedToday = h.checkins.includes(dateKey(now))
          return (
            <motion.div
              key={h.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="habit-card"
            >
              {coinFlash[h.id] != null && <div className="coin-float">+₹{Math.round(coinFlash[h.id])}</div>}

              {editingId === h.id ? (
                <div className="habit-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                    {Object.keys(CATEGORY_LABELS).map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DOMAINS.map((d) => (
                      <button
                        key={d.id}
                        className={`agent-pill${editDomain === d.id ? ' active' : ''}`}
                        onClick={() => setEditDomain(d.id)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEditHabit(h.id)}>Save</button>
                    <button className="btn btn-ghost btn-sm" onClick={cancelEditHabit}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="habit-head">
                  <span className={`pet-avatar pet-mood-${pet.mood}`}>
                    {h.species}
                    {pet.accessory && <span className="pet-accessory">{pet.accessory}</span>}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div className="habit-name">{h.name}</div>
                    <div className="habit-meta">
                      {current > 0 && <span className="habit-streak-flame">🔥</span>} {current}-day streak
                      {best > current ? ` · best ${best}` : ''} ·{' '}
                      {CATEGORY_LABELS[h.category] || CATEGORY_LABELS.custom}
                    </div>
                  </div>
                  <button className="life-icon-btn" title="Edit habit" onClick={() => startEditHabit(h)}>
                    ✎
                  </button>
                  <button className="life-icon-btn" title="Remove habit" onClick={() => removeHabit(h.id)}>
                    🗑️
                  </button>
                </div>
              )}

              <div className="habit-health-bar">
                <div className="habit-health-fill" style={{ width: `${pet.health}%` }} />
              </div>

              <div className="habit-wallet-row">
                <span className="habit-wallet-amount">₹{Math.round(money.total)} earned</span>
                <span className="habit-multiplier-chip">×{multiplier(current)}</span>
              </div>

              <div className="habit-traits">
                {pet.traits.map((t) => (
                  <span key={t.days} className={`habit-trait${t.unlocked ? ' unlocked' : ''}`}>
                    {t.unlocked ? '✓ ' : '🔒 '}{t.label}
                  </span>
                ))}
              </div>

              <button
                className={`habit-checkin-btn${checkedToday ? ' checked-in' : ''}`}
                onClick={() => checkIn(h)}
              >
                {checkedToday ? '✓ Checked in today (tap to undo)' : 'Check in'}
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {habits.length === 0 && !showAdd && (
        <div className="empty-state">
          <div className="empty-icon">🐾</div>
          <div className="empty-text">No habits yet. Adopt a pet to start one.</div>
        </div>
      )}

      {showAdd ? (
        <div className="card" style={{ marginTop: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Habit name (e.g. Gym)" />
          <select style={{ marginTop: 8 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.keys(CATEGORY_LABELS).map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {SPECIES.map((s) => (
              <button
                key={s}
                className={`theme-swatch${species === s ? ' active' : ''}`}
                style={{ fontSize: 18, background: 'var(--surface-raised)' }}
                onClick={() => setSpecies(s)}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="meta" style={{ marginTop: 10, marginBottom: 4 }}>Grows which stat?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {DOMAINS.map((d) => (
              <button
                key={d.id}
                className={`agent-pill${domain === d.id ? ' active' : ''}`}
                onClick={() => setDomain(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary btn-sm" onClick={addHabit} disabled={!name.trim()}>
              Adopt
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => setShowAdd(true)}>
          + New habit
        </button>
      )}
    </div>
  )
}

function GrowthView({ habits, moodLog, onMoodLog, now }) {
  const stats = computeStats(habits)
  const titles = unlockedTitles(stats)
  const summary = emotionSummary(moodLog, now)
  const todayKey = dateKey(now)
  const todayEntry = moodLog.find((e) => e.date === todayKey)

  function pickMood(value) {
    onMoodLog(logManualMood(moodLog, now, value))
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="h3" style={{ marginBottom: 10 }}>Growth</div>
        {DOMAINS.map((d) => (
          <div key={d.id} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span>{d.label}</span>
              <span className="meta">{stats[d.id]}</span>
            </div>
            <div className="habit-health-bar">
              <div className="habit-health-fill" style={{ width: `${stats[d.id]}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="h3" style={{ marginBottom: 10 }}>Titles</div>
        {DOMAINS.map((d) => (
          <div key={d.id} style={{ marginBottom: 8 }}>
            <div className="meta" style={{ marginBottom: 4 }}>{d.label}</div>
            <div className="habit-traits">
              {TITLES.filter((t) => t.domain === d.id).map((t) => {
                const unlocked = titles.includes(t)
                return (
                  <span key={t.at} className={`habit-trait${unlocked ? ' unlocked' : ''}`}>
                    {unlocked ? '✓ ' : '🔒 '}{t.label}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="h3" style={{ marginBottom: 4 }}>How are you feeling today?</div>
        <div className="meta" style={{ marginBottom: 10 }}>
          {todayEntry?.source === 'logged' ? 'Logged' : "Guessed from today's check-ins — tap to correct it"}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {MANUAL_MOODS.map((m) => (
            <button
              key={m.value}
              className={`theme-swatch${todayEntry?.valence === m.value ? ' active' : ''}`}
              style={{ fontSize: 20, background: 'var(--surface-raised)', flex: 1 }}
              onClick={() => pickMood(m.value)}
            >
              {m.emoji}
            </button>
          ))}
        </div>

        {summary.days === 0 ? (
          <div className="meta">No mood history yet — check back after a few days.</div>
        ) : (
          <>
            <div className="meta">Last {summary.days} day{summary.days > 1 ? 's' : ''}</div>
            <div style={{ display: 'flex', gap: 4, margin: '8px 0' }}>
              {summary.entries.map((e) => (
                <div
                  key={e.date}
                  title={`${e.date}: ${e.valence}`}
                  style={{
                    flex: 1,
                    height: 20,
                    borderRadius: 3,
                    background: `hsl(${(e.valence / 100) * 120}, 55%, 45%)`,
                  }}
                />
              ))}
            </div>
            <div className="meta">
              {summary.consistency}% of days logged · avg mood {summary.avgValence}/100 ·{' '}
              {summary.trend > 0 ? '↗ trending up' : summary.trend < 0 ? '↘ trending down' : '→ steady'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
