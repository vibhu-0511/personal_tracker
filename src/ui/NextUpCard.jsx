import './ui.css';
import './timeline.css';

// The one accent-text card on Today. Empty state when title is null.
export default function NextUpCard({ eyebrow = 'Next up', title, time, onDone, onSnooze, emptyText = 'Nothing left on the clock.', className = '' }) {
  if (title == null) {
    return (
      <section className={`tl-card ${className}`.trim()} aria-label="Next up">
        <p className="tl-card-empty">{emptyText}</p>
      </section>
    );
  }
  return (
    <section className={`tl-card ${className}`.trim()} aria-label="Next up">
      <p className="tl-card-eyebrow">{eyebrow}</p>
      <h3 className="tl-card-title">{title}</h3>
      {time != null && <span className="tl-card-time">{time}</span>}
      <div className="tl-card-actions">
        {onDone && <button type="button" className="tl-btn" data-primary="" onClick={onDone}>Done</button>}
        {onSnooze && <button type="button" className="tl-btn" onClick={onSnooze}>Snooze 1h</button>}
      </div>
    </section>
  );
}
