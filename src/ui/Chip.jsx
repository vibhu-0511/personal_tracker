import './ui.css';

// tone: default | muted | hot | success | warn
export default function Chip({ tone = 'default', children, className = '' }) {
  return <span className={`ui-chip ${className}`.trim()} data-tone={tone}>{children}</span>;
}
