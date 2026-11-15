import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deriveStatuses } from '../tools/live/lib/build.mjs'
import { splitPlanArg, planFile, trailers, DEFAULT_PLAN } from '../tools/live/lib/plan.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WAVE = path.join(ROOT, 'tools/live/wave.mjs')
const wave = (args, env = {}) => {
  const e = { ...process.env, ...env }
  if (!('FORGE_PLAN' in env)) delete e.FORGE_PLAN
  return spawnSync('node', [WAVE, ...args], { cwd: ROOT, encoding: 'utf8', env: e })
}

test('plan path: --plan flag, FORGE_PLAN env, then default', () => {
  assert.deepEqual(splitPlanArg(['brief', 'X-1', '--plan', 'a.json']), { plan: 'a.json', args: ['brief', 'X-1'] })
  assert.deepEqual(splitPlanArg(['--plan=b.json', 'next']), { plan: 'b.json', args: ['next'] })
  assert.equal(planFile('/r', undefined, {}).rel, DEFAULT_PLAN)
  assert.equal(planFile('/r', undefined, { FORGE_PLAN: 'e.json' }).rel, 'e.json')
  assert.equal(planFile('/r', 'f.json', { FORGE_PLAN: 'e.json' }).abs, path.resolve('/r', 'f.json'))
})

test('trailers come from FORGE_TRAILERS, with a generic default', () => {
  assert.equal(trailers({ FORGE_TRAILERS: 'A: 1\\nB: 2' }), 'A: 1\nB: 2')
  assert.ok(!/session_/.test(trailers({})))
})

test('branch names with any phase letter derive statuses', () => {
  const repo = { branches: [{ name: 'wave/E0-W1/E0-01', sha: 'abc', own: 1, inHead: false, worktree: true }], mergeSubjects: ['Merge wave/E0-W1/E0-02 into dev'] }
  const st = deriveStatuses([{ id: 'E0-01' }, { id: 'E0-02' }, { id: 'E0-03' }], repo)
  assert.equal(st['E0-01'].s, 'committed')
  assert.equal(st['E0-02'].s, 'merged')
  assert.equal(st['E0-03'].s, 'queued')
})

test('status reads the Ember plan via FORGE_PLAN', () => {
  const r = wave(['status'], { FORGE_PLAN: 'docs/plan/ember/plan.json' })
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout)
  assert.deepEqual(Object.keys(out).sort(), ['E0', 'E1', 'E2', 'E3', 'E4', 'E5'])
})

test('status with FORGE_PLAN unset reads docs/plan/plan.json', () => {
  const r = wave(['status'])
  assert.equal(r.status, 0, r.stderr)
  assert.ok('P0' in JSON.parse(r.stdout))
})

test('--plan flag selects the plan file', () => {
  const r = wave(['status', '--plan', 'docs/plan/ember/plan.json'])
  assert.equal(r.status, 0, r.stderr)
  assert.ok('E0' in JSON.parse(r.stdout))
})

test('brief uses plan.meta.brief and FORGE_TRAILERS', () => {
  const r = wave(['brief', 'E0-01'], { FORGE_PLAN: 'docs/plan/ember/plan.json', FORGE_TRAILERS: 'Co-Authored-By: T <t@example.com>' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /docs\/plan\/ember\/DESIGN\.md/)
  assert.match(r.stdout, /Use tokens, never colour literals/)
  assert.match(r.stdout, /Co-Authored-By: T <t@example\.com>/)
  assert.doesNotMatch(r.stdout, /D1-D17/)
})

test('works on a temp plan file and keeps no hard-coded session id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-'))
  const f = path.join(dir, 'p.json')
  fs.writeFileSync(f, JSON.stringify({ meta: {}, phases: [{ id: 'Z1' }], tasks: [{ id: 'Z1-01', phase: 'Z1', wave: 1, title: 't', size: 'S', writes: ['a'], reads: [], deps: [], acceptance: 'x' }] }))
  const r = wave(['status', '--plan', f])
  assert.equal(r.status, 0, r.stderr)
  assert.deepEqual(JSON.parse(r.stdout), { Z1: { queued: 1 } })
  assert.ok(!/session_01T1mhHa/.test(fs.readFileSync(WAVE, 'utf8')))
})
