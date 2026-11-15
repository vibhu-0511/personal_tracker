import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
test('artifact build inlines graph + adapter, has no server fetches or hard-coded ids', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'af-art-')), 'page.html')
  // Isolate from the caller's env: a real run may point AGENTFLOW_PLAN at a plan whose text names a session.
  const env = { ...process.env }
  delete env.AGENTFLOW_PLAN
  delete env.AGENTFLOW_SESSION
  execFileSync('node', [path.join(HERE, '..', 'tools', 'agentflow', 'artifact', 'build.mjs'), out], { env })
  const h = fs.readFileSync(out, 'utf8')
  assert.match(h, /<title>Agentflow<\/title>/)
  assert.ok(h.includes('function reduce(') && h.includes('agentflow/feed'))
  assert.ok(!/from '\/lib\/graph\.mjs'/.test(h) && !h.includes("fetch('/api/plan')") && h.includes('startCcr()'))
  assert.ok(!h.includes('4317') && !/session_01/.test(h))
  assert.match(h, /not continuously/)
})
