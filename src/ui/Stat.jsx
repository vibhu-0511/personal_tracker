import './ui.css';

// tone: default | accent | success | warn | danger
export default function Stat({ label, value, tone = 'default', className = '' }) {
  return (
    <div className={`ui-stat ${className}`.trim()} data-tone={tone}>
      <div className="ui-stat-value">{value}</div>
      <div className="ui-stat-label">{label}</div>
    </div>
  );
}
