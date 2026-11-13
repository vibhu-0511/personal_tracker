import './viz.css';
import { clamp } from './vizMath.js';

// Horizontal progress bar. tone: default | success | warn | danger
export default function Bar({ value = 0, tone = 'default', label, className = '', ...rest }) {
  const v = Math.round(clamp(value));
  return (
    <div
      className={`viz-bar ${className}`.trim()}
      data-tone={tone}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={label}
      {...rest}
    >
      <div className="viz-bar-fill" style={{ width: `${v}%` }} />
    </div>
  );
}
