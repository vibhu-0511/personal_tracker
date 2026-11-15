import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
)

// Vercel rewrite sources are path-to-regexp patterns. The one used here is a
// plain path with a single capture group, which is also a valid JS regex once
// anchored, so we evaluate it directly.
const spaRewrite = config.rewrites.find((r) => r.destination === '/index.html')
const matchesRewrite = (path) =>
  new RegExp(`^${spaRewrite.source}$`).test(path)

test('vercel.json parses and has the expected top-level keys', () => {
  assert.equal(typeof config, 'object')
  assert.ok(Array.isArray(config.rewrites))
  assert.ok(Array.isArray(config.headers))
  assert.ok(config.functions && typeof config.functions === 'object')
})

test('SPA rewrite sends app paths to /index.html', () => {
  assert.ok(spaRewrite, 'rewrite to /index.html exists')
  for (const p of ['/', '/life', '/life/tasks', '/money/overview', '/agents']) {
    assert.equal(matchesRewrite(p), true, `${p} should be rewritten`)
  }
})

test('SPA rewrite leaves api, dsa and static assets untouched', () => {
  const untouched = [
    '/api/puzzle',
    '/api/agent',
    '/api/health',
    '/api/_lib/ics.js',
    '/dsa',
    '/dsa/',
    '/dsa/mastery-map.html',
    '/manifest.json',
    '/puzzles.json',
    '/sky-clouds.svg',
    '/assets/index-abc123.js',
    '/assets/style-abc123.css',
  ]
  for (const p of untouched) {
    assert.equal(matchesRewrite(p), false, `${p} must not be rewritten`)
  }
})

test('paths that merely start with "api" or "dsa" are still app routes', () => {
  assert.equal(matchesRewrite('/apiary'), true)
  assert.equal(matchesRewrite('/dsa-notes'), true)
})

test('functions config sets maxDuration', () => {
  const entries = Object.values(config.functions)
  assert.ok(entries.length > 0)
  for (const fn of entries) {
    assert.equal(Number.isInteger(fn.maxDuration), true)
    assert.ok(fn.maxDuration > 0)
  }
})

test('/api/puzzle has a public, CDN-cacheable Cache-Control header', () => {
  const rule = config.headers.find((h) => h.source === '/api/puzzle')
  assert.ok(rule, 'header rule for /api/puzzle exists')
  const cc = rule.headers.find((h) => h.key.toLowerCase() === 'cache-control')
  assert.ok(cc, 'Cache-Control header present')
  assert.match(cc.value, /(^|,\s*)public(\s*,|$)/)
  const m = cc.value.match(/s-maxage=(\d+)/)
  assert.ok(m, 's-maxage present')
  assert.ok(Number(m[1]) >= 3600, 's-maxage >= 3600')
  assert.match(cc.value, /stale-while-revalidate/)
})
