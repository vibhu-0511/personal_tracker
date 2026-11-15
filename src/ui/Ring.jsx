import './viz.css';
import { clamp, ringGradient } from './vizMath.js';

// Single-value ring (0-100) with optional centre content.
// `label` is the text alternative, e.g. "2 of 3 solved today".
export default function Ring({ value = 0, size = 92, label, children, className = '', ...rest }) {
  const v = Math.round(clamp(value));
  const text = label ? `${label} (${v}%)` : `${v}%`;
  return (
    <div
      className={`viz-ring ${className}`.trim()}
      role="img"
      aria-label={text}
      style={{ '--viz-size': `${size}px`, background: ringGradient(v) }}
      {...rest}
    >
      <div className="viz-ring-inner" aria-hidden="true">{children}</div>
    </div>
  );
}
