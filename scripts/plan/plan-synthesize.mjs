#!/usr/bin/env node
// Stage 2 of the workflow: swarm proposals + human decisions (docs/plan/synthesis.json) -> docs/plan/plan.json.
//
//   node scripts/plan/plan-synthesize.mjs            writes docs/plan/plan.json and prints stats
//
// Humans decide: which phase each proposal belongs to, which proposals merge into another, overrides,
// extra tasks, open decisions. The scheduler decides the waves: tasks run as early as their
// dependencies allow, never alongside a task whose write-set overlaps, never wider than maxWidth.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { patternsOverlap, lintPlan } from './plan-lint.mjs'

const SIZE_RANK = { L: 3, M: 2, S: 1 }

export function resolveDrops(drop, id) {
  const seen = new Set()
  let cur = id
  while (drop[cur]) {
    if (seen.has(cur)) throw new Error(`drop cycle at ${cur}`)
    seen.add(cur)
    cur = drop[cur].by
  }
  return cur
}

export function applySynthesis(proposals, syn) {
  const errors = []
  const warnings = []
  const byId = new Map(proposals.map((p) => [p.id, p]))
  const assign = syn.assign || {}, drop = syn.drop || {}, defer = syn.defer || {}, over = syn.override || {}
  for (const id of Object.keys(assign)) if (!byId.has(id)) errors.push(`assign: unknown proposal ${id}`)
  for (const id of [...Object.keys(drop), ...Object.keys(defer)]) if (!byId.has(id)) errors.push(`drop/defer: unknown proposal ${id}`)
  for (const id of Object.keys(over)) if (!assign[id] && !(syn.extra || []).some((e) => e.id === id)) errors.push(`override: ${id} is not an assigned task`)
  for (const p of proposals) {
    const n = (assign[p.id] ? 1 : 0) + (drop[p.id] ? 1 : 0) + (defer[p.id] ? 1 : 0)
    if (n === 0) errors.push(`${p.id}: not assigned, dropped or deferred`)
    if (n > 1) errors.push(`${p.id}: listed in more than one of assign/drop/defer`)
  }
  for (const [id, d] of Object.entries(drop)) {
    const to = resolveDrops(drop, id)
    if (defer[to] || !assign[to]) errors.push(`${id}: absorbed by ${d.by}, which resolves to ${to}, not an assigned task`)
  }

  const tasks = []
  for (const p of proposals) {
    if (!assign[p.id]) continue
    const o = over[p.id] || {}
    let writes = o.writes || p.writes
    if (o.writesAdd) writes = [...new Set([...writes, ...o.writesAdd])]
    let deps = o.deps || p.deps
    if (o.depsAdd) deps = [...deps, ...o.depsAdd]
    if (o.depsRemove) deps = deps.filter((d) => !o.depsRemove.includes(d))
    const absorbs = Object.entries(drop).filter(([id]) => resolveDrops(drop, id) === p.id).map(([id]) => id)
    const t = {
      id: p.id,
      phase: assign[p.id],
      title: o.title || p.title,
      size: o.size || p.size,
      writes,
      reads: o.reads || p.reads || [],
      deps,
      acceptance: o.acceptance || p.acceptance,
      source: p.id.split('-')[0],
    }
    if (/^USER:/i.test(t.title)) t.owner = 'user'
    if (o.urgent) t.urgent = true
    const note = [p.notes, o.note && `Plan: ${o.note}`].filter(Boolean).join(' ')
    if (note) t.notes = note
    if (absorbs.length) t.absorbs = absorbs
    tasks.push(t)
  }
  for (const e of syn.extra || []) tasks.push({ reads: [], deps: [], source: 'plan', ...e, ...(e.owner ? {} : /^USER:/i.test(e.title) ? { owner: 'user' } : {}) })

  // gates: one per phase, depending on everything else in the phase
  for (const ph of syn.phases) {
    const members = tasks.filter((t) => t.phase === ph.id).map((t) => t.id)
    tasks.push({
      id: `${ph.id}-GATE`, phase: ph.id, gate: true, source: 'plan', size: 'S',
      title: `${ph.id} gate: verify exit criteria and record the result`,
      writes: [`docs/plan/gates/${ph.id}.md`], reads: [],
      deps: members,
      acceptance: (ph.exit || []).join(' | ') || 'exit criteria met',
    })
  }

  // rewrite dependencies through merges, drop self-references and duplicates
  const ids = new Set(tasks.map((t) => t.id))
  for (const t of tasks) {
    const out = []
    for (const d of t.deps) {
      let r = d
      if (drop[d]) r = resolveDrops(drop, d)
      if (defer[d]) { warnings.push(`${t.id}: dependency ${d} is deferred, removed`); continue }
      if (r === t.id || out.includes(r)) continue
      if (!ids.has(r)) { errors.push(`${t.id}: dependency ${d} does not exist`); continue }
      out.push(r)
    }
    t.deps = out
  }
  return { tasks, errors, warnings }
}

