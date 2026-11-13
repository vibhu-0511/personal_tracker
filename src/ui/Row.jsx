import './ui.css';

// List row. With onSelect the title block becomes a real button (selected state
// exposed via aria-current); lead/trail stay independent controls.
export default function Row({ lead, title, sub, trail, selected = false, done = false, onSelect, dense = false, as: Tag = 'li', className = '' }) {
  const body = (
    <>
      <span className="ui-row-title">{title}</span>
      {sub != null && <span className="ui-row-sub">{sub}</span>}
    </>
  );
  return (
    <Tag
      className={`ui-row ${className}`.trim()}
      data-selected={selected ? '' : undefined}
      data-done={done ? '' : undefined}
      data-dense={dense ? '' : undefined}
    >
      {lead != null && <span className="ui-row-lead">{lead}</span>}
      {onSelect
        ? <button type="button" className="ui-row-main" onClick={onSelect} aria-current={selected ? 'true' : undefined}>{body}</button>
        : <div className="ui-row-main">{body}</div>}
      {trail != null && <span className="ui-row-trail">{trail}</span>}
    </Tag>
  );
}
