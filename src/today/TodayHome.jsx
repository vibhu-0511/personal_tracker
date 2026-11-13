import StreakTile from './tiles/StreakTile.jsx'
import WalletTile from './tiles/WalletTile.jsx'
import PetsTile from './tiles/PetsTile.jsx'
import CodeTile from './tiles/CodeTile.jsx'
import WatchTile from './tiles/WatchTile.jsx'
import TasksTile from './tiles/TasksTile.jsx'
import SpendTile from './tiles/SpendTile.jsx'
import MoodTile from './tiles/MoodTile.jsx'
import TutorTile from './tiles/TutorTile.jsx'
import { useTodayData } from './useTodayData.js'
import './today.css'

// Today home: the bento grid. DOM order is the reading and focus order and must
// stay streak, wallet, pets, code, watch, tasks, spend, mood, tutor (today.css
// addresses the first-group tiles by position).
// `syncTick` is bumped when a remote change touches data Home shows.
export default function TodayHome({ syncTick = 0 }) {
  const t = useTodayData({ syncTick })

  if (t.error) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div className="empty-text">Couldn't load Today: {t.error}</div>
      </div>
    )
  }

  const loading = !t.ready
  const { toggleTask, checkIn, logMood } = t.actions

  return (
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
        <CodeTile loading={loading} solved={t.code.solved} goal={t.code.goal} href="#/logic/code" />
        <WatchTile loading={loading} item={t.watch.item} quote={t.watch.quote} />
        <TasksTile loading={loading} tasks={t.tasks} todayKey={t.todayKey} onToggleTask={toggleTask} />
        <SpendTile
          loading={loading}
          spent={t.spend.spent}
          totalBudget={t.spend.totalBudget}
          categories={t.spend.categories}
          monthLabel={t.spend.monthLabel}
        />
        <MoodTile loading={loading} today={t.mood.today} source={t.mood.source} onLog={logMood} />
        <TutorTile />
      </div>
    </div>
  )
}
