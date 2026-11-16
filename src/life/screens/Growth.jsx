import { useEffect, useState } from 'react'
import {
  dateKey,
  computeStats,
  TITLES,
  unlockedTitles,
  MANUAL_MOODS,
  logManualMood,
  emotionSummary,
  DOMAINS,
} from '../logic.js'
import MasterDetail from '../ui/MasterDetail.jsx'
import GrowthInspector from './GrowthInspector.jsx'
import '../life.css'
import '../wellbeing.css'

// Same 1024px container threshold as Habits.jsx and life.css `@container app`.
const INSPECTOR_MIN = 1024

function useWide() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const el = typeof document === 'undefined' ? null : document.querySelector('.app-root')
    const measure = () => setWide((el ? el.clientWidth : window.innerWidth) >= INSPECTOR_MIN)
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

export default function GrowthView({ habits, moodLog, onMoodLog, now }) {
  const [selectedDomain, setSelectedDomain] = useState(null)
  const wide = useWide()
  const stats = computeStats(habits)
  const titles = unlockedTitles(stats)
  const summary = emotionSummary(moodLog, now)
  const todayKey = dateKey(now)
  const todayEntry = moodLog.find((e) => e.date === todayKey)

  function pickMood(value) {
    onMoodLog(logManualMood(moodLog, now, value))
  }

  const selected = wide ? selectedDomain : null

  const body = (
    <div>
      <div className="wb-panel">
        <div className="wb-panel-title">Growth</div>
        {DOMAINS.map((d) => {
          const bar = (
            <>
              <div className="wb-domain-line">
                <span>{d.label}</span>
                <span className="wb-num wb-small">{stats[d.id]}</span>
              </div>
              <div className="habit-health-bar wb-bar">
                <div className="habit-health-fill wb-bar-fill" style={{ width: `${stats[d.id]}%` }} />
              </div>
            </>
          )
          return (
            <div key={d.id} className="wb-domain-item">
              {wide ? (
                <button
                  type="button"
                  className={`growth-domain wb-domain${selected === d.id ? ' selected' : ''}`}
                  data-selected={selected === d.id ? 'true' : 'false'}
                  aria-pressed={selected === d.id}
                  aria-label={`Show ${d.label} breakdown`}
                  onClick={() => setSelectedDomain(selected === d.id ? null : d.id)}
                >
                  {bar}
                </button>
              ) : bar}
            </div>
          )
        })}
      </div>

      <div className="wb-panel">
        <div className="wb-panel-title">Titles</div>
        {DOMAINS.map((d) => (
          <div key={d.id} className="wb-domain-item">
            <div className="wb-field-label">{d.label}</div>
            <div className="habit-traits">
              {TITLES.filter((t) => t.domain === d.id).map((t) => {
                const unlocked = titles.includes(t)
                return (
                  <span key={t.at} className={`habit-trait wb-chip${unlocked ? ' unlocked' : ''}`}>
                    {unlocked ? '✓ ' : '🔒 '}{t.label}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="wb-panel">
        <div className="wb-panel-title">How are you feeling today?</div>
        <div className="meta wb-mood-note">
          {todayEntry?.source === 'logged' ? 'Logged' : "Guessed from today's check-ins — tap to correct it"}
        </div>
        <div className="wb-moods">
          {MANUAL_MOODS.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`wb-swatch${todayEntry?.valence === m.value ? ' active' : ''}`}
              aria-pressed={todayEntry?.valence === m.value}
              aria-label={`Feeling ${m.value} out of 100`}
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
            <div className="wb-mood-strip">
              {summary.entries.map((e) => (
                <div
                  key={e.date}
                  title={`${e.date}: ${e.valence}`}
                  className="wb-mood-cell"
                  style={{ '--wb-valence': `${e.valence}%` }}
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

  if (!wide) return body
  return (
    <MasterDetail
      hasSelection={selected != null}
      onBack={() => setSelectedDomain(null)}
      list={body}
      inspector={selected ? (
        <GrowthInspector
          domain={selected}
          habits={habits}
          stat={stats[selected]}
          onClose={() => setSelectedDomain(null)}
        />
      ) : (
        <div className="empty-state">
          <div className="empty-icon">🌱</div>
          <div className="empty-text">Select a domain to see what feeds it.</div>
        </div>
      )}
    />
  )
}
