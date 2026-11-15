import './viz.css';
import { donutGradient, donutShares } from './vizMath.js';

// Segment donut. segments: [{ id, label, value }]. The legend is real text and
// doubles as the accessible description; the ring itself is role="img".
// `format` formats a segment value for the legend (default: plain number).
export default function Donut({ segments = [], center, legend = true, size = 104, label = 'Breakdown', format = (n) => String(n), className = '', ...rest }) {
  const thickness = Math.round(size * 0.16);
  const shares = donutShares(segments);
  const summary = shares.length
    ? `${label}: ${shares.map((s) => `${s.label} ${s.percent}%`).join(', ')}`
    : `${label}: no data`;
  return (
    <div className={`viz-donut-wrap ${className}`.trim()} {...rest}>
      <div
        className="viz-donut"
        role="img"
        aria-label={summary}
        style={{ '--viz-size': `${size}px`, '--viz-thick': `${thickness}px`, background: donutGradient(segments, { gap: 2, size, thickness }) }}
      >
        <div className="viz-donut-center" aria-hidden="true">{center}</div>
      </div>
      {legend && (
        <ul className="viz-legend">
          {shares.length === 0 && <li className="viz-legend-empty">No data</li>}
          {shares.map((s) => (
            <li key={s.id}>
              <i className="viz-swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="viz-legend-label">{s.label}</span>
              <b>{format(s.value)}</b>
              <span className="viz-legend-pct">{s.percent}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
