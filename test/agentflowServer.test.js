import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const req = (port, opts, body) => new Promise((resolve, reject) => {
  const r = http.request({ host: '127.0.0.1', port, ...opts }, res => { let b = ''; res.on('data', d => { b += d }); res.on('end', () => resolve({ status: res.statusCode, body: b })) })
  r.on('error', reject); r.end(body)
})

test('server: health, POST guards, event round trip, SSE replay, static whitelist', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'af-srv-'))
  execFileSync('git', ['init', '-q'], { cwd: repo })
  const port = 20000 + Math.floor(Math.random() * 20000)
  const child = spawn('node', [path.join(HERE, '..', 'tools', 'agentflow', 'server.mjs')], { env: { ...process.env, AGENTFLOW_PORT: String(port), AGENTFLOW_REPO: repo }, stdio: 'pipe' })
  try {
    for (let i = 0; i < 50; i++) { try { await req(port, { path: '/health' }); break } catch { await new Promise(r => setTimeout(r, 100)) } }
    assert.equal(JSON.parse((await req(port, { path: '/health' })).body).ok, true)
    const J = { 'content-type': 'application/json' }
    assert.equal((await req(port, { path: '/event', method: 'POST', headers: { 'content-type': 'text/plain' } }, '{}')).status, 415)
    assert.equal((await req(port, { path: '/event', method: 'POST', headers: { ...J, host: 'evil.example.com' } }, '{}')).status, 403)
    const ev = { hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Bash', tool_use_id: 'u1', tool_input: { command: 'echo hi' } }
    assert.equal((await req(port, { path: '/event', method: 'POST', headers: J }, JSON.stringify(ev))).status, 204)
    // SSE: collect the replay
    const got = await new Promise(resolve => {
      let buf = ''
      const r = http.request({ host: '127.0.0.1', port, path: '/events' }, res => { res.on('data', d => { buf += d; if (/event: ev/.test(buf)) { r.destroy(); resolve(buf) } }) })
      r.on('error', () => {}); r.end(); setTimeout(() => { r.destroy(); resolve(buf) }, 3000)
    })
    assert.match(got, /event: hello/); assert.match(got, /event: ev\ndata: .*"tool":"Bash"/); assert.match(got, /^id: 1$/m)
    assert.equal((await req(port, { path: '/ui/../server.mjs' })).status, 404)
    assert.equal((await req(port, { path: '/server.mjs' })).status, 404)
    assert.equal((await req(port, { path: '/' })).status, 200)
    assert.equal((await req(port, { path: '/lib/graph.mjs' })).status, 200)
    assert.ok(fs.existsSync(path.join(repo, '.agentflow', 'events.jsonl')))
  } finally { child.kill(); fs.rmSync(repo, { recursive: true, force: true }) }
})
