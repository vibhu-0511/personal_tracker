import { useEffect, useMemo, useState } from 'react'
import { MotionConfig } from 'motion/react'
import {
  getTasks, saveTasks, getReminders, saveReminders, getHabits, saveHabits, getMoodLog, saveMoodLog,
  getChecklists, saveChecklists,
} from '../store.js'
import { dateKey, earnings, ensureTodayEntry } from '../life/logic.js'
import Notes from './Notes.jsx'
import TasksView from '../life/screens/Tasks.jsx'
import RemindersView from '../life/screens/Reminders.jsx'
import HabitsView from '../life/screens/Habits.jsx'
import GrowthView from '../life/screens/Growth.jsx'
import { useHydrate } from '../useHydrate.js'
import { useLatest } from '../useLatest.js'

const VIEWS = [
  { id: 'planning', icon: '🗂️', label: 'Planning', children: [
    { id: 'tasks', icon: '✅', label: 'Tasks' },
    { id: 'reminders', icon: '⏰', label: 'Reminders' },
    { id: 'notes', icon: '📝', label: 'Notes' },
  ] },
  { id: 'wellbeing', icon: '🌱', label: 'Wellbeing', children: [
    { id: 'habits', icon: '🐾', label: 'Habits' },
    { id: 'growth', icon: '🌟', label: 'Growth' },
  ] },
]

const activeGroup = (view) => VIEWS.find((g) => g.children.some((c) => c.id === view))

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

  // One-time merge of legacy checklists into tasks (as subtasks). Tasks are
  // saved before checklists are cleared; stable ids make a re-run a no-op.
  const tasksLatest = useLatest(tasks)
  useEffect(() => {
    if (!ready) return
    getChecklists().then(async (sections) => {
      if (!sections.length) return
      const have = new Set(tasksLatest.current.map((t) => t.id))
      const added = sections
        .filter((s) => !have.has(s.id))
        .map((s) => ({
          id: s.id, title: s.name, due: null, dueAt: null, done: false, doneAt: null,
          createdAt: s.createdAt, urgent: false, important: false, subtasks: s.items,
        }))
      if (added.length) await updateTasks([...added, ...tasksLatest.current])
      await saveChecklists([])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

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

  const group = activeGroup(view)

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
          {VIEWS.map((g) => (
            <button
              key={g.id}
              className={`agent-pill${group === g ? ' active' : ''}`}
              onClick={() => group !== g && setView(g.children[0].id)}
            >
              <span className="agent-pill-icon">{g.icon}</span>
              {g.label}
            </button>
          ))}
        </div>
        <div className="agent-bar">
          {group.children.map((v) => (
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
        {view === 'notes' && <Notes syncTick={syncTick} />}
      </div>
    </MotionConfig>
  )
}
