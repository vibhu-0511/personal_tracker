import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { deriveStatuses, readRepo } from '../tools/agentflow/lib/build.mjs'

test('deriveStatuses: merged by ancestry, committed, running, yours, override, merged by subject', () => {
  const plan = [{ id: 'A-01' }, { id: 'A-02' }, { id: 'A-03' }, { id: 'A-04' }, { id: 'U-1', o: 'user' }, { id: 'A-05' }, { id: 'A-06' }]
  const repo = {
    branches: [
      { name: 'wave/P0-W1/A-01', sha: 'a', own: 1, inHead: true },
      { name: 'wave/P0-W1/A-02', sha: 'b', own: 2, inHead: false },
      { name: 'wave/P0-W1/A-03', sha: 'c', own: 0, inHead: true },   // zero own commits is running, not merged
    ],
    mergeSubjects: ['Merge wave/P0-W1/A-04 into integration branch (P0 wave 1)'],
  }
  const s = deriveStatuses(plan, repo, { 'A-05': { s: 'failed', note: 'red base' } })
  assert.equal(s['A-01'].s, 'merged')
  assert.equal(s['A-02'].s, 'committed')
  assert.equal(s['A-03'].s, 'running')
  assert.equal(s['A-04'].s, 'merged')
  assert.equal(s['U-1'].s, 'yours')
  assert.equal(s['A-05'].s, 'failed')
  assert.equal(s['A-05'].note, 'red base')
  assert.equal(s['A-06'].s, 'queued')
})

test('deriveStatuses: an override can mark blocked and "auto" absence restores git state', () => {
  const s = deriveStatuses([{ id: 'X' }], { branches: [{ name: 'wave/P1-W2/X', sha: 'z', own: 1, inHead: false }] }, { X: { s: 'blocked' } })
  assert.equal(s.X.s, 'blocked')
  assert.equal(deriveStatuses([{ id: 'X' }], { branches: [{ name: 'wave/P1-W2/X', sha: 'z', own: 1, inHead: false }] }).X.s, 'committed')
})

test('readRepo measures own commits since the merge-base with HEAD, not against the default branch', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-repo-'))
  const g = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim()
  try {
    g('init', '-q', '-b', 'main'); fs.writeFileSync(path.join(d, 'a'), '1'); g('add', '.'); g('commit', '-qm', 'base')
    g('checkout', '-q', '-b', 'integ'); fs.writeFileSync(path.join(d, 'b'), '2'); g('add', '.'); g('commit', '-qm', 'on integ')
    g('branch', 'wave/P0-W1/T-1')                       // fresh: forked from integ HEAD, 1 commit ahead of main
    g('checkout', '-q', 'wave/P0-W1/T-1'); fs.writeFileSync(path.join(d, 'c'), '3'); g('add', '.'); g('commit', '-qm', 'task')
    g('checkout', '-q', 'integ'); g('branch', 'wave/P0-W1/T-0')
    let r = await readRepo(d)
    const by = n => r.branches.find(b => b.name === n)
    assert.equal(by('wave/P0-W1/T-0').own, 0)           // not counted as 1 even though main is behind
    assert.equal(by('wave/P0-W1/T-1').own, 1)
    assert.equal(by('wave/P0-W1/T-1').inHead, false)
    g('merge', '--no-ff', '-qm', 'Merge wave/P0-W1/T-1 into integ', 'wave/P0-W1/T-1')
    r = await readRepo(d)
    assert.ok(r.mergeSubjects[0].includes('wave/P0-W1/T-1'))
    assert.equal(r.head.branch, 'integ')
    const st = deriveStatuses([{ id: 'T-0' }, { id: 'T-1' }], r)
    assert.equal(st['T-1'].s, 'merged'); assert.equal(st['T-0'].s, 'running')
  } finally { fs.rmSync(d, { recursive: true, force: true }) }
})
