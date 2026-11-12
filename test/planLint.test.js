import test from 'node:test'
import assert from 'node:assert/strict'
import { patternsOverlap, lintPlan, checkProposals, renderPlan } from '../scripts/plan/plan-lint.mjs'

const task = (id, phase, wave, writes, deps = []) => ({ id, phase, wave, title: id, size: 'S', writes, deps, acceptance: 'npm test passes' })
const plan1 = (tasks) => ({ phases: [{ id: 'P0', name: 'One' }], tasks })
const plan = (tasks) => ({ phases: [{ id: 'P0', name: 'One' }, { id: 'P1', name: 'Two' }], tasks })

test('patternsOverlap: exact files', () => {
  assert.equal(patternsOverlap('src/a.js', 'src/a.js'), true)
  assert.equal(patternsOverlap('src/a.js', 'src/b.js'), false)
})

test('patternsOverlap: directory globs cover files beneath them', () => {
  assert.equal(patternsOverlap('src/tabs/**', 'src/tabs/Life.jsx'), true)
  assert.equal(patternsOverlap('src/tabs/*.jsx', 'src/tabs/Life.jsx'), true)
  assert.equal(patternsOverlap('src/tabs/', 'src/tabs/Life.jsx'), true)
  assert.equal(patternsOverlap('src/tabs/**', 'src/tab/Life.jsx'), false)
  assert.equal(patternsOverlap('src/**', 'src/tabs/**'), true)
  assert.equal(patternsOverlap('api/**', 'src/**'), false)
})

test('a clean plan has no errors', () => {
  const r = lintPlan(plan([task('A', 'P0', 1, ['src/a.js']), task('B', 'P0', 1, ['src/b.js']), task('C', 'P0', 2, ['src/a.js'], ['A', 'B']), task('D', 'P1', 1, ['src/d.js'], ['C'])]))
  assert.deepEqual(r.errors, [])
  assert.equal(r.stats.tasks, 4)
  assert.equal(r.stats.waves, 3)
  assert.equal(r.stats.maxWidth, 2)
})

test('two tasks in one wave writing the same file is an error', () => {
  const r = lintPlan(plan1([task('A', 'P0', 1, ['package.json']), task('B', 'P0', 1, ['package.json'])]))
  assert.equal(r.errors.length, 1)
  assert.match(r.errors[0], /A and B both write package\.json/)
})

test('a glob write conflicts with a file write in the same wave', () => {
  const r = lintPlan(plan1([task('A', 'P0', 1, ['src/tabs/**']), task('B', 'P0', 1, ['src/tabs/Life.jsx'])]))
  assert.equal(r.errors.length, 1)
})

test('a dependency in the same wave or later is an error', () => {
  const same = lintPlan(plan([task('A', 'P0', 1, ['a']), task('B', 'P0', 1, ['b'], ['A'])]))
  assert.match(same.errors.join('\n'), /B: dependency A is not in an earlier wave/)
  const later = lintPlan(plan([task('A', 'P0', 2, ['a'], []), task('B', 'P0', 1, ['b'], ['A'])]))
  assert.match(later.errors.join('\n'), /dependency A is not in an earlier wave/)
})

test('a dependency on an earlier phase is fine, on a later phase is not', () => {
  const ok = lintPlan(plan([task('A', 'P0', 1, ['a']), task('B', 'P1', 1, ['b'], ['A'])]))
  assert.deepEqual(ok.errors, [])
  const bad = lintPlan(plan([task('A', 'P0', 1, ['a'], ['B']), task('B', 'P1', 1, ['b'])]))
  assert.equal(bad.errors.length, 1)
})

test('unknown dependency, unknown phase, duplicate id, wave gap and empty phase are all reported', () => {
  const r = lintPlan(plan([task('A', 'P0', 1, ['a'], ['NOPE']), task('A', 'P0', 3, ['b']), task('Z', 'PX', 1, ['z'])]))
  const text = r.errors.join('\n')
  assert.match(text, /unknown task NOPE/)
  assert.match(text, /duplicate task id/)
  assert.match(text, /unknown phase "PX"/)
  assert.match(text, /contiguous/)
  assert.match(text, /P1: phase has no tasks/)
})

test('missing acceptance and bad size are rejected', () => {
  const t = { id: 'A', phase: 'P0', wave: 1, title: 'x', size: 'XL', writes: ['a'], deps: [] }
  const r = lintPlan({ phases: [{ id: 'P0', name: 'One' }], tasks: [t] })
  assert.match(r.errors.join('\n'), /size must be/)
  assert.match(r.errors.join('\n'), /acceptance/)
})

test('too-wide waves and same-wave read-after-write only warn', () => {
  const many = Array.from({ length: 7 }, (_, i) => task(`T${i}`, 'P0', 1, [`f${i}`]))
  const r = lintPlan({ phases: [{ id: 'P0', name: 'One' }], tasks: many })
  assert.deepEqual(r.errors, [])
  assert.match(r.warnings.join('\n'), /exceeds the width/)
  const rw = lintPlan(plan([task('A', 'P0', 1, ['src/a.js']), { ...task('B', 'P0', 1, ['src/b.js']), reads: ['src/a.js'] }, task('C', 'P1', 1, ['c'])]))
  assert.deepEqual(rw.errors, [])
  assert.match(rw.warnings.join('\n'), /B reads src\/a\.js which A writes/)
})

test('checkProposals validates shape and duplicate ids but needs no phase or wave', () => {
  const good = { id: 'R1-01', title: 't', size: 'M', writes: ['a'], deps: [], acceptance: 'x' }
  assert.deepEqual(checkProposals([good]), [])
  assert.equal(checkProposals([good, good]).length, 1)
  assert.ok(checkProposals([{ id: 'R1-02' }]).length >= 4)
})

test('renderPlan emits one table per wave', () => {
  const md = renderPlan(plan([task('A', 'P0', 1, ['a']), task('B', 'P0', 1, ['b']), task('C', 'P1', 1, ['c'], ['A'])]))
  assert.match(md, /### P0 · Wave 1 — 2 in parallel/)
  assert.match(md, /### P1 · Wave 1 — 1 in parallel/)
  assert.match(md, /flowchart LR/)
})
