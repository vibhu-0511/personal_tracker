import { useEffect, useMemo, useRef, useState } from 'react'
import { createCelebrator } from './celebrate.js'
import TodayHeader from './TodayHeader.jsx'
import DailiesStrip from './DailiesStrip.jsx'
import NextUp from './NextUp.jsx'
import Timeline from './Timeline.jsx'
import StreakTile from './tiles/StreakTile.jsx'
import WalletTile from './tiles/WalletTile.jsx'
import PetsTile from './tiles/PetsTile.jsx'
import WatchTile from './tiles/WatchTile.jsx'
import TutorTile from './tiles/TutorTile.jsx'
import { useTodayData } from './useTodayData.js'
import { useDailies } from './useDailies.js'
import { buildTimeline } from './timeline.js'
import { getExpenses, getNotes } from '../store.js'
import { useStoreKey } from '../useStoreKey.js'
import './today.css'

// Timeline inputs that neither hook exposes: today's expenses and notes. Loaded
// silently on every store event / sync tick; a failed read leaves them empty.
function useTimelineExtras(syncTick) {
  const expensesV = useStoreKey('expenses')
  const notesV = useStoreKey('notes')
  const [extras, setExtras] = useState({ expenses: [], notes: [] })
  useEffect(() => {
    let cancelled = false
    Promise.all([getExpenses(), getNotes()])
      .then(([expenses, notes]) => { if (!cancelled) setExtras({ expenses, notes }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [syncTick, expensesV, notesV])
  return extras
}

// Today home. Order: header, dailies, next up (overdue chip first), timeline, then the
// kept tiles (Streak, Wallet, Pets, Watch, Tutor). From 900px container width the
// tiles sit in a second column beside the timeline (today.css).
// `syncTick` is bumped when a remote change touches data Home shows.
export default function TodayHome({ syncTick = 0 }) {
  const t = useTodayData({ syncTick })
  const d = useDailies({ syncTick })
  const extras = useTimelineExtras(syncTick)
  const now = Date.now()
  const nowKey = Math.floor(now / 30_000) // re-derive the timeline with the dailies clock
  const timeline = useMemo(
    () => buildTimeline({ reminders: d.reminders, tasks: t.tasks, expenses: extras.expenses, notes: extras.notes }, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.reminders, t.tasks, extras, nowKey],
  )

  // One confetti burst per day when the dailies complete (never on load, never under reduced motion).
  const celebrateRef = useRef(null)
  useEffect(() => {
    if (!d.ready) return
    if (!celebrateRef.current) celebrateRef.current = createCelebrator()
    const observe = celebrateRef.current
    observe(d.dailies.done, d.dailies.total)
  }, [d.ready, d.dailies.done, d.dailies.total])

  const error = t.error || d.error
  if (error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-text">Couldn't load Today: {error}</div>
      </div>
    )
  }

  const loading = !t.ready || !d.ready
  const { completeReminder, snooze, reschedule } = d.actions
  const { toggleTask, checkIn } = t.actions

  const onDone = (it) => (it.kind === 'task' ? toggleTask(it.id, true) : completeReminder(it.id))
  const onSnooze = (it) => { if (it.kind === 'reminder') snooze(it.id, '1h') }
  const onToggle = (it, next) => {
    if (it.kind === 'task') toggleTask(it.id, next)
    else if (next) completeReminder(it.id)
  }

  return (
    <div className="today-home" data-sync-tick={syncTick}>
      <div className="today-home-main">
        <TodayHeader now={new Date()} streak={t.streak.current} done={d.dailies.done} total={d.dailies.total} />
        <DailiesStrip items={d.dailies.items} loading={loading} />
        {!loading && (
          <NextUp
            nextUp={timeline.nextUp}
            overdue={timeline.overdue}
            now={Date.now()}
            onDone={onDone}
            onSnooze={onSnooze}
            onOverdueReschedule={(it, at) => (it.kind === 'reminder' ? reschedule(it.id, at) : undefined)}
          />
        )}
        {!loading && <Timeline items={timeline.items} onToggle={onToggle} />}
      </div>
      <aside className="today-home-tiles" aria-label="Today tiles">
        <div className="today-grid" data-sync-tick={syncTick}>
          <div className="today-grid-cells">
            <StreakTile loading={loading} current={t.streak.current} best={t.streak.best} href="#/life/habits" />
            <WalletTile
              loading={loading}
              habitCount={t.wallet.habitCount}
              total={t.wallet.total}
              left={t.wallet.left}
              level={t.wallet.level}
              levelPct={t.wallet.levelPct}
              href="#/life/growth"
            />
            <PetsTile loading={loading} pets={t.pets} onCheckIn={checkIn} moreHref="#/life/habits" />
            <WatchTile loading={loading} item={t.watch.item} quote={t.watch.quote} />
            <TutorTile />
          </div>
        </div>
      </aside>
    </div>
  )
}
