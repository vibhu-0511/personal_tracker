import './ui.css';

// Visual 22px circle inside a hit area of 28px (fine pointer) / 44px (coarse).
export default function Check({ checked = false, onChange, label, tone = 'success', className = '' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`ui-check ${className}`.trim()}
      data-tone={tone}
      onClick={() => onChange && onChange(!checked)}
    >
      <span className="ui-check-box" aria-hidden="true">{checked ? '✓' : ''}</span>
    </button>
  );
}
