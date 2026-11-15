import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PHASES, PULL_FORWARD, validateMap, phaseRows, renderTrack } from '../scripts/plan/learning-track.mjs'

const concepts = JSON.parse(readFileSync(new URL('../docs/learning/concept-phase-map.json', import.meta.url), 'utf8'))
const byId = new Map(concepts.map((c) => [c.id, c]))
const idx = (p) => PHASES.indexOf(p)

test('55 unique ids', () => {
  assert.equal(concepts.length, 55)
  assert.equal(byId.size, 55)
})

test('every requires resolves', () => {
  for (const c of concepts) for (const r of c.requires) assert.ok(byId.has(r), `${c.id} requires unknown ${r}`)
})

test('no cycle', () => {
  const state = new Map()
  const visit = (id) => {
    assert.notEqual(state.get(id), 1, `cycle through ${id}`)
    if (state.get(id) === 2) return
    state.set(id, 1)
    byId.get(id).requires.forEach(visit)
    state.set(id, 2)
  }
  concepts.forEach((c) => visit(c.id))
})

test('no prerequisite in a later phase', () => {
  for (const c of concepts) {
    assert.ok(idx(c.phase) >= 0, `${c.id} has unknown phase ${c.phase}`)
    for (const r of c.requires) assert.ok(idx(byId.get(r).phase) <= idx(c.phase), `${c.id} (${c.phase}) requires ${r} (${byId.get(r).phase})`)
  }
})

test('validateMap accepts the map and reports each defect class', () => {
  assert.deepEqual(validateMap(concepts), [])
  const c = (id, phase, requires = []) => ({ id, label: id, category: 'x', phase, level: 1, requires })
  assert.match(validateMap([c('a', 'P0'), c('a', 'P0')]).join(), /duplicate id: a/)
  assert.match(validateMap([c('a', 'P0', ['zz'])]).join(), /unknown concept zz/)
  assert.match(validateMap([c('a', 'P0', ['b']), c('b', 'P1')]).join(), /later phase P1/)
  assert.match(validateMap([c('a', 'P0', ['b']), c('b', 'P0', ['a'])]).join(), /cycle/)
})

test('pull-forward ids exist and phase rows cover every concept', () => {
  for (const ids of Object.values(PULL_FORWARD)) for (const id of ids) assert.ok(byId.has(id), id)
  const rows = phaseRows(concepts)
  assert.equal(rows.length, PHASES.length)
  assert.equal(rows.reduce((n, r) => n + r.concepts.length, 0), 55)
})

test('rendered track lists all 55 concepts and the prerequisite table', () => {
  const md = renderTrack(concepts)
  assert.match(md, /55 concepts across 6 phases/)
  assert.match(md, /\| Phase \(n concepts\) \|/)
  for (const c of concepts) assert.ok(md.includes(`| \`${c.id}\` |`), c.id)
  assert.equal(readFileSync(new URL('../docs/learning/learning-track.md', import.meta.url), 'utf8'), md + '\n', 'run node scripts/plan/learning-track.mjs')
})
