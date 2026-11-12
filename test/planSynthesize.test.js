import test from 'node:test'
import assert from 'node:assert/strict'
import { applySynthesis, schedule, synthesize, resolveDrops } from '../scripts/plan/plan-synthesize.mjs'
import { lintPlan } from '../scripts/plan/plan-lint.mjs'

const p = (id, writes, deps = [], size = 'S') => ({ id, title: id, size, writes, deps, acceptance: 'npm test passes' })
const phases = [{ id: 'P0', name: 'One' }, { id: 'P1', name: 'Two' }]

test('every proposal must be assigned, dropped or deferred', () => {
  const { errors } = applySynthesis([p('A', ['a']), p('B', ['b'])], { phases, assign: { A: 'P0' } })
  assert.match(errors.join('\n'), /B: not assigned, dropped or deferred/)
})

test('a drop is absorbed: deps on it are rewritten to the absorbing task', () => {
  const { tasks, errors } = applySynthesis([p('A', ['a']), p('B', ['b']), p('C', ['c'], ['B'])], { phases, assign: { A: 'P0', C: 'P0' }, drop: { B: { by: 'A', why: 'dup' } } })
  assert.deepEqual(errors, [])
  assert.deepEqual(tasks.find((t) => t.id === 'C').deps, ['A'])
  assert.deepEqual(tasks.find((t) => t.id === 'A').absorbs, ['B'])
})

test('a drop must resolve to an assigned task', () => {
  const { errors } = applySynthesis([p('A', ['a']), p('B', ['b'])], { phases, assign: { A: 'P0' }, drop: { B: { by: 'Z', why: 'x' } } })
  assert.ok(errors.length)
  assert.equal(resolveDrops({ X: { by: 'Y' }, Y: { by: 'Z' } }, 'X'), 'Z')
})

test('overrides add writes and deps and remove deps', () => {
  const { tasks } = applySynthesis([p('A', ['a']), p('B', ['b'], ['A'])], { phases, assign: { A: 'P0', B: 'P0' }, override: { B: { writesAdd: ['x'], depsRemove: ['A'], note: 'hi' } } })
  const b = tasks.find((t) => t.id === 'B')
  assert.deepEqual(b.writes, ['b', 'x'])
  assert.deepEqual(b.deps, [])
  assert.match(b.notes, /Plan: hi/)
})

test('USER: tasks are marked owner=user', () => {
  const u = { ...p('U', ['docs/u.md']), title: 'USER: do the thing' }
  const { tasks } = applySynthesis([u], { phases, assign: { U: 'P0' } })
  assert.equal(tasks.find((t) => t.id === 'U').owner, 'user')
})

test('schedule: independent tasks share a wave, conflicting writers and dependents are pushed later', () => {
  const syn = { phases, assign: { A: 'P0', B: 'P0', C: 'P0', D: 'P0' } }
  const props = [p('A', ['src/a.js']), p('B', ['src/b.js']), p('C', ['src/a.js']), p('D', ['src/d.js'], ['B'])]
  const { plan, errors } = synthesize(props, { ...syn, phases: [phases[0]] })
  assert.deepEqual(errors, [])
  const w = (id) => plan.tasks.find((t) => t.id === id).wave
  assert.equal(w('A'), 1)
  assert.equal(w('B'), 1)
  assert.equal(w('C'), 2) // same file as A
  assert.equal(w('D'), 2) // depends on B
  assert.equal(w('P0-GATE'), 3)
  assert.deepEqual(lintPlan(plan).errors, [])
})

test('schedule honours maxWidth', () => {
  const props = Array.from({ length: 5 }, (_, i) => p(`T${i}`, [`f${i}`]))
  const assign = Object.fromEntries(props.map((x) => [x.id, 'P0']))
  const { plan } = synthesize(props, { phases: [phases[0]], assign }, { maxWidth: 2 })
  const waves = plan.tasks.filter((t) => !t.gate).map((t) => t.wave)
  assert.deepEqual([...new Set(waves)].sort(), [1, 2, 3])
  assert.ok([1, 2, 3].every((w) => waves.filter((x) => x === w).length <= 2))
})

test('a dependency on a later phase is reported, not silently scheduled', () => {
  const props = [p('A', ['a'], ['B']), p('B', ['b'])]
  const { errors, plan } = synthesize(props, { phases, assign: { A: 'P0', B: 'P1' } })
  assert.equal(plan, null)
  assert.match(errors.join('\n'), /A \(P0\) depends on B, which is in later phase P1/)
})

test('a dependency cycle is reported', () => {
  const props = [p('A', ['a'], ['B']), p('B', ['b'], ['A'])]
  const { errors } = synthesize(props, { phases: [phases[0]], assign: { A: 'P0', B: 'P0' } })
  assert.match(errors.join('\n'), /cannot schedule/)
})

test('gates depend on every task in their phase and land last; cross-phase deps are satisfied by earlier phases', () => {
  const props = [p('A', ['a']), p('B', ['b'], ['A'])]
  const { plan, errors } = synthesize(props, { phases, assign: { A: 'P0', B: 'P1' } })
  assert.deepEqual(errors, [])
  const g0 = plan.tasks.find((t) => t.id === 'P0-GATE')
  assert.deepEqual(g0.deps, ['A'])
  assert.equal(plan.tasks.find((t) => t.id === 'B').wave, 1)
  assert.equal(plan.tasks.find((t) => t.id === 'P1-GATE').wave, 2)
  assert.deepEqual(lintPlan(plan).errors, [])
})

test('schedule: a reader is never in the same wave as a writer of the file it reads', () => {
  const props = [p('W', ['src/store.js']), { ...p('R', ['src/r.js']), reads: ['src/store.js'] }, p('X', ['src/x.js'])]
  const { plan, errors } = synthesize(props, { phases: [phases[0]], assign: { W: 'P0', R: 'P0', X: 'P0' } })
  assert.deepEqual(errors, [])
  const w = (id) => plan.tasks.find((t) => t.id === id).wave
  assert.notEqual(w('W'), w('R'))
  assert.equal(w('X'), 1)
  assert.deepEqual(lintPlan(plan).warnings.filter((x) => /reads/.test(x)), [])
})

test('an urgent task is scheduled first even when it has the shortest chain', () => {
  const props = [p('A', ['a']), p('B', ['b'], ['A']), p('C', ['c'], ['B']), p('U', ['u'])]
  const assign = { A: 'P0', B: 'P0', C: 'P0', U: 'P0' }
  const { plan } = synthesize(props, { phases: [phases[0]], assign, override: { U: { urgent: true } } }, { maxWidth: 1 })
  assert.equal(plan.tasks.find((t) => t.id === 'U').wave, 1)
  assert.equal(plan.tasks.find((t) => t.id === 'U').urgent, true)
})
