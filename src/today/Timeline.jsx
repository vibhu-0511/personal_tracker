import TimelineRow from '../ui/TimelineRow.jsx'
import Check from '../ui/Check.jsx'
import { formatRupees } from '../money/format.js'
import './timeline-screen.css'

// Time in the device's 12h or 24h style (locale decides). `locale` is injectable for tests.
export function formatTime(ms, locale) {
  return new Date(ms).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
}

function rowFor(it, { locale, onToggle, onSelect }) {
  const time = formatTime(it.at, locale)
  const key = `${it.kind}-${it.id}`
  if (it.kind === 'now') {
    return <TimelineRow key={key} kind="now" time={time} title="Now" />
  }
  if (it.kind === 'expense') {
    const amount = <span className="tls-amount">{formatRupees(it.amount)}</span>
    return (
      <TimelineRow
        key={key}
        kind="expense"
        time={time}
        title={it.category || 'Expense'}
        trail={amount}
        onSelect={onSelect ? () => onSelect(it) : undefined}
      />
    )
  }
  if (it.kind === 'note') {
    return (
      <TimelineRow key={key} kind="note" time={time} title={it.title || 'Note'}
        onSelect={onSelect ? () => onSelect(it) : undefined} />
    )
  }
  // reminder or task: a working check, done items stay struck through.
  const trail = onToggle ? (
    <Check
      checked={it.done}
      label={`${it.done ? 'Mark not done' : 'Mark done'}: ${it.title}`}
      onChange={(next) => onToggle(it, next)}
    />
  ) : null
  return (
    <TimelineRow
      key={key}
      kind={it.done ? 'done' : 'reminder'}
      time={time}
      title={it.title}
      trail={trail}
      onSelect={onSelect ? () => onSelect(it) : undefined}
    />
  )
}

// Today timeline list. `items` comes straight from buildTimeline(...).items.
// onToggle(item, nextDone) is called from the check on reminders and tasks.
export default function Timeline({ items = [], onToggle, onSelect, locale }) {
  if (!items.length) {
    return <p className="tls-empty">Nothing on the timeline yet. Tap + to add something.</p>
  }
  return (
    <ol className="tls-list" aria-label="Today timeline">
      {items.map((it) => rowFor(it, { locale, onToggle, onSelect }))}
    </ol>
  )
}
