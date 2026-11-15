import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createCelebrator, shouldCelebrate, localDayKey, prefersReducedMotion } from '../src/today/celebrate.js'

function mem() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}
function make({ reduced = false, day = new Date(2026, 10, 15, 10) } = {}) {
  let fired = 0
  const clock = { d: day }
  const observe = createCelebrator({
    fire: () => { fired++ },
    storage: mem(),
    now: () => clock.d,
    reduced: () => reduced,
  })
  return { observe, clock, count: () => fired }
}

test('fires when done reaches total', () => {
  const c = make()
  c.observe(1, 3)
  c.observe(2, 3)
  assert.equal(c.observe(3, 3), true)
  assert.equal(c.count(), 1)
})

test('never fires on load when already complete', () => {
  const c = make()
  assert.equal(c.observe(3, 3), false)
  assert.equal(c.observe(3, 3), false)
  assert.equal(c.count(), 0)
})

test('fires once per local day, again the next day', () => {
  const c = make()
  c.observe(2, 3); c.observe(3, 3)
  c.observe(2, 3); c.observe(3, 3) // undo then redo same day
  assert.equal(c.count(), 1)
  c.clock.d = new Date(2026, 10, 16, 9)
  c.observe(2, 3); c.observe(3, 3)
  assert.equal(c.count(), 2)
})

test('persisted day blocks a fresh celebrator (reload) the same day', () => {
  const storage = mem()
  let fired = 0
  const opts = { fire: () => { fired++ }, storage, now: () => new Date(2026, 10, 15, 10), reduced: () => false }
  const a = createCelebrator(opts)
  a(2, 3); a(3, 3)
  const b = createCelebrator(opts)
  b(2, 3); b(3, 3)
  assert.equal(fired, 1)
})

test('not at all under prefers-reduced-motion', () => {
  const c = make({ reduced: true })
  c.observe(2, 3)
  assert.equal(c.observe(3, 3), false)
  assert.equal(c.count(), 0)
})

test('zero total never celebrates', () => {
  const c = make()
  c.observe(0, 0)
  assert.equal(c.observe(0, 0), false)
})

test('shouldCelebrate is pure and helpers behave', () => {
  const base = { prev: { done: 2, total: 3 }, done: 3, total: 3, lastDay: null, today: '2026-11-15', reduced: false }
  assert.equal(shouldCelebrate(base), true)
  assert.equal(shouldCelebrate({ ...base, lastDay: '2026-11-15' }), false)
  assert.equal(shouldCelebrate({ ...base, prev: null }), false)
  assert.equal(localDayKey(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(prefersReducedMotion({ matchMedia: () => ({ matches: true }) }), true)
  assert.equal(prefersReducedMotion({}), false)
})

test('TodayHome wires the celebrator (static source check)', () => {
  const src = readFileSync(new URL('../src/today/TodayHome.jsx', import.meta.url), 'utf8')
  assert.match(src, /from '\.\/celebrate\.js'/)
  assert.match(src, /createCelebrator\(\)/)
  assert.match(src, /observe\(d\.dailies\.done, d\.dailies\.total\)/)
  // layout/wiring from E2-05 intact
  for (const s of ['<TodayHeader', '<DailiesStrip', '<NextUp', '<Timeline', 'today-home-tiles', '<TutorTile']) {
    assert.ok(src.includes(s), s)
  }
})
