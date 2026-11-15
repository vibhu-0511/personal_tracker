// Plan file resolution shared by the live tools. FORGE_PLAN env or --plan <file>, default docs/plan/plan.json.
import fs from 'node:fs'
import path from 'node:path'

export const DEFAULT_PLAN = 'docs/plan/plan.json'

// Returns { plan: <path or undefined>, args: argv without the --plan flag }.
export function splitPlanArg(argv) {
  const args = []; let plan
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--plan') { plan = argv[++i]; continue }
    if (argv[i].startsWith('--plan=')) { plan = argv[i].slice(7); continue }
    args.push(argv[i])
  }
  return { plan, args }
}

// Relative paths resolve against root. Returns the repo-relative or absolute path as given.
export function planFile(root, flag, env = process.env) {
  const rel = flag || env.FORGE_PLAN || DEFAULT_PLAN
  return { rel, abs: path.resolve(root, rel) }
}

export function loadPlanFile(root, flag, env = process.env) {
  const { rel, abs } = planFile(root, flag, env)
  return { rel, plan: JSON.parse(fs.readFileSync(abs, 'utf8')) }
}

export const trailers = (env = process.env) => (env.FORGE_TRAILERS || 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>').replace(/\\n/g, '\n')
