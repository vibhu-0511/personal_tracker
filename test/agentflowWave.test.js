import test from 'node:test'
import assert from 'node:assert/strict'
import { globToRegExp, matchesGlob, allowedBy, patternsOverlap, selectBatch, trailers, branchOf } from '../tools/agentflow/lib/wavelib.mjs'

test('glob: * stays inside a directory, ** crosses directories', () => {
  assert.ok(matchesGlob('src/*.js', 'src/a.js'))
  assert.ok(!matchesGlob('src/*.js', 'src/sub/a.js'))
  assert.ok(matchesGlob('e2e/matrix/**', 'e2e/matrix/a/b/c.spec.js'))
  assert.ok(!matchesGlob('e2e/matrix/**', 'e2e/other/a.js'))
  assert.ok(matchesGlob('src/**/x.js', 'src/x.js'))
  assert.ok(matchesGlob('src/**/x.js', 'src/a/b/x.js'))
  assert.ok(matchesGlob('src/router.js', 'src/router.js'))
  assert.ok(!matchesGlob('src/router.js', 'src/routerXjs'))
  assert.ok(matchesGlob('docs/', 'docs/a/b.md'))
  assert.ok(globToRegExp('a.b').test('a.b') && !globToRegExp('a.b').test('aXb'))
  assert.ok(allowedBy(['a.js', 'lib/**'], 'lib/z/y.js'))
  assert.ok(!allowedBy([], 'a.js'))
})

test('patternsOverlap handles files, single and double stars', () => {
  assert.ok(patternsOverlap('a.js', 'a.js'))
  assert.ok(!patternsOverlap('a.js', 'b.js'))
  assert.ok(patternsOverlap('src/**', 'src/a/b.js'))
  assert.ok(!patternsOverlap('src/*.js', 'src/sub/a.js'))
  assert.ok(patternsOverlap('src/**', 'src/sub/**'))
  assert.ok(!patternsOverlap('src/**', 'test/**'))
  assert.ok(patternsOverlap('*.js', 'a.js'))
})

const T = (id, phase, wave, writes, extra = {}) => ({ id, phase, wave, title: id, size: 'S', writes, reads: [], deps: [], ...extra })
const st = o => Object.fromEntries(Object.entries(o).map(([k, s]) => [k, { s }]))

test('selectBatch: earliest wave, at most 6, skips write conflicts, user tasks and blocked tasks', () => {
  const tasks = [T('A', 'P0', 1, ['a/**']), T('B', 'P0', 1, ['a/x.js']), T('C', 'P0', 1, ['c.js']), T('U', 'P0', 1, ['u.js'], { owner: 'user' }), T('D', 'P0', 2, ['d.js'], { deps: ['A'] })]
  const r = selectBatch(tasks, st({ A: 'queued', B: 'queued', C: 'queued', U: 'yours', D: 'queued' }))
  assert.equal(r.wave, 'P0-W1')
  assert.deepEqual(r.run.map(x => x.id), ['A', 'C'])
  assert.deepEqual(r.deferredInWave, ['B'])
  assert.deepEqual(r.userInWave, ['U'])
  assert.deepEqual(r.blockedInWave, [])
})

test('selectBatch: pulls forward later runnable tasks that do not overlap, but not ones that read picked writes', () => {
  const tasks = [
    T('A', 'P0', 1, ['a.js']), T('B', 'P0', 1, ['b.js'], { deps: ['X'] }),
    T('L1', 'P0', 2, ['l1.js']), T('L2', 'P0', 2, ['l2.js'], { reads: ['a.js'] }), T('L3', 'P0', 3, ['a.js']), T('L4', 'P0', 3, ['l4.js'], { deps: ['A'] }),
    T('X', 'P0', 1, ['x.js'], { owner: 'user' }),
  ]
  const r = selectBatch(tasks, st({ A: 'queued', B: 'queued', L1: 'queued', L2: 'queued', L3: 'queued', L4: 'queued', X: 'yours' }))
  assert.deepEqual(r.run.map(x => x.id), ['A', 'L1'])
  assert.deepEqual(r.pulledForward, ['L1'])
  assert.deepEqual(r.blockedInWave, [{ id: 'B', waiting: ['X:yours'] }])
})

test('selectBatch: caps at 6 and puts urgent first; reports done and blocked-only states', () => {
  const many = Array.from({ length: 9 }, (_, i) => T('T' + i, 'P0', 1, [`f${i}.js`], i === 8 ? { urgent: true } : {}))
  const r = selectBatch(many, st({}))
  assert.equal(r.run.length, 6)
  assert.equal(r.run[0].id, 'T8')
  assert.equal(selectBatch([T('A', 'P0', 1, ['a'])], st({ A: 'merged' })).done, true)
  const b = selectBatch([T('A', 'P0', 1, ['a'], { deps: ['Z'] })], st({ A: 'queued', Z: 'failed' }))
  assert.equal(b.done, false); assert.deepEqual(b.blocked[0].waiting, ['Z:failed'])
})

test('trailers come from AGENTFLOW_TRAILERS or a plain Co-Authored-By line; branch naming', () => {
  assert.match(trailers({}), /^Co-Authored-By: .+<.+>$/)
  assert.equal(trailers({ AGENTFLOW_TRAILERS: 'A: 1\\nB: 2' }), 'A: 1\nB: 2')
  assert.equal(branchOf(T('R1-04', 'P0', 3, [])), 'wave/P0-W3/R1-04')
})
