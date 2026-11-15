#!/usr/bin/env node
// Claude Code hook -> agentflow server. Reads the hook JSON from stdin and POSTs it to the
// local server. Prints NOTHING and always exits 0, so it can never change or block Claude.
import http from 'node:http'

const port = +(process.env.AGENTFLOW_PORT || 4777)
const host = process.env.AGENTFLOW_HOST || '127.0.0.1'
const done = () => process.exit(0)
setTimeout(done, 1500).unref()
process.stdin.on('error', done)

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', d => { buf += d })
process.stdin.on('end', () => {
  const req = http.request({ host, port, path: '/event', method: 'POST', timeout: 700, headers: { 'content-type': 'application/json' } }, res => { res.resume(); res.on('end', done) })
  req.on('error', done)
  req.on('timeout', () => { req.destroy(); done() })
  req.end(buf || '{}')
})
