import './ui.css';

// action: { label, onClick } or a ready-made node.
export default function EmptyState({ icon, text, action, className = '' }) {
  return (
    <div className={`ui-empty ${className}`.trim()}>
      {icon != null && <div className="ui-empty-icon" aria-hidden="true">{icon}</div>}
      <p className="ui-empty-text">{text}</p>
      {action && (action.label
        ? <button type="button" className="ui-empty-action" onClick={action.onClick}>{action.label}</button>
        : action)}
    </div>
  );
}
