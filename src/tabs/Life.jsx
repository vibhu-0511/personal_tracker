import { useState } from 'react'
import { MotionConfig } from 'motion/react'
import { LifeDataProvider, useLife, useLifeOptional } from '../life/LifeData.jsx'
import Notes from '../life/screens/Notes.jsx'
import TasksView from '../life/screens/Tasks.jsx'
import RemindersView from '../life/screens/Reminders.jsx'
import HabitsView from '../life/screens/Habits.jsx'
import GrowthView from '../life/screens/Growth.jsx'
import { LIFE_VIEWS, LIFE_GROUPS, DEFAULT_LIFE_VIEW, isLifeView } from '../life/views.js'

const activeGroup = (view) => LIFE_GROUPS.find((g) => g.id === LIFE_VIEWS.find((v) => v.id === view)?.group)

// Uses the app-level LifeDataProvider when the shell mounts one; until then it
// wraps itself, so there is always exactly one writer.
//
// Props (all optional):
//   syncTick                 bumps when a remote sync lands
//   view, onViewChange       the active sub-view id, owned by the router. When
//                            onViewChange is supplied the internal pill bar is
//                            hidden (the shell's SubNav replaces it); without it
//                            Life keeps its own state and pill bar.
//   selectedId, onSelect     selected row id for Tasks / Reminders / Notes,
//                            owned by the router (route param). Left undefined,
//                            each screen keeps its own selection.
export default function Life({ syncTick = 0, view, onViewChange, selectedId, onSelect }) {
  const shared = useLifeOptional()
  const body = (
    <LifeBody
      syncTick={syncTick} view={view} onViewChange={onViewChange}
      selectedId={selectedId} onSelect={onSelect}
    />
  )
  return shared ? body : <LifeDataProvider syncTick={syncTick}>{body}</LifeDataProvider>
}

function LifeBody({ syncTick, view: viewProp, onViewChange, selectedId, onSelect }) {
  const [localView, setLocalView] = useState(DEFAULT_LIFE_VIEW)
  const requested = viewProp !== undefined ? viewProp : localView
  const view = isLifeView(requested) ? requested : DEFAULT_LIFE_VIEW
  const setView = (id) => {
    if (viewProp === undefined) setLocalView(id)
    onViewChange?.(id)
  }
  const showPills = !onViewChange
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

        {showPills && (
          <>
            <div className="agent-bar">
              {LIFE_GROUPS.map((g) => (
                <button
                  key={g.id}
                  className={`agent-pill${group === g ? ' active' : ''}`}
                  onClick={() => group !== g && setView(LIFE_VIEWS.find((v) => v.group === g.id).id)}
                >
                  <span className="agent-pill-icon">{g.icon}</span>
                  {g.label}
                </button>
              ))}
            </div>
            <div className="agent-bar">
              {LIFE_VIEWS.filter((v) => v.group === group.id).map((v) => (
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
          </>
        )}

        {view === 'tasks' && <TasksView tasks={tasks} onUpdate={updateTasks} now={now} selectedId={selectedId} onSelect={onSelect} />}
        {view === 'reminders' && <RemindersView reminders={reminders} onUpdate={updateReminders} now={now} selectedId={selectedId} onSelect={onSelect} />}
        {view === 'habits' && <HabitsView habits={habits} onUpdate={updateHabits} now={now} />}
        {view === 'growth' && (
          <GrowthView habits={habits} moodLog={moodLog} onMoodLog={updateMoodLog} now={now} />
        )}
        {view === 'notes' && <Notes syncTick={syncTick} selectedId={selectedId} onSelect={onSelect} />}
      </div>
    </MotionConfig>
  )
}
