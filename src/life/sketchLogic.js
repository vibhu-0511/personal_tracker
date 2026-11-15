// sketchLogic: pure helpers for the Pencil sketch canvas (R2-19). No DOM, no React.
//
// A drawing is an array of strokes, kept in memory only (D17: drawings will later live in a
// separate synced collection, never inside notes; persistence is not part of this module).
//
//   stroke = { color, size, points: [{ x, y, p }] }
//     color  CSS colour string; the eraser is just the canvas background colour
//     size   the widest the stroke may get (full pressure), in logical canvas px
//     x, y   logical canvas px (see toCanvasPoint); p is pressure in 0..1
//
// Every function returns new arrays/objects and never mutates its inputs, so the component can
// keep the stroke list in state and undo is just "drop the last stroke".

export const MIN_WIDTH = 1
export const MAX_WIDTH = 8
export const DEFAULT_PRESSURE = 0.5

const clamp01 = (n) => Math.min(1, Math.max(0, n))

// Stroke width for a pressure in 0..1: a straight line from `min` (pressure 0) to `max`
// (pressure 1). Out-of-range pressure is clamped; a missing or non-numeric one counts as 0.5.
export function strokeWidth(pressure, { min = MIN_WIDTH, max = MAX_WIDTH } = {}) {
  const p = typeof pressure === 'number' && Number.isFinite(pressure) ? clamp01(pressure) : DEFAULT_PRESSURE
  return min + (max - min) * p
}

// The pressure to record for a pointer event. Only a pen reports real pressure; a mouse reports
// 0.5 while pressed and touch is not reliable across browsers, so both get the neutral 0.5.
// A pen reporting exactly 0 while in contact (some browsers on the first event) is treated as
// neutral too, so the first dot of a stroke is not a hairline.
export function pointerPressure(pointerType, pressure) {
  if (pointerType !== 'pen') return DEFAULT_PRESSURE
  if (typeof pressure !== 'number' || !Number.isFinite(pressure) || pressure <= 0) return DEFAULT_PRESSURE
  return clamp01(pressure)
}

// Move `prev` toward `next` so a sudden pressure change does not draw a step in the line.
// `k` is how much of the new value to take (1 = no smoothing).
export function smoothWidth(prev, next, k = 0.5) {
  if (typeof prev !== 'number' || !Number.isFinite(prev)) return next
  return prev + (next - prev) * k
}

// Client coordinates -> logical canvas coordinates, given the canvas's bounding rect.
// The canvas is displayed at any CSS size but drawn in a fixed logical size, so scale by the ratio.
export function toCanvasPoint(clientX, clientY, rect, logicalWidth, logicalHeight) {
  const w = rect.width || logicalWidth
  const h = rect.height || logicalHeight
  return {
    x: ((clientX - rect.left) / w) * logicalWidth,
    y: ((clientY - rect.top) / h) * logicalHeight,
  }
}

export function startStroke(strokes, { color, size = MAX_WIDTH }, point) {
  return [...strokes, { color, size, points: [point] }]
}

// Add a point to the stroke currently being drawn (the last one). No-op when there is none.
export function appendPoint(strokes, point) {
  if (!strokes.length) return strokes
  const last = strokes[strokes.length - 1]
  return [...strokes.slice(0, -1), { ...last, points: [...last.points, point] }]
}

// Undo: drop the most recent stroke. An empty drawing stays empty.
export function undoLastStroke(strokes) {
  return strokes.length ? strokes.slice(0, -1) : strokes
}

export function clearStrokes() {
  return []
}

// The segments to paint for one stroke: one entry per consecutive pair of points, with a width
// from the mean of the two pressures scaled to the stroke's size. A one-point stroke (a tap)
// yields a single zero-length segment so it still paints a dot.
export function strokeSegments(stroke, { min = MIN_WIDTH } = {}) {
  const pts = stroke.points
  if (!pts.length) return []
  const max = Math.max(min, stroke.size)
  const widthFor = (p) => strokeWidth(p, { min, max })
  if (pts.length === 1) {
    const a = pts[0]
    return [{ from: a, to: a, width: widthFor(a.p) }]
  }
  const out = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    out.push({ from: a, to: b, width: widthFor(((a.p ?? DEFAULT_PRESSURE) + (b.p ?? DEFAULT_PRESSURE)) / 2) })
  }
  return out
}
