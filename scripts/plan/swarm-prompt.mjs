#!/usr/bin/env node
// Single source of truth for the info-gathering swarm: docs/plan/swarm.json.
//   node scripts/plan/swarm-prompt.mjs --list          roster
//   node scripts/plan/swarm-prompt.mjs R1              full prompt for one agent
//   node scripts/plan/swarm-prompt.mjs --check         completeness gate once the swarm has finished
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkProposals } from './plan-lint.mjs'

const MANIFEST = 'docs/plan/swarm.json'

export function buildPrompt(m, agent) {
  const dir = m.report.dir
  const tf = Object.entries(m.report.taskFields).map(([k, v]) => `    "${k}": ${v}`).join('\n')
  return `You are research agent ${agent.id} ("${agent.name}") in a parallel swarm gathering facts to plan the next build of the Forge app. You are READ-ONLY on the product: do not edit, create or delete anything outside ${dir}/${agent.id}-*. Do not run git commands, do not commit, do not install dependencies (unless your questions explicitly say to run a baseline).

# Why this exists
The user chose a HYBRID design for Forge. Your findings become the input of a phase -> wave -> task build plan in which every task in a wave runs in parallel, so precise file write-sets matter more than prose.

# Decision already made (do not reopen, but flag anything that makes it hard)
${m.decision.title}
${m.decision.definition.map((d) => `- ${d}`).join('\n')}

# Repo facts (verify them, tell me if any is wrong)
${m.repoFacts.map((d) => `- ${d}`).join('\n')}

# Your charter
${agent.charter}

# Where to look
Read scope: ${agent.readScope.join('; ')}
Blueprint (this is the agreed design/architecture reference): docs/plan/blueprint.txt is a clean text extraction of docs/forge-blueprint.html. Re-read it before you start. Your parts: ${agent.blueprintFocus.join('; ')}.

# Questions you must answer
${agent.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

# Output contract (a checker will verify this)
Write two files:
1. ${dir}/${agent.id}-report.md with EXACTLY these level-2 headings, in this order:
${m.report.requiredHeadings.map((h) => `   ${h}`).join('\n')}
   - Facts: bullets, every one with a file:line (or URL) reference. Separate observed fact from inference by prefixing inferences with "Inference:".
   - Gaps and contradictions: between the blueprint, the code and the docs. Be specific.
   - Risks: what could make the build fail or lose user data, with a mitigation.
   - Write-set map: the files the build will touch in your area, and which are contention hot spots (files many tasks must edit).
   - Needs from the user: accounts, keys, dashboard actions, device/OS facts, decisions only the user can supply. "None" if none.
   - Proposed tasks: a short human-readable list that matches the JSON below.
   - Keep the report under 250 lines. No filler, no restating the question, no praise.
2. ${dir}/${agent.id}.tasks.json: a JSON array of proposed build tasks, each an object with:
${tf}
   Rules: every task must be independently executable by one agent in one sitting; prefer S/M; do not propose a task whose write-set you did not inspect; if two of your tasks must edit the same file, say so by giving the second a dep on the first.

# Quality bar
- Verify before you claim: open the file, quote the line. Never guess a path. If something is unreadable or unavailable, say so in Gaps rather than inventing it.
- Prefer exact numbers (line counts, versions, sizes) over adjectives.
- Stay in your lane; mention cross-area findings in one line and move on.

# Final message
When both files are written, reply with at most 8 lines: your headline findings, the number of proposed tasks, and anything blocking. Do not paste the report.`
}

export function check(m) {
  const problems = []
  for (const a of m.agents) {
    const rp = `${m.report.dir}/${a.id}-report.md`
    const tp = `${m.report.dir}/${a.id}.tasks.json`
    if (!existsSync(rp)) { problems.push(`${a.id}: missing ${rp}`); continue }
    const text = readFileSync(rp, 'utf8')
    let last = -1
    for (const h of m.report.requiredHeadings) {
      const i = text.indexOf(`\n${h}`)
      const at = text.startsWith(h) ? 0 : i
      if (at === -1) problems.push(`${a.id}: report missing heading "${h}"`)
      else if (at < last) problems.push(`${a.id}: heading "${h}" out of order`)
      else last = at
    }
    if (!existsSync(tp)) { problems.push(`${a.id}: missing ${tp}`); continue }
    try {
      const tasks = JSON.parse(readFileSync(tp, 'utf8'))
      if (!Array.isArray(tasks) || !tasks.length) problems.push(`${a.id}: tasks.json must be a non-empty array`)
      else problems.push(...checkProposals(tasks).map((e) => `${a.id}: ${e}`))
    } catch (e) { problems.push(`${a.id}: tasks.json is not valid JSON (${e.message})`) }
  }
  return problems
}

function main() {
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  const arg = process.argv[2]
  if (arg === '--list') { m.agents.forEach((a) => console.log(`${a.id}\t${a.name}\t${a.charter}`)); return }
  if (arg === '--check') {
    const problems = check(m)
    problems.forEach((p) => console.error(p))
    console.log(problems.length ? `${problems.length} problem(s)` : `all ${m.agents.length} agents delivered a valid report and task list`)
    process.exit(problems.length ? 1 : 0)
  }
  const agent = m.agents.find((a) => a.id === arg)
  if (!agent) { console.error(`usage: swarm-prompt.mjs --list | --check | <${m.agents.map((a) => a.id).join('|')}>`); process.exit(2) }
  console.log(buildPrompt(m, agent))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
