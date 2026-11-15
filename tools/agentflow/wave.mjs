#!/usr/bin/env node
// Wave runner ("waveflow"): turns docs/plan/plan.json into batches of parallel agents, each in its own
// git worktree, merged one at a time behind a test-and-build gate.
//   node tools/agentflow/wave.mjs next            runnable tasks of the earliest wave with work (+ pull-forward)
//   node tools/agentflow/wave.mjs prep ID...      worktree + branch per task, from the current HEAD
//   node tools/agentflow/wave.mjs brief ID        complete agent brief for one task
//   node tools/agentflow/wave.mjs check ID...     commit, clean worktree and write-set compliance
//   node tools/agentflow/wave.mjs merge ID...     merge --no-ff one at a time; test + build after each; reset on red
//   node tools/agentflow/wave.mjs clean ID...     remove worktrees and base files (branches stay)
//   node tools/agentflow/wave.mjs status          counts per phase and status
// Env: AGENTFLOW_REPO (default: this repo), AGENTFLOW_PLAN (docs/plan/plan.json), AGENTFLOW_WT (<repo>/../wt),
//      AGENTFLOW_TEST_CMD (npm test), AGENTFLOW_BUILD_CMD (npm run build), AGENTFLOW_TRAILERS (commit trailer lines).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deriveStatuses, readRepo } from './lib/build.mjs'
import { selectBatch, allowedBy, branchOf, trailers } from './lib/wavelib.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(process.env.AGENTFLOW_REPO || path.join(HERE, '..', '..'))
const PLAN = path.resolve(ROOT, process.env.AGENTFLOW_PLAN || 'docs/plan/plan.json')
const WT = path.resolve(process.env.AGENTFLOW_WT || path.join(ROOT, '..', 'wt'))
const TEST_CMD = process.env.AGENTFLOW_TEST_CMD || 'npm test'
const BUILD_CMD = process.env.AGENTFLOW_BUILD_CMD || 'npm run build'
const LINT = path.join(HERE, '..', '..', 'scripts', 'plan', 'plan-lint.mjs')
const TRAILERS = trailers()

const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'))
const T = Object.fromEntries(plan.tasks.map(t => [t.id, t]))
let overrides = {}
try { overrides = JSON.parse(fs.readFileSync(path.join(ROOT, '.agentflow', 'overrides.json'), 'utf8')) } catch { /* ignored: no overrides */ }
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()
const run = (cmd, args, cwd = ROOT) => spawnSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1e8 })
const sh = (cmd, cwd = ROOT) => spawnSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 1e8, shell: true })
const tail = (s, n = 25) => String(s).trim().split('\n').slice(-n).join('\n')
const need = id => { if (!T[id]) { console.error('unknown task ' + id); process.exit(2) } return T[id] }

async function statuses() { return deriveStatuses(plan.tasks.map(t => ({ ...t, o: t.owner || '' })), await readRepo(ROOT), overrides) }

async function next() { console.log(JSON.stringify(selectBatch(plan.tasks, await statuses()), null, 1)) }

function prep(ids) {
  fs.mkdirSync(WT, { recursive: true })
  const base = git('rev-parse', 'HEAD')   // the integration branch's current HEAD, never the default branch
  for (const id of ids) {
    const t = need(id), dir = path.join(WT, id)
    if (fs.existsSync(dir)) { console.log(`${id}: worktree exists`); continue }
    git('worktree', 'add', '-q', '-b', branchOf(t), dir, 'HEAD')
    const nm = path.join(ROOT, 'node_modules')
    if (fs.existsSync(nm)) fs.symlinkSync(nm, path.join(dir, 'node_modules'))
    fs.writeFileSync(`${dir}.base`, base)
    console.log(`${id}: ${dir}  branch ${branchOf(t)}  base ${base.slice(0, 7)}`)
  }
}

