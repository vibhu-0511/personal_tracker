#!/usr/bin/env node
// Snapshot for the Artifact page: recent session events (from the transcript files) plus task status (from git).
//   node tools/live/feed.mjs <out.json> [maxEvents]
// Upload with the artifact database tool: set collection "live", doc "feed", file_path <out.json>.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSessionEvents } from './lib/transcript.mjs'
import { deriveStatuses, readRepo } from './lib/build.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const [out, nArg] = process.argv.slice(2)
if (!out) { console.error('usage: feed.mjs <out.json> [maxEvents]'); process.exit(2) }
const N = +(nArg || 120)

function findSession() {
  const base = process.env.FORGE_TRANSCRIPTS || path.join(os.homedir(), '.claude', 'projects')
  let best = null
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const dir = path.join(base, d)
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsonl'))) {
      const m = fs.statSync(path.join(dir, f)).mtimeMs
      if (!best || m > best.m) best = { dir, session: f.replace(/\.jsonl$/, ''), m }
    }
  }
  return best
}
const cut = (s, n) => typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s
const compactInput = v => {
  if (typeof v === 'string') return cut(v, 200)
  if (Array.isArray(v)) return v.slice(0, 8).map(compactInput)
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v).slice(0, 8)) o[k] = compactInput(v[k]); return o }
  return v
}

const s = findSession()
const events = s ? readSessionEvents(s.dir, s.session).slice(-N).map(e => {
  const c = { ts: e.ts, event: e.event, tool: e.tool, toolUseId: e.toolUseId, agent: e.agent, agentLabel: e.agentLabel, parentUse: e.parentUse, error: e.error || undefined }
  if (e.input !== undefined) c.input = compactInput(e.input)
  if (e.output) c.output = cut(e.output, 600)
  if (e.text) c.text = cut(e.text, 400)
  if (e.prompt) c.prompt = cut(e.prompt, 300)
  for (const k of Object.keys(c)) if (c[k] == null) delete c[k]
  return c
}) : []

const plan = JSON.parse(fs.readFileSync(path.join(root, 'docs/plan/plan.json'), 'utf8'))
const repo = await readRepo(root)
const st = deriveStatuses(plan.tasks.map(t => ({ ...t, o: t.owner || '' })), repo)
const tasks = {}
for (const [id, v] of Object.entries(st)) if (v.s !== 'queued') tasks[id] = { s: v.s, branch: v.branch, sha: v.sha }

const doc = { updated: new Date().toISOString(), session: s && s.session, events, tasks, repo: { head: repo.head, dirty: repo.dirty } }
fs.writeFileSync(out, JSON.stringify(doc))
console.log(`wrote ${out}: ${events.length} events, ${Object.keys(tasks).length} task states, ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB`)
