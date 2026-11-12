#!/usr/bin/env node
// Validates and renders the phased build plan (docs/plan/plan.json).
//
// A plan is phases -> waves -> tasks. Every task in a wave runs in parallel, so the
// lint enforces the two properties that make that safe:
//   1. no two tasks in the same wave write overlapping files (merge-conflict free), and
//   2. every dependency finishes in a strictly earlier wave.
// Pure functions are exported for tests; the CLI at the bottom does the file I/O.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SIZES = ['S', 'M', 'L']

const strip = (p) => p.replace(/^\.\//, '').replace(/\/+$/, '')

// A write pattern is either an exact file, or a directory scope ("dir/**", "dir/*.jsx", "dir/").
function toScope(raw) {
  const p = String(raw).replace(/^\.\//, '')
  const wild = p.search(/[*?[{]/)
  if (wild !== -1) return { dir: strip(p.slice(0, p.lastIndexOf('/', wild) + 1) || ''), exact: false }
  if (p.endsWith('/')) return { dir: strip(p), exact: false }
  return { dir: strip(p), exact: true }
}

export function patternsOverlap(a, b) {
  const A = toScope(a), B = toScope(b)
  if (A.exact && B.exact) return A.dir === B.dir
  const inside = (x, d) => d === '' || x === d || x.startsWith(d + '/')
  if (A.exact) return inside(A.dir, B.dir)
  if (B.exact) return inside(B.dir, A.dir)
  return inside(A.dir, B.dir) || inside(B.dir, A.dir)
}

const isArr = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length)

// Shape check shared by swarm proposals (no phase/wave yet) and final plan tasks.
export function checkTaskShape(t, { needPlacement }) {
  const errs = []
  const id = t && t.id ? t.id : '(no id)'
  if (!t || typeof t !== 'object') return [`${id}: not an object`]
  if (!t.id || typeof t.id !== 'string') errs.push(`${id}: missing id`)
  if (!t.title || typeof t.title !== 'string') errs.push(`${id}: missing title`)
  if (!SIZES.includes(t.size)) errs.push(`${id}: size must be one of ${SIZES.join('/')}`)
  if (!isArr(t.writes)) errs.push(`${id}: writes must be an array of path strings`)
  if (t.reads !== undefined && !isArr(t.reads)) errs.push(`${id}: reads must be an array of path strings`)
  if (!isArr(t.deps)) errs.push(`${id}: deps must be an array of task ids`)
  if (!t.acceptance || typeof t.acceptance !== 'string') errs.push(`${id}: acceptance must state a verifiable check`)
  if (needPlacement) {
    if (!t.phase) errs.push(`${id}: missing phase`)
    if (!Number.isInteger(t.wave) || t.wave < 1) errs.push(`${id}: wave must be an integer >= 1`)
  }
  return errs
}

export function checkProposals(tasks) {
  const errors = []
  const seen = new Set()
  for (const t of tasks) {
    errors.push(...checkTaskShape(t, { needPlacement: false }))
    if (t && t.id) {
      if (seen.has(t.id)) errors.push(`${t.id}: duplicate proposal id`)
      seen.add(t.id)
    }
  }
  return errors
}

export function lintPlan(plan, { maxWidth = 6 } = {}) {
  const errors = [], warnings = []
  const phases = Array.isArray(plan.phases) ? plan.phases : []
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : []
  if (!phases.length) errors.push('plan has no phases')
  const phaseIdx = new Map(phases.map((p, i) => [p.id, i]))
  if (phaseIdx.size !== phases.length) errors.push('duplicate or missing phase ids')

  const byId = new Map()
  for (const t of tasks) {
    errors.push(...checkTaskShape(t, { needPlacement: true }))
    if (!t || !t.id) continue
    if (byId.has(t.id)) errors.push(`${t.id}: duplicate task id`)
    byId.set(t.id, t)
    if (t.phase && !phaseIdx.has(t.phase)) errors.push(`${t.id}: unknown phase "${t.phase}"`)
    if (isArr(t.writes) && t.writes.length === 0) warnings.push(`${t.id}: writes nothing (verify-only task?)`)
  }

  const order = (t) => (phaseIdx.get(t.phase) ?? 0) * 1000 + t.wave
  const waveKey = (t) => `${t.phase}#${t.wave}`

  // contiguous waves per phase, and no empty phases
  for (const p of phases) {
    const waves = [...new Set(tasks.filter((t) => t.phase === p.id).map((t) => t.wave))].sort((a, b) => a - b)
    if (!waves.length) errors.push(`${p.id}: phase has no tasks`)
    waves.forEach((w, i) => { if (w !== i + 1) errors.push(`${p.id}: waves must be contiguous from 1 (found ${waves.join(',')})`) })
  }

  // dependencies must exist and land in a strictly earlier wave
  for (const t of tasks) {
    if (!isArr(t.deps)) continue
    for (const d of t.deps) {
      const dep = byId.get(d)
      if (!dep) { errors.push(`${t.id}: depends on unknown task ${d}`); continue }
      if (order(dep) >= order(t)) errors.push(`${t.id}: dependency ${d} is not in an earlier wave (${waveKey(dep)} vs ${waveKey(t)})`)
    }
  }

  // parallel safety inside a wave
  const waves = new Map()
  for (const t of tasks) { if (!waves.has(waveKey(t))) waves.set(waveKey(t), []); waves.get(waveKey(t)).push(t) }
  let maxSeen = 0
  for (const [key, ts] of waves) {
    maxSeen = Math.max(maxSeen, ts.length)
    if (ts.length > maxWidth) warnings.push(`${key}: ${ts.length} parallel tasks exceeds the width of ${maxWidth}`)
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        for (const a of ts[i].writes || []) for (const b of ts[j].writes || []) {
          if (patternsOverlap(a, b)) errors.push(`${key}: ${ts[i].id} and ${ts[j].id} both write ${a === b ? a : `${a} / ${b}`}`)
        }
        for (const r of ts[j].reads || []) for (const w of ts[i].writes || []) {
          if (patternsOverlap(r, w)) warnings.push(`${key}: ${ts[j].id} reads ${r} which ${ts[i].id} writes in the same wave`)
        }
      }
    }
  }

  return { errors, warnings, stats: { phases: phases.length, waves: waves.size, tasks: tasks.length, maxWidth: maxSeen } }
}

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ')

export function renderPlan(plan) {
  const out = []
  const phases = plan.phases || []
  const tasks = plan.tasks || []
  const { stats } = lintPlan(plan)
  out.push(`# ${plan.meta?.title || 'Build plan'}`, '', '> Generated from `docs/plan/plan.json` by `scripts/plan/plan-lint.mjs --render`. Edit the JSON, not this file.', '')
  if (plan.meta?.decision) out.push(`**Decision:** ${plan.meta.decision}`, '')
  out.push(`**${stats.phases} phases · ${stats.waves} waves · ${stats.tasks} tasks · widest wave ${stats.maxWidth} tasks in parallel**`, '')
  out.push('```mermaid', 'flowchart LR')
  phases.forEach((p, i) => out.push(`  ${p.id}["${p.id} · ${esc(p.name)}"]${i ? '' : ''}`))
  phases.slice(1).forEach((p, i) => out.push(`  ${phases[i].id} --> ${p.id}`))
  out.push('```', '')
  for (const p of phases) {
    const pt = tasks.filter((t) => t.phase === p.id)
    const nWaves = Math.max(0, ...pt.map((t) => t.wave))
    out.push(`## ${p.id} · ${p.name}`, '', p.goal || '', '')
    out.push(`${pt.length} tasks across ${nWaves} waves.`, '')
    if (p.learn?.length) out.push(`**Learn first (blueprint graph):** ${p.learn.join(' · ')}`, '')
    if (p.exit?.length) { out.push('**Exit criteria**'); p.exit.forEach((e) => out.push(`- ${e}`)); out.push('') }
    for (let w = 1; w <= nWaves; w++) {
      const wt = pt.filter((t) => t.wave === w)
      out.push(`### ${p.id} · Wave ${w} — ${wt.length} in parallel`, '')
      out.push('| Task | Title | Size | Writes | Depends on | Acceptance |', '|---|---|---|---|---|---|')
      for (const t of wt) out.push(`| \`${t.id}\` | ${esc(t.title)} | ${t.size} | ${esc((t.writes || []).map((x) => `\`${x}\``).join('<br>'))} | ${esc((t.deps || []).join(', ') || '—')} | ${esc(t.acceptance)} |`)
      out.push('')
    }
  }
  return out.join('\n')
}

function main(argv) {
  const args = argv.slice(2)
  const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1] }
  const propDir = flag('--proposals')
  if (propDir) {
    const files = readdirSync(propDir).filter((f) => f.endsWith('.tasks.json'))
    let bad = 0
    for (const f of files) {
      let tasks
      try { tasks = JSON.parse(readFileSync(`${propDir}/${f}`, 'utf8')) } catch (e) { console.error(`${f}: invalid JSON (${e.message})`); bad++; continue }
      const errs = checkProposals(Array.isArray(tasks) ? tasks : tasks.tasks || [])
      errs.forEach((e) => console.error(`${f}: ${e}`))
      bad += errs.length
      console.log(`${f}: ${(Array.isArray(tasks) ? tasks : tasks.tasks || []).length} proposals`)
    }
    process.exit(bad ? 1 : 0)
  }
  const file = args.find((a) => !a.startsWith('--') && a !== flag('--render') && a !== flag('--max-width')) || 'docs/plan/plan.json'
  if (!existsSync(file)) { console.error(`no such plan: ${file}`); process.exit(2) }
  const plan = JSON.parse(readFileSync(file, 'utf8'))
  const maxWidth = Number(flag('--max-width')) || 6
  const { errors, warnings, stats } = lintPlan(plan, { maxWidth })
  warnings.forEach((w) => console.warn(`warn  ${w}`))
  errors.forEach((e) => console.error(`error ${e}`))
  console.log(`${stats.phases} phases, ${stats.waves} waves, ${stats.tasks} tasks, widest wave ${stats.maxWidth}; ${errors.length} errors, ${warnings.length} warnings`)
  const out = flag('--render')
  if (out && !errors.length) { writeFileSync(out, renderPlan(plan) + '\n'); console.log(`rendered ${out}`) }
  process.exit(errors.length ? 1 : 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv)