function brief(id) {
  const t = need(id), dir = path.join(WT, id)
  const docs = [...(plan.meta?.docs || []), ...(t.docs || [])]
  console.log(`# Brief: ${t.id} · ${t.title}

You are one agent in a parallel build wave (${t.phase}, wave ${t.wave}). Work ONLY in this git worktree (already created, on branch ${branchOf(t)}):
  ${dir}
Run \`cd ${dir}\` first and keep every command inside it. Never touch ${ROOT}.

## Task
${JSON.stringify(t)}
${t.title}

## You may write ONLY these paths (create or modify; globs allowed)
${(t.writes || []).map(w => '- ' + w).join('\n') || '- (nothing)'}

## You may read
${(t.reads || []).map(r => '- ' + r).join('\n') || '- anything in the repo'}
${docs.length ? 'Docs to read first: ' + docs.map(d => '`' + d + '`').join(', ') : 'Docs to read first: the files above, plus any README the task points at.'}

## Acceptance (must pass; add or update the tests it names)
${t.acceptance}

## Notes from the plan
${t.notes || '(none)'}

## Rules
- Work only inside your worktree.
- Touch NOTHING outside the write list. If another file is needed, STOP and report exactly which file and why.
- Do not invent facts you cannot verify. No network, no secrets, no live databases.
- node_modules is symlinked; do not run npm install/ci or change package.json unless it is in your write list.
- Before committing run: ${TEST_CMD} and ${BUILD_CMD} (both must be green) plus the acceptance command.
- Stage only the write-list paths by explicit path (never \`git add -A\`). Commit ONCE on your branch. Do not push. Do not open a PR.
- Commit message: "<type>(<scope>): <summary> (${t.id})" followed by a blank line and these trailer lines exactly:
${TRAILERS}

## Final report (max 10 lines)
branch, commit sha, files changed, test counts, acceptance output, deviations or risks.`)
}

async function check(ids) {
  let bad = 0
  for (const id of ids) {
    const t = need(id), dir = path.join(WT, id)
    let base
    try { base = fs.readFileSync(`${dir}.base`, 'utf8').trim() } catch { console.log(`BAD ${id}: no worktree/base file (run prep first)`); bad++; continue }
    const files = git('diff', '--name-only', base, branchOf(t)).split('\n').filter(Boolean)
    const outside = files.filter(f => !allowedBy(t.writes, f))
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).split('\n').filter(l => l && !/ node_modules\/?$/.test(l)).join('\n')
    const commits = +git('rev-list', '--count', `${base}..${branchOf(t)}`)
    const ok = commits > 0 && !outside.length && !dirty
    if (!ok) bad++
    console.log(`${ok ? 'OK ' : 'BAD'} ${id}: commits ${commits}, files ${files.length}${commits ? '' : ', NO COMMIT'}${outside.length ? ', OUTSIDE: ' + outside.join(' ') : ''}${dirty ? ', DIRTY worktree' : ''}`)
  }
  process.exitCode = bad ? 1 : 0
}

function gate() {
  const t = sh(TEST_CMD)
  const m = /# pass (\d+)[\s\S]*?# fail (\d+)/.exec(t.stdout || '')
  const b = t.status === 0 ? sh(BUILD_CMD) : { status: -1, stdout: '', stderr: '' }
  return { ok: t.status === 0 && b.status === 0, tests: m ? `${m[1]} pass ${m[2]} fail` : 'no summary', tail: t.status !== 0 ? tail(t.stdout + t.stderr) : b.status !== 0 ? tail(b.stdout + b.stderr) : '' }
}

function merge(ids) {
  const failed = []
  for (const id of ids) {
    const t = need(id), pre = git('rev-parse', 'HEAD')
    const r = run('git', ['merge', '--no-ff', '-q', '-m', `Merge ${branchOf(t)} into integration branch (${t.phase} wave ${t.wave})\n\n${TRAILERS}`, branchOf(t)])
    if (r.status !== 0) { run('git', ['merge', '--abort']); run('git', ['reset', '--hard', pre]); console.log(`FAIL ${id}: merge conflict or error, reset to ${pre.slice(0, 7)}\n${tail(r.stdout + r.stderr, 8)}`); failed.push(id); continue }
    const g = gate()
    if (!g.ok) { run('git', ['reset', '--hard', pre]); console.log(`FAIL ${id}: gate red, merge reverted to ${pre.slice(0, 7)}\n${g.tail}`); failed.push(id); continue }
    console.log(`MERGED ${id}: tests ${g.tests}, build green`)
  }
  if (fs.existsSync(LINT)) { const lint = run('node', [LINT, PLAN]); console.log('plan-lint:', tail(lint.stdout, 1)) }
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
