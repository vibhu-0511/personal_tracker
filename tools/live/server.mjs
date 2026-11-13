#!/usr/bin/env node
// Forge live engine: receives Claude Code hook events, tails the transcript, watches git,
// and streams everything to the browser over SSE. Zero dependencies.
//   node tools/live/server.mjs        (or: npm run live)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalize } from './lib/graph.mjs'
import { deriveStatuses, readRepo } from './lib/build.mjs'
import { play } from './demo.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = process.env.FORGE_REPO || path.resolve(HERE, '..', '..')
const PORT = +(process.env.FORGE_LIVE_PORT || 4317)
const HOST = process.env.FORGE_LIVE_HOST || '127.0.0.1'
const ANY_HOST = process.env.FORGE_LIVE_ANY_HOST === '1'
const STORE = path.join(ROOT, '.live')
const RING = 2000

fs.mkdirSync(STORE, { recursive: true })

/* ---------- plan ---------- */
function loadPlan() {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/plan/plan.json'), 'utf8'))
    return {
      phases: p.phases.map(x => ({ id: x.id, name: x.name, goal: x.goal })),
      tasks: p.tasks.map(t => ({ id: t.id, p: t.phase, w: t.wave, t: t.title, s: t.size, o: t.owner || '', u: t.urgent ? 1 : 0, d: t.deps || [], wr: t.writes || [], a: t.acceptance })),
    }
  } catch { return { phases: [], tasks: [] } }
}
const plan = loadPlan()

/* ---------- events ---------- */
let nextId = 1
const ring = []
const clients = new Set()
const evFile = path.join(STORE, 'events.jsonl')
try {
  const lines = fs.readFileSync(evFile, 'utf8').split('\n').filter(Boolean).slice(-RING)
  for (const l of lines) { try { const e = JSON.parse(l); ring.push(e); nextId = Math.max(nextId, e.id + 1) } catch {} }
} catch {}
const evStream = fs.createWriteStream(evFile, { flags: 'a' })

function send(res, event, data, id) {
  res.write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}
function broadcast(event, data, id) { for (const c of clients) { try { send(c, event, data, id) } catch {} } }

function emit(ev) {
  ev.id = nextId++
  ring.push(ev); if (ring.length > RING) ring.shift()
  evStream.write(JSON.stringify(ev) + '\n')
  broadcast('ev', ev, ev.id)
  if (ev.transcript) watchTranscript(ev.transcript, ev.session)
  return ev
}

/* ---------- transcript tail (assistant text only; tool calls come from hooks) ---------- */
const tails = new Map()
function watchTranscript(file, session) {
  if (tails.has(file)) return
  let pos = 0
  try { pos = fs.statSync(file).size } catch { return }
  tails.set(file, { pos, rest: '', session, seen: new Set() })
}
setInterval(() => {
  for (const [file, t] of tails) {
    let st; try { st = fs.statSync(file) } catch { continue }
    if (st.size <= t.pos) { if (st.size < t.pos) t.pos = st.size; continue }
    const len = Math.min(st.size - t.pos, 1 << 20)
    const buf = Buffer.alloc(len)
    let fd; try { fd = fs.openSync(file, 'r'); fs.readSync(fd, buf, 0, len, t.pos) } catch { continue } finally { if (fd !== undefined) fs.closeSync(fd) }
    t.pos += len
    const lines = (t.rest + buf.toString('utf8')).split('\n')
    t.rest = lines.pop()
    for (const l of lines) {
      let o; try { o = JSON.parse(l) } catch { continue }
      if (o.type !== 'assistant' || !Array.isArray(o.message?.content)) continue
      o.message.content.forEach((b, i) => {
        if (b.type !== 'text' || !b.text?.trim()) return
        const key = `${o.uuid}:${i}`
        if (t.seen.has(key)) return
        t.seen.add(key)
        emit({ ts: Date.now(), kind: 'transcript', event: 'AssistantText', session: t.session, agent: o.agentId || null, text: b.text.length > 1500 ? b.text.slice(0, 1500) + '…' : b.text })
      })
    }
  }
}, 600).unref()

