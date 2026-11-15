import Ring from '../ui/Ring.jsx'
import './today-header.css'

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

// "SUN 15 NOV" for a Date (local time).
export function dateLine(now) {
  const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

// "SUN 15 NOV · 12-DAY STREAK"; the streak part is omitted when streak < 1.
export function headerLine(now, streak) {
  const n = Math.floor(Number(streak) || 0)
  return n > 0 ? `${dateLine(now)} · ${n}-DAY STREAK` : dateLine(now)
}

// Today header: mono date/streak line, title, and the dailies ring (done/total).
export default function TodayHeader({ now, streak = 0, done = 0, total = 0 }) {
  const t = Math.max(0, Math.floor(Number(total) || 0))
  const d = Math.min(t, Math.max(0, Math.floor(Number(done) || 0)))
  return (
    <header className="today-header">
      <div className="today-header-text">
        <p className="today-header-line">{headerLine(now, streak)}</p>
        <h1 className="today-header-title">Today</h1>
      </div>
      <Ring
        className="today-header-ring"
        size={56}
        value={t ? (d / t) * 100 : 0}
        label={`${d} of ${t} dailies done`}
      >
        <span className="today-header-count">{d}/{t}</span>
      </Ring>
    </header>
  )
}
