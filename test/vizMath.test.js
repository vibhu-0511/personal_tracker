import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clamp,
  chartColor,
  ringGradient,
  donutStops,
  donutGradient,
  donutShares,
  gapPercent,
  sparkPoints,
} from '../src/ui/vizMath.js'

// Pull the "a% b%" pairs out of a conic-gradient string (colour literals contain no %).
const parseStops = (g) => [...g.matchAll(/([\d.]+)%\s+([\d.]+)%/g)].map((m) => ({ from: Number(m[1]), to: Number(m[2]) }))
const TRACK_RING = /^conic-gradient\(var\(--track, rgba\([^)]*\)\) 0 100%\)$/

const segs = [
  { id: 'a', label: 'Food', value: 300 },
  { id: 'b', label: 'Rent', value: 500 },
  { id: 'c', label: 'Fun', value: 200 },
]

test('clamp bounds and non-finite input', () => {
  assert.equal(clamp(150), 100)
  assert.equal(clamp(-5), 0)
  assert.equal(clamp(NaN), 0)
  assert.equal(clamp(42), 42)
})

test('chartColor cycles through --chart-1..6 with dark fallback', () => {
  assert.match(chartColor(0), /^var\(--chart-1, #7c8cff\)$/)
  assert.match(chartColor(5), /--chart-6/)
  assert.match(chartColor(6), /--chart-1/)
})

test('ringGradient handles 0, mid and full', () => {
  assert.match(ringGradient(0), TRACK_RING)
  assert.match(ringGradient(50), / 0 50%, .* 50% 100%\)$/)
  assert.match(ringGradient(250), / 0 100%\)$/)
  assert.ok(!ringGradient(NaN).includes('NaN'))
})

test('donutStops sum to 100 and drop non-positive values', () => {
  const { stops, total } = donutStops([...segs, { id: 'z', value: 0 }, { id: 'n', value: -3 }, { id: 'x', value: NaN }])
  assert.equal(total, 1000)
  assert.equal(stops.length, 3)
  assert.equal(stops[0].from, 0)
  assert.equal(stops[2].to, 100)
  for (let i = 1; i < stops.length; i++) assert.equal(stops[i].from, stops[i - 1].to)
})

test('donutGradient without gap emits contiguous stops ending at 100%', () => {
  const g = donutGradient(segs)
  const s = parseStops(g)
  assert.equal(s.length, 3)
  assert.equal(s[0].from, 0)
  assert.equal(s.at(-1).to, 100)
  assert.deepEqual(s.map((x) => x.to), [30, 80, 100])
  for (let i = 1; i < s.length; i++) assert.equal(s[i].from, s[i - 1].to)
})

test('donutGradient 2px gap keeps stops contiguous, 0-100, with gap-coloured stops', () => {
  const g = donutGradient(segs, { gap: 2, size: 104, thickness: 17 })
  const s = parseStops(g)
  assert.equal(s[0].from, 0)
  assert.equal(s.at(-1).to, 100)
  for (let i = 1; i < s.length; i++) {
    assert.ok(Math.abs(s[i].from - s[i - 1].to) < 1e-9, `stop ${i} contiguous`)
    assert.ok(s[i].to >= s[i].from, `stop ${i} monotonic`)
  }
  // 3 slices + a gap after each + the leading gap = 7 stops
  assert.equal(s.length, 7)
  assert.equal((g.match(/var\(--surface/g) || []).length, 4)
  assert.ok(!g.includes('NaN'))
  // the gap is ~2px of circumference at the mid-line
  const px = (s[1].to - s[1].from) / 100 * Math.PI * (104 - 17)
  assert.ok(px > 0)
  assert.ok(Math.abs(gapPercent(2, 104, 17) * Math.PI * (104 - 17) / 100 - 2) < 1e-9)
})

test('donutGradient empty data renders a track ring', () => {
  for (const input of [[], undefined, null, [{ id: 'a', value: 0 }]]) {
    const g = donutGradient(input, { gap: 2 })
    assert.match(g, TRACK_RING)
  }
})

test('donutGradient single segment is a solid ring even with a gap', () => {
  const g = donutGradient([{ id: 'a', value: 7 }], { gap: 2 })
  assert.match(g, /^conic-gradient\(var\(--chart-1, #7c8cff\) 0 100%\)$/)
  assert.ok(!g.includes('--surface'))
})

test('donutGradient honours explicit segment colours and colour list', () => {
  const g = donutGradient([{ value: 1, color: '#111111' }, { value: 1 }], { colors: ['#aaaaaa', '#bbbbbb'] })
  assert.ok(g.includes('#111111 0% 50%'))
  assert.ok(g.includes('#bbbbbb 50% 100%'))
})

test('donutShares are whole percents summing to 100', () => {
  const shares = donutShares([{ id: 1, label: 'a', value: 1 }, { id: 2, label: 'b', value: 1 }, { id: 3, label: 'c', value: 1 }])
  assert.equal(shares.reduce((a, s) => a + s.percent, 0), 100)
  assert.deepEqual(donutShares([]), [])
})

test('sparkPoints scales a normal series into the box', () => {
  const pts = sparkPoints([1, 3, 2], { width: 60, height: 20, pad: 2 }).split(' ')
  assert.equal(pts.length, 3)
  assert.equal(pts[0], '0,18')
  assert.equal(pts[1], '30,2')
  assert.equal(pts[2], '60,10')
})

test('sparkPoints scales flat, single and bad series without NaN', () => {
  const flat = sparkPoints([5, 5, 5, 5], { width: 40, height: 20 })
  assert.ok(!flat.includes('NaN'))
  assert.ok(flat.split(' ').every((p) => p.endsWith(',10')))
  const one = sparkPoints([9], { width: 40, height: 20 })
  assert.ok(!one.includes('NaN'))
  assert.equal(one.split(' ').length, 2)
  assert.equal(sparkPoints([]), '')
  assert.equal(sparkPoints(undefined), '')
  assert.ok(!sparkPoints([1, NaN, 3, Infinity]).includes('NaN'))
})
