import './viz.css';
import { sparkPoints } from './vizMath.js';

// Tiny trend line. Decorative (aria-hidden): always print the value beside it.
// Not used by v1 Today (/api/quote returns no series).
export default function Spark({ points = [], width = 64, height = 22, tone = 'default', className = '', ...rest }) {
  const pts = sparkPoints(points, { width, height });
  return (
    <svg
      className={`viz-spark ${className}`.trim()}
      data-tone={tone}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {pts && <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
