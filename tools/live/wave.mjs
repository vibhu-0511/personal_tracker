#!/usr/bin/env node
// Wave runner helpers for the Forge plan. Scheduling, worktrees, briefs, gates.
//   node tools/live/wave.mjs next            runnable tasks of the earliest wave with work
//   node tools/live/wave.mjs prep ID...      worktree + branch per task, from current HEAD
//   node tools/live/wave.mjs brief ID        agent brief for one task
//   node tools/live/wave.mjs check ID...     write-set compliance and commit check
//   node tools/live/wave.mjs merge ID...     merge one at a time; npm test + build after each
//   node tools/live/wave.mjs clean ID...     remove worktrees (branches stay)
//   node tools/live/wave.mjs status          counts per phase
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deriveStatuses, readRepo } from './lib/build.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WT = process.env.FORGE_WT || '/home/user/wt'
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/plan/plan.json'), 'utf8'))
const T = Object.fromEntries(plan.tasks.map(t => [t.id, t]))
let overrides = {}
try { overrides = JSON.parse(fs.readFileSync(path.join(ROOT, '.live/overrides.json'), 'utf8')) } catch {}
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
const run = (cmd, args, cwd = ROOT) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1e8 })
const phaseNo = id => +id.slice(1)
const order = (a, b) => phaseNo(a.phase) - phaseNo(b.phase) || a.wave - b.wave
const branchOf = t => `wave/${t.phase}-W${t.wave}/${t.id}`
const tail = (s, n = 25) => String(s).trim().split('\n').slice(-n).join('\n')

async function statuses() { return deriveStatuses(plan.tasks.map(t => ({ ...t, o: t.owner || '' })), await readRepo(ROOT), overrides) }

async function next() {
  const st = await statuses()
  const s = id => st[id].s
  const pending = plan.tasks.filter(t => s(t.id) === 'queued').sort(order)
  const blockedBy = t => t.deps.filter(d => s(d) !== 'merged')
  const runnable = pending.filter(t => !blockedBy(t).length)
  if (!runnable.length) {
    console.log(JSON.stringify({ done: !pending.length, blocked: pending.map(t => ({ id: t.id, wave: `${t.phase}-W${t.wave}`, waiting: blockedBy(t).map(d => `${d}:${s(d)}`) })) }, null, 1))
    return
  }
  const first = runnable[0]
  const key = t => `${t.phase}-W${t.wave}`
  const picked = [], writes = new Set()
  const overlaps = t => t.writes.some(w => writes.has(w)) || t.reads.some(r => writes.has(r))
  const wavePool = runnable.filter(t => key(t) === key(first))
  const carry = runnable.filter(t => order(t, first) < 0)   // unblocked leftovers from earlier waves (none by construction, kept for safety)
  for (const t of [...carry, ...wavePool]) {
    if (picked.length >= 6) break
    if (overlaps(t)) continue
    picked.push(t); t.writes.forEach(w => writes.add(w))
  }
  const sameWave = pending.filter(t => key(t) === key(first))
  console.log(JSON.stringify({
    wave: key(first),
    run: picked.map(t => ({ id: t.id, title: t.title, size: t.size, writes: t.writes.length })),
    deferredInWave: wavePool.filter(t => !picked.includes(t)).map(t => t.id),
    blockedInWave: sameWave.filter(t => blockedBy(t).length).map(t => ({ id: t.id, waiting: blockedBy(t).map(d => `${d}:${s(d)}`) })),
    userInWave: plan.tasks.filter(t => key(t) === key(first) && t.owner === 'user').map(t => t.id),
  }, null, 1))
}

function prep(ids) {
  fs.mkdirSync(WT, { recursive: true })
  const base = git('rev-parse', 'HEAD')
  for (const id of ids) {
    const t = T[id]; const dir = path.join(WT, id)
    if (fs.existsSync(dir)) { console.log(`${id}: worktree exists`); continue }
    git('worktree', 'add', '-q', '-b', branchOf(t), dir, 'HEAD')
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'))
    fs.writeFileSync(`${dir}.base`, base)
    console.log(`${id}: ${dir}  branch ${branchOf(t)}  base ${base.slice(0, 7)}`)
  }
}