/* ---------- build state from git ---------- */
const ovFile = path.join(STORE, 'overrides.json')
let overrides = {}
try { overrides = JSON.parse(fs.readFileSync(ovFile, 'utf8')) } catch {}
let build = { tasks: {}, repo: {}, ts: 0 }
let buildSig = ''
async function pollBuild() {
  try {
    const repo = await readRepo(ROOT)
    const tasks = deriveStatuses(plan.tasks, repo, overrides)
    const next = { tasks, repo: { head: repo.head, dirty: repo.dirty, worktrees: repo.worktrees, baseRef: repo.baseRef }, ts: Date.now() }
    const sig = JSON.stringify([next.tasks, next.repo])
    if (sig !== buildSig) { buildSig = sig; build = next; broadcast('build', build) }
  } catch {}
}
pollBuild(); setInterval(pollBuild, 2000).unref()

/* ---------- http ---------- */
const STATIC = {
  '/': ['ui/index.html', 'text/html; charset=utf-8'],
  '/lib/graph.mjs': ['lib/graph.mjs', 'text/javascript; charset=utf-8'],
}
function body(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = []
    req.on('data', c => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)) }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  if (!ANY_HOST && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '')) { res.writeHead(403); return res.end('forbidden host') }
  try {
    if (req.method === 'POST') {
      if (!/application\/json/.test(req.headers['content-type'] || '')) { res.writeHead(415); return res.end() }
      const raw = await body(req)
      const payload = raw ? JSON.parse(raw) : {}
      if (url.pathname === '/event') { emit(normalize(payload)); res.writeHead(204); return res.end() }
      if (url.pathname === '/demo') {            // synthetic session so the page can be tried without Claude Code
        play(p => emit(normalize(p)))
        res.writeHead(202); return res.end()
      }
      if (url.pathname === '/task') {            // orchestrator override: {id, s, note}
        if (!payload.id) return json(res, 400, { error: 'id required' })
        if (payload.s === 'auto') delete overrides[payload.id]; else overrides[payload.id] = { s: payload.s, note: payload.note || '' }
        fs.writeFileSync(ovFile, JSON.stringify(overrides, null, 1)); await pollBuild()
        return json(res, 200, { ok: true })
      }
      res.writeHead(404); return res.end()
    }
    if (url.pathname === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' })
      res.write('retry: 1000\n\n')
      const since = +(req.headers['last-event-id'] || url.searchParams.get('since') || 0)
      send(res, 'hello', { now: Date.now(), build, root: path.basename(ROOT) })
      const cutoff = since ? 0 : Date.now() - 30 * 60 * 1000   // a fresh page replays the last 30 minutes
      for (const e of ring) if (e.id > since && e.ts >= cutoff) send(res, 'ev', e, e.id)
      clients.add(res)
      const ka = setInterval(() => res.write(': ka\n\n'), 15000)
      req.on('close', () => { clearInterval(ka); clients.delete(res) })
      return
    }
    if (url.pathname === '/api/plan') return json(res, 200, plan)
    if (url.pathname === '/api/state') return json(res, 200, { build, events: ring.length, clients: clients.size })
    if (url.pathname === '/health') return json(res, 200, { ok: true, events: ring.length, clients: clients.size })
    const s = STATIC[url.pathname]
    if (s) { res.writeHead(200, { 'content-type': s[1], 'cache-control': 'no-store' }); return fs.createReadStream(path.join(HERE, s[0])).pipe(res) }
    res.writeHead(404); res.end('not found')
  } catch (e) { res.writeHead(400); res.end(String(e.message || e)) }
})
server.listen(PORT, HOST, () => console.log(`forge live: http://${HOST}:${PORT}  (repo ${ROOT})`))
