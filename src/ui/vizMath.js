// Pure geometry helpers for the data-viz primitives (Bar, Ring, Donut, Spark).
// No DOM, no React: everything here is unit-tested in test/vizMath.test.js.

// Dark-palette literals (B3-spec --chart-1..6). Used only as var() fallbacks so
// the primitives still render before the token merge lands.
export const CHART_FALLBACKS = ['#7c8cff', '#3dd6c6', '#ffb86b', '#ff7a90', '#a78bfa', '#6b7488'];
export const SURFACE_FALLBACK = '#13161d';
export const TRACK_FALLBACK = 'rgba(255,255,255,.10)';

const num = (n) => (Number.isFinite(n) ? n : 0);
const round = (n, d = 3) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

// Clamp to [lo, hi]; non-finite input becomes lo.
export function clamp(n, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, num(n)));
}

// CSS colour for slice index i: --chart-1..6 with the dark literal as fallback.
export function chartColor(i) {
  const k = ((Math.trunc(num(i)) % 6) + 6) % 6;
  return `var(--chart-${k + 1}, ${CHART_FALLBACKS[k]})`;
}

// Conic-gradient string for a single-value ring (0-100).
export function ringGradient(value, { color = 'var(--accent, #6ea8fe)', track = `var(--track, ${TRACK_FALLBACK})` } = {}) {
  const p = round(clamp(value));
  if (p <= 0) return `conic-gradient(${track} 0 100%)`;
  if (p >= 100) return `conic-gradient(${color} 0 100%)`;
  return `conic-gradient(${color} 0 ${p}%, ${track} ${p}% 100%)`;
}

// Segments -> { stops, total } where stops are { id, label, value, color, from, to } in percent.
// Non-positive / non-finite values are dropped. `from`/`to` cover the slices only
// (gaps are added by donutGradient), and the last `to` is always exactly 100.
export function donutStops(segments, { colors } = {}) {
  const list = (Array.isArray(segments) ? segments : []).filter((s) => s && num(s.value) > 0);
  const total = list.reduce((a, s) => a + s.value, 0);
  if (!total) return { stops: [], total: 0 };
  let acc = 0;
  const stops = list.map((s, i) => {
    const from = acc;
    acc += (s.value / total) * 100;
    const to = i === list.length - 1 ? 100 : acc;
    return {
      id: s.id ?? i,
      label: s.label ?? '',
      value: s.value,
      color: s.color || (colors && colors[i % colors.length]) || chartColor(i),
      from,
      to,
    };
  });
  return { stops, total };
}

// Percent of the ring circumference that `gapPx` takes at ring diameter `size`
// (measured on the ring's mid-line, where `thickness` is the ring width in px).
export function gapPercent(gapPx, size = 104, thickness = 17) {
  const g = num(gapPx);
  const midR = Math.max(1, (num(size) - num(thickness)) / 2);
  return (g / (2 * Math.PI * midR)) * 100;
}

// conic-gradient() for a donut. Stop percentages are monotonic and end at 100%.
//   gap: px of surface-coloured separation between slices (default 0; 2 in the UI)
//   size / thickness: ring geometry in px, used to turn the px gap into a percent
// Empty data -> a full track ring. A single slice -> a solid ring (no gap needed).
export function donutGradient(segments, { gap = 0, size = 104, thickness = 17, gapColor = `var(--surface, ${SURFACE_FALLBACK})`, track = `var(--track, ${TRACK_FALLBACK})`, colors } = {}) {
  const { stops } = donutStops(segments, { colors });
  if (stops.length === 0) return `conic-gradient(${track} 0 100%)`;
  if (stops.length === 1) return `conic-gradient(${stops[0].color} 0 100%)`;
  const g = gap > 0 ? gapPercent(gap, size, thickness) : 0;
  const parts = [];
  stops.forEach((s, i) => {
    const half = g / 2;
    // Each slice gives up half a gap at both ends; the ring wraps, so the
    // gap before slice 0 is drawn at the very end and start of the gradient.
    const a = s.from + half;
    const b = s.to - half;
    if (g > 0 && i === 0) parts.push(`${gapColor} 0% ${round(a)}%`);
    parts.push(`${s.color} ${round(a)}% ${round(b)}%`);
    if (g > 0) parts.push(`${gapColor} ${round(b)}% ${i === stops.length - 1 ? 100 : round(s.to + half)}%`);
  });
  return `conic-gradient(${parts.join(', ')})`;
}

// Whole-percent shares for a legend; largest-remainder so they sum to 100.
export function donutShares(segments) {
  const { stops, total } = donutStops(segments);
  if (!total) return [];
  const raw = stops.map((s) => (s.value / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floors[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < order.length && left > 0; k++, left--) floors[order[k][1]] += 1;
  return stops.map((s, i) => ({ id: s.id, label: s.label, value: s.value, color: s.color, percent: floors[i] }));
}

// Points string for an SVG <polyline>. Scales to the series' own min/max;
// a flat or single-point series is drawn as a centred horizontal line (no NaN).
export function sparkPoints(values, { width = 64, height = 22, pad = 2 } = {}) {
  const v = (Array.isArray(values) ? values : []).filter((n) => Number.isFinite(n));
  if (v.length === 0) return '';
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const mn = Math.min(...v);
  const mx = Math.max(...v);
  const span = mx - mn;
  const inner = Math.max(0, h - pad * 2);
  const y = (n) => (span === 0 ? h / 2 : h - pad - ((n - mn) / span) * inner);
  const x = (i) => (v.length === 1 ? w / 2 : (i / (v.length - 1)) * w);
  const pts = v.map((n, i) => `${round(x(i), 1)},${round(y(n), 1)}`);
  // A lone point gets a zero-length second point so the line cap renders a dot.
  if (pts.length === 1) pts.push(pts[0]);
  return pts.join(' ');
}
