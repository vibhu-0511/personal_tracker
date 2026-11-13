import { useState } from 'react'
import { MotionConfig } from 'motion/react'
import { LifeDataProvider, useLife, useLifeOptional } from '../life/LifeData.jsx'
import Notes from '../life/screens/Notes.jsx'
import TasksView from '../life/screens/Tasks.jsx'
import RemindersView from '../life/screens/Reminders.jsx'
import HabitsView from '../life/screens/Habits.jsx'
import GrowthView from '../life/screens/Growth.jsx'

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

// Uses the app-level LifeDataProvider when the shell mounts one; until then it
// wraps itself, so there is always exactly one writer.
export default function Life({ syncTick = 0 }) {
  const shared = useLifeOptional()
  const body = <LifeBody syncTick={syncTick} />
  return shared ? body : <LifeDataProvider syncTick={syncTick}>{body}</LifeDataProvider>
}

function LifeBody({ syncTick }) {
  const [view, setView] = useState('tasks')
  const {
    tasks, reminders, habits, moodLog, now, ready, error,
    updateTasks, updateReminders, updateHabits, updateMoodLog,
    tasksDueToday, remindersDue, walletTotal,
  } = useLife()

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
