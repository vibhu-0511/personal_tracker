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
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="h3" style={{ marginBottom: 10 }}>Growth</div>
        {DOMAINS.map((d) => {
          const bar = (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span>{d.label}</span>
                <span className="meta">{stats[d.id]}</span>
              </div>
              <div className="habit-health-bar">
                <div className="habit-health-fill" style={{ width: `${stats[d.id]}%` }} />
              </div>
            </>
          )
          return (
            <div key={d.id} style={{ marginBottom: 10 }}>
              {wide ? (
                <button
                  type="button"
                  className={`growth-domain${selected === d.id ? ' selected' : ''}`}
                  data-selected={selected === d.id ? 'true' : 'false'}
                  aria-pressed={selected === d.id}
                  aria-label={`Show ${d.label} breakdown`}
                  onClick={() => setSelectedDomain(selected === d.id ? null : d.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', background: 'none', color: 'inherit',
                    font: 'inherit', cursor: 'pointer', padding: 6, margin: -6, borderRadius: 8,
                    border: `1px solid ${selected === d.id ? 'var(--accent)' : 'transparent'}`,
                  }}
                >
                  {bar}
                </button>
              ) : bar}
            </div>
          )
        })}
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
