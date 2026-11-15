import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MIN_WIDTH,
  MAX_WIDTH,
  strokeWidth,
  pointerPressure,
  smoothWidth,
  toCanvasPoint,
  startStroke,
  appendPoint,
  undoLastStroke,
  clearStrokes,
  strokeSegments,
} from '../src/life/sketchLogic.js'

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !~ ${b}`)

test('strokeWidth maps pressure 0..1 linearly from min to max', () => {
  near(strokeWidth(0), MIN_WIDTH)
  near(strokeWidth(1), MAX_WIDTH)
  near(strokeWidth(0.5), (MIN_WIDTH + MAX_WIDTH) / 2)
  near(strokeWidth(0, { min: 2, max: 10 }), 2)
  near(strokeWidth(0.25, { min: 2, max: 10 }), 4)
  assert.ok(strokeWidth(0.3) < strokeWidth(0.7))
})

test('strokeWidth clamps out-of-range pressure and defaults a missing one to 0.5', () => {
  near(strokeWidth(-3), MIN_WIDTH)
  near(strokeWidth(7), MAX_WIDTH)
  const mid = (MIN_WIDTH + MAX_WIDTH) / 2
  near(strokeWidth(undefined), mid)
  near(strokeWidth(NaN), mid)
  near(strokeWidth('0.9'), mid)
})

test('pointerPressure trusts a pen and gives mouse, touch and zero-pressure pen the neutral 0.5', () => {
  near(pointerPressure('pen', 0.8), 0.8)
  near(pointerPressure('pen', 1.4), 1)
  near(pointerPressure('pen', 0), 0.5)
  near(pointerPressure('pen', undefined), 0.5)
  near(pointerPressure('mouse', 0.9), 0.5)
  near(pointerPressure('touch', 0.1), 0.5)
})

test('smoothWidth eases toward the new width and starts at it when there is no previous', () => {
  near(smoothWidth(2, 6, 0.5), 4)
  near(smoothWidth(2, 6, 1), 6)
  near(smoothWidth(undefined, 6), 6)
})

test('toCanvasPoint scales client coordinates by the displayed-to-logical ratio', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 }
  assert.deepEqual(toCanvasPoint(110, 70, rect, 400, 200), { x: 200, y: 100 })
  assert.deepEqual(toCanvasPoint(10, 20, rect, 400, 200), { x: 0, y: 0 })
  // A zero-sized rect (not laid out yet) falls back to 1:1 instead of dividing by zero.
  const p = toCanvasPoint(5, 5, { left: 0, top: 0, width: 0, height: 0 }, 400, 200)
  assert.deepEqual(p, { x: 5, y: 5 })
})

test('startStroke / appendPoint build the stroke being drawn without mutating', () => {
  const empty = []
  const s1 = startStroke(empty, { color: '#000', size: 6 }, { x: 0, y: 0, p: 0.2 })
  assert.deepEqual(empty, [])
  assert.equal(s1.length, 1)
  assert.deepEqual(s1[0], { color: '#000', size: 6, points: [{ x: 0, y: 0, p: 0.2 }] })
  const s2 = appendPoint(s1, { x: 1, y: 1, p: 0.9 })
  assert.equal(s1[0].points.length, 1)
  assert.equal(s2[0].points.length, 2)
  // Points go on the last stroke only.
  const s3 = appendPoint(startStroke(s2, { color: '#f00' }, { x: 5, y: 5, p: 0.5 }), { x: 6, y: 6, p: 0.5 })
  assert.equal(s3[0].points.length, 2)
  assert.equal(s3[1].points.length, 2)
  assert.equal(s3[1].size, MAX_WIDTH)
  assert.deepEqual(appendPoint([], { x: 1, y: 1, p: 1 }), [])
})

test('undoLastStroke removes only the most recent stroke and leaves the input alone', () => {
  let strokes = startStroke([], { color: 'a' }, { x: 0, y: 0, p: 0.5 })
  strokes = startStroke(strokes, { color: 'b' }, { x: 1, y: 1, p: 0.5 })
  strokes = startStroke(strokes, { color: 'c' }, { x: 2, y: 2, p: 0.5 })
  const after = undoLastStroke(strokes)
  assert.deepEqual(after.map((s) => s.color), ['a', 'b'])
  assert.deepEqual(strokes.map((s) => s.color), ['a', 'b', 'c'])
  assert.deepEqual(undoLastStroke(undoLastStroke(after)), [])
})

test('undoLastStroke on an empty drawing stays empty; clearStrokes empties', () => {
  assert.deepEqual(undoLastStroke([]), [])
  const one = startStroke([], { color: 'a' }, { x: 0, y: 0, p: 0.5 })
  assert.deepEqual(clearStrokes(one), [])
})

test('strokeSegments gives one segment per point pair, width following mean pressure', () => {
  const stroke = {
    color: '#000',
    size: 9,
    points: [
      { x: 0, y: 0, p: 0 },
      { x: 1, y: 0, p: 1 },
      { x: 2, y: 0, p: 1 },
    ],
  }
  const segs = strokeSegments(stroke)
  assert.equal(segs.length, 2)
  near(segs[0].width, (1 + 9) / 2) // mean pressure 0.5
  near(segs[1].width, 9) // full pressure -> the stroke's size
  assert.deepEqual(segs[0].from, stroke.points[0])
  assert.deepEqual(segs[0].to, stroke.points[1])
})

test('strokeSegments paints a tap as one zero-length segment and an empty stroke as none', () => {
  const tap = { color: '#000', size: 8, points: [{ x: 3, y: 4, p: 1 }] }
  const segs = strokeSegments(tap)
  assert.equal(segs.length, 1)
  assert.deepEqual(segs[0].from, segs[0].to)
  near(segs[0].width, 8)
  assert.deepEqual(strokeSegments({ color: '#000', size: 8, points: [] }), [])
})
