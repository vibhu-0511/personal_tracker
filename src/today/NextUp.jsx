import NextUpCard from '../ui/NextUpCard.jsx';
import './nextup.css';

const MIN = 60000;

// Epoch ms of 7 PM today (the overdue chip's one-tap new time).
export function todaySevenPm(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 19).getTime();
}

// "5:00 PM" in the device's locale, plus "in N min" when under two hours away.
export function nextUpTime(at, now = Date.now()) {
  const abs = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const mins = Math.max(1, Math.ceil((at - now) / MIN));
  return mins < 120 ? `${abs} · in ${mins} min` : abs;
}

// Overdue chip, next-up card, in that order. Props:
//   nextUp   { id, kind, title, at } | null     (from buildTimeline)
//   overdue  [{ id, kind, title, at }]          oldest first (from buildTimeline)
//   onDone(item), onSnooze(item)                called with the nextUp item (Snooze 1h)
//   onOverdueReschedule(item, at)               called with the oldest overdue item and 7 PM today
export default function NextUp({ nextUp = null, overdue = [], now = Date.now(), onDone, onSnooze, onOverdueReschedule, className = '' }) {
  const oldest = overdue[0];
  return (
    <div className={`nextup ${className}`.trim()}>
      {oldest && (
        <div className="nextup-overdue" role="group" aria-label="Overdue">
          <p className="nextup-overdue-text">
            <span className="nextup-overdue-count">{overdue.length} overdue</span>
            <span aria-hidden="true"> · </span>
            <span className="nextup-overdue-title">{oldest.title}</span>
          </p>
          {onOverdueReschedule && (
            <button type="button" className="nextup-overdue-btn" onClick={() => onOverdueReschedule(oldest, todaySevenPm(now))}>
              Today 7 PM
            </button>
          )}
        </div>
      )}
      <NextUpCard
        title={nextUp ? nextUp.title : null}
        time={nextUp ? nextUpTime(nextUp.at, now) : undefined}
        onDone={onDone && nextUp ? () => onDone(nextUp) : undefined}
        onSnooze={onSnooze && nextUp ? () => onSnooze(nextUp) : undefined}
      />
    </div>
  );
}
