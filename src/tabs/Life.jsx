import { useState } from 'react'
import { MotionConfig } from 'motion/react'
import { LifeDataProvider, useLife, useLifeOptional } from '../life/LifeData.jsx'
import Notes from '../life/screens/Notes.jsx'
import TasksView from '../life/screens/Tasks.jsx'
import RemindersView from '../life/screens/Reminders.jsx'
import HabitsView from '../life/screens/Habits.jsx'
import GrowthView from '../life/screens/Growth.jsx'
import SubNav from '../ui/SubNav.jsx'
import { getNotes } from '../store.js'
import { useHydrate } from '../useHydrate.js'
import { useStoreKey } from '../useStoreKey.js'
import { summarizeProgress, readHighWater } from '../today/useProgressSummary.js'
import '../life/life.css'
import { LIFE_VIEWS, DEFAULT_LIFE_VIEW, isLifeView } from '../life/views.js'

// Chip counts (DESIGN 5.2): Tasks, Reminders and Notes show an open count;
// Habits and Growth show none. Pure.
export function lifeChipItems(counts) {
  return LIFE_VIEWS.map((v) => ({
    id: v.id, label: v.label, icon: v.icon,
    count: v.id === 'tasks' ? counts.tasks : v.id === 'reminders' ? counts.reminders : v.id === 'notes' ? counts.notes : null,
  }))
}

// Header mono line, e.g. "₹4,820 · LV 7". Pure.
export function lifeHeaderLine(wallet, level) {
  return `₹${Math.round(Number(wallet) || 0).toLocaleString('en-IN')} · LV ${level}`
}

// Uses the app-level LifeDataProvider when the shell mounts one; until then it
// wraps itself, so there is always exactly one writer.
//
// Props (all optional):
//   syncTick                 bumps when a remote sync lands
//   view, onViewChange       the active sub-view id, owned by the router (pills
//                            call onViewChange, which changes the hash). Without
//                            them Life keeps its own state. Life renders the one
//                            chip bar, below the header, with counts.
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
  const [notes, setNotes] = useState([])
  const notesVersion = useStoreKey('notes')
  useHydrate([() => getNotes().then((n) => setNotes(Array.isArray(n) ? n : []))], [syncTick, notesVersion])
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

  const { level } = summarizeProgress(habits, tasks, now, readHighWater())
  const counts = {
    tasks: tasks.filter((t) => !t.done).length,
    reminders: reminders.filter((r) => !r.done).length,
    notes: notes.length,
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="fade-in">
        <header className="life-head">
          <h2 className="life-title">Life</h2>
          <span className="life-head-line" aria-label={`Wallet and level: ${lifeHeaderLine(walletTotal, level)}`}>
            {lifeHeaderLine(walletTotal, level)}
          </span>
        </header>

        <SubNav items={lifeChipItems(counts)} value={view} onChange={setView} label="Life sections" />

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