function brief(id) {
  const t = T[id]; if (!t) throw new Error('unknown task ' + id)
  const dir = path.join(WT, id)
  const reports = [`docs/plan/research/${t.source}-report.md`]
  if (t.source === 'B3') reports.push('docs/plan/research/B3-spec.md')
  console.log(`# Brief: ${t.id} · ${t.title}

You are one agent in a parallel build wave of the Forge plan (${t.phase}, wave ${t.wave}). Work ONLY in this git worktree (already created, on branch ${branchOf(t)}):
  ${dir}
Run \`cd ${dir}\` first and keep every command inside it. Never touch /home/user/personal_tracker.

## Task
${JSON.stringify({ id: t.id, size: t.size, urgent: !!t.urgent, deps: t.deps, absorbs: t.absorbs }, null, 0)}
${t.title}

## You may write ONLY these paths (create or modify)
${t.writes.map(w => '- ' + w).join('\n')}

## You may read
${(t.reads || []).map(r => '- ' + r).join('\n') || '- anything in the repo'}
Context: ${reports.map(r => '`' + r + '`').join(', ')} (read the sections relevant to this task), docs/plan/WORKFLOW.md, and docs/plan/blueprint-errata.md for canonical numbers.

## Acceptance (must pass; add or update the tests it names)
${t.acceptance}

## Notes from the plan
${t.notes || '(none)'}

## Rules
- Touch NOTHING outside the write list. If the task cannot be done without another file, STOP and report exactly which file and why.
- Defaults assumed for open decisions D1-D17 (docs/plan/OPEN-DECISIONS.md): hash router, inspector from 1024px, Level never decreases, Habits as dense rows, Money merged to 4 views (overview/budget/goals/loans), cream theme synced in settings.
- Do not invent facts you cannot verify (versions, API behaviour, credentials). Do not call external services, do not use secrets, do not run anything against a live database.
- node_modules is symlinked; do not run npm install/ci or change package.json unless it is in your write list.
- Before committing run: npm test && npm run build (both must be green) plus the acceptance command.
- Stage only your write-list paths by explicit path (never git add -A). Commit once on your branch. Do not push. Do not open a PR.
- Commit message: "<type>(<scope>): <summary> (${t.id})" followed by a blank line and these two trailer lines exactly:
Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T1mhHa2P7qHUqNNWGzmkKo

## Final report (max 10 lines)
branch, commit sha, files changed, test counts, acceptance output, deviations or risks.`)
}

async function check(ids) {
  let bad = 0
  for (const id of ids) {
    const t = T[id], dir = path.join(WT, id)
    const base = fs.readFileSync(`${dir}.base`, 'utf8').trim()
    const files = git('diff', '--name-only', base, branchOf(t)).split('\n').filter(Boolean)
    const outside = files.filter(f => !t.writes.includes(f))
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: dir, encoding: 'utf8' }).trim()
    const commits = +git('rev-list', '--count', `${base}..${branchOf(t)}`)
    const ok = commits > 0 && !outside.length && !dirty
    if (!ok) bad++
    console.log(`${ok ? 'OK ' : 'BAD'} ${id}: commits ${commits}, files ${files.length}${outside.length ? ', OUTSIDE: ' + outside.join(' ') : ''}${dirty ? ', DIRTY worktree' : ''}`)
  }
  process.exitCode = bad ? 1 : 0
}

function gate() {
  const t = run('npm', ['test'])
  const m = /# pass (\d+)[\s\S]*?# fail (\d+)/.exec(t.stdout || '')
  const b = run('npm', ['run', 'build'])
  return { ok: t.status === 0 && b.status === 0, tests: m ? `${m[1]} pass ${m[2]} fail` : 'no summary', build: b.status === 0, tail: t.status !== 0 ? tail(t.stdout + t.stderr) : b.status !== 0 ? tail(b.stdout + b.stderr) : '' }
}

function merge(ids) {
  const failed = []
  for (const id of ids) {
    const t = T[id], pre = git('rev-parse', 'HEAD')
    const r = run('git', ['merge', '--no-ff', '-q', '-m', `Merge ${branchOf(t)} into dev branch (${t.phase} wave ${t.wave})\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01T1mhHa2P7qHUqNNWGzmkKo`, branchOf(t)])
    if (r.status !== 0) { run('git', ['merge', '--abort']); console.log(`FAIL ${id}: merge conflict\n${tail(r.stdout + r.stderr, 8)}`); failed.push(id); continue }
    const g = gate()
    if (!g.ok) { run('git', ['reset', '--hard', pre]); console.log(`FAIL ${id}: gate red, merge reverted\n${g.tail}`); failed.push(id); continue }
    console.log(`MERGED ${id}: tests ${g.tests}, build green`)
  }
  const lint = run('node', ['scripts/plan/plan-lint.mjs', 'docs/plan/plan.json'])
  console.log('plan-lint:', tail(lint.stdout, 1))
  process.exitCode = failed.length ? 1 : 0
}

function clean(ids) {
  for (const id of ids) {
    const dir = path.join(WT, id)
    run('git', ['worktree', 'remove', '--force', dir]); fs.rmSync(`${dir}.base`, { force: true })
  }
  run('git', ['worktree', 'prune'])
}

async function status() {
  const st = await statuses(); const out = {}
  for (const t of plan.tasks) { const p = out[t.phase] ||= {}; p[st[t.id].s] = (p[st[t.id].s] || 0) + 1 }
  console.log(JSON.stringify(out))
}

const [cmd, ...args] = process.argv.slice(2)
const table = { next, prep: () => prep(args), brief: () => brief(args[0]), check: () => check(args), merge: () => merge(args), clean: () => clean(args), status }
if (!table[cmd]) { console.error('usage: wave.mjs next|prep|brief|check|merge|clean|status'); process.exit(2) }
await table[cmd]()
