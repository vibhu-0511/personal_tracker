import './ui.css';
import './timeline.css';

export const TIMELINE_KINDS = ['reminder', 'note', 'expense', 'now', 'done'];

// One entry on the Today timeline: time, rail marker, content, optional trail
// (amount or Check). With onSelect the content becomes a real button.
// kind: reminder | note | expense | now | done.
export default function TimelineRow({ kind = 'reminder', time, title, sub, trail, onSelect, as: Tag = 'li', className = '' }) {
  const k = TIMELINE_KINDS.includes(kind) ? kind : 'reminder';
  const body = (
    <span className="tl-body">
      <span className="tl-title">{title}</span>
      {sub != null && <span className="tl-sub">{sub}</span>}
    </span>
  );
  return (
    <Tag
      className={`tl-row ${className}`.trim()}
      data-kind={k}
      aria-current={k === 'now' ? 'time' : undefined}
    >
      <span className="tl-time">{time}</span>
      <span className="tl-rail" aria-hidden="true"><span className="tl-marker" /></span>
      {onSelect
        ? <button type="button" className="tl-main" onClick={onSelect}>{body}</button>
        : body}
      {trail != null && <span className="tl-trail">{trail}</span>}
    </Tag>
  );
}