// Greedy list scheduling per phase, phases strictly in order.
export function schedule(tasks, phases, { maxWidth = 6 } = {}) {
  const errors = []
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const phaseIdx = new Map(phases.map((p, i) => [p.id, i]))
  const done = new Set()
  for (const ph of phases) {
    const mine = tasks.filter((t) => t.phase === ph.id)
    const local = new Set(mine.map((t) => t.id))
    // downstream length inside the phase = critical-path priority
    const dependents = new Map(mine.map((t) => [t.id, []]))
    for (const t of mine) for (const d of t.deps) if (local.has(d)) dependents.get(d).push(t.id)
    const memo = new Map()
    const down = (id) => {
      if (memo.has(id)) return memo.get(id)
      memo.set(id, 0)
      const v = 1 + Math.max(0, ...dependents.get(id).map(down))
      memo.set(id, v)
      return v
    }
    mine.forEach((t) => down(t.id))
    for (const t of mine) for (const d of t.deps) {
      const dep = byId.get(d)
      if (dep && phaseIdx.get(dep.phase) > phaseIdx.get(ph.id)) errors.push(`${t.id} (${ph.id}) depends on ${d}, which is in later phase ${dep.phase}`)
    }
    let pending = mine.filter((t) => !t.gate)
    const gates = mine.filter((t) => t.gate)
    let wave = 0
    const run = (list) => {
      while (list.length) {
        wave++
        const ready = list.filter((t) => t.deps.every((d) => done.has(d)))
        if (!ready.length) {
          errors.push(`${ph.id}: cannot schedule ${list.map((t) => `${t.id}[${t.deps.filter((d) => !done.has(d)).join(',')}]`).join(' ')}`)
          return
        }
        ready.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || down(b.id) - down(a.id) || SIZE_RANK[b.size] - SIZE_RANK[a.size] || a.id.localeCompare(b.id, undefined, { numeric: true }))
        const chosen = []
        for (const t of ready) {
          if (chosen.length >= maxWidth) break
          // a task's inputs must be stable: no same-wave writer of anything it reads (or vice versa)
          const clash = (x, y) => x.writes.some((a) => y.writes.some((b) => patternsOverlap(a, b))) ||
            (x.reads || []).some((r) => y.writes.some((w) => patternsOverlap(r, w))) ||
            (y.reads || []).some((r) => x.writes.some((w) => patternsOverlap(r, w)))
          if (chosen.some((c) => clash(c, t))) continue
          chosen.push(t)
        }
        chosen.forEach((t) => { t.wave = wave })
        chosen.forEach((t) => done.add(t.id))
        list = list.filter((t) => !chosen.includes(t))
      }
    }
    run(pending)
    run(gates)
  }
  return errors
}

export function synthesize(proposals, syn, opts = {}) {
  const { tasks, errors, warnings } = applySynthesis(proposals, syn)
  if (errors.length) return { errors, warnings, plan: null }
  const sched = schedule(tasks, syn.phases, opts)
  if (sched.length) return { errors: sched, warnings, plan: null }
  const plan = {
    meta: {
      title: syn.title,
      decision: syn.decision,
      generated: 'node scripts/plan/plan-synthesize.mjs (proposals in docs/plan/research + docs/plan/synthesis.json)',
      openDecisions: syn.openDecisions || [],
      merged: Object.entries(syn.drop || {}).map(([id, d]) => ({ id, into: resolveDrops(syn.drop, id), why: d.why })),
      deferred: Object.entries(syn.defer || {}).map(([id, d]) => ({ id, why: d.why })),
    },
    phases: syn.phases,
    tasks: tasks.map(({ id, phase, wave, title, size, owner, urgent, writes, reads, deps, acceptance, source, absorbs, notes, gate }) => ({
      id, phase, wave, title, size, ...(owner ? { owner } : {}), ...(urgent ? { urgent } : {}), ...(gate ? { gate } : {}), writes, reads, deps, acceptance, source, ...(absorbs ? { absorbs } : {}), ...(notes ? { notes } : {}),
    })),
  }
  return { errors: [], warnings, plan }
}

function main() {
  const dir = 'docs/plan/research'
  const proposals = readdirSync(dir).filter((f) => f.endsWith('.tasks.json')).sort().flatMap((f) => JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')))
  const syn = JSON.parse(readFileSync('docs/plan/synthesis.json', 'utf8'))
  const { errors, warnings, plan } = synthesize(proposals, syn)
  warnings.forEach((w) => console.warn(`warn  ${w}`))
  if (errors.length) { errors.forEach((e) => console.error(`error ${e}`)); process.exit(1) }
  writeFileSync('docs/plan/plan.json', JSON.stringify(plan, null, 2) + '\n')
  // created once; afterwards it is the user's file and is never overwritten
  if (!existsSync('docs/plan/OPEN-DECISIONS.md')) {
    const rows = plan.meta.openDecisions.map((d) => `| ${d.id} | ${d.question} | ${d.default} | ${d.affects} | default assumed |`)
    writeFileSync('docs/plan/OPEN-DECISIONS.md', ['# Open decisions', '', 'Each has a default so the plan never blocks. Change the Status cell to `confirmed` or write your answer; then re-run `node scripts/plan/plan-synthesize.mjs` if it changes the plan.', '', '| # | Decision | Default | Affects | Status |', '|---|---|---|---|---|', ...rows, ''].join('\n'))
  }
  const r = lintPlan(plan)
  console.log(`${proposals.length} proposals -> ${plan.tasks.length} tasks (${plan.meta.merged.length} merged, ${plan.meta.deferred.length} deferred); ${r.stats.waves} waves, widest ${r.stats.maxWidth}; lint: ${r.errors.length} errors, ${r.warnings.length} warnings`)
  r.errors.forEach((e) => console.error(`error ${e}`))
  process.exit(r.errors.length ? 1 : 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
