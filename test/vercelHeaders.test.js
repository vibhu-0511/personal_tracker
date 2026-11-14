import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'),
)

// Header sources are path-to-regexp patterns. The ones in this file are plain
// paths plus parenthesised regex groups, so anchoring them and escaping any
// literal dot outside a group gives an equivalent JS regex.
function sourceToRegExp(source) {
  let out = ''
  let depth = 0
  for (const ch of source) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    out += ch === '.' && depth === 0 ? '\\.' : ch
  }
  return new RegExp(`^${out}$`)
}

const rulesFor = (path) =>
  config.headers.filter((rule) => sourceToRegExp(rule.source).test(path))

// Vercel merges every matching rule; collect the Cache-Control values a path gets.
const cacheControlFor = (path) =>
  rulesFor(path).flatMap((rule) =>
    rule.headers
      .filter((h) => h.key.toLowerCase() === 'cache-control')
      .map((h) => h.value),
  )

const maxAge = (value) => {
  const m = value.match(/(?:^|,\s*)max-age=(\d+)/)
  return m ? Number(m[1]) : null
}

test('vercel.json parses and has a headers array', () => {
  assert.ok(Array.isArray(config.headers))
})

test('/sw.js is revalidated on every load', () => {
  assert.deepEqual(cacheControlFor('/sw.js'), ['no-cache'])
})

test('/manifest.json is revalidated on every load', () => {
  assert.deepEqual(cacheControlFor('/manifest.json'), ['no-cache'])
})

test('hashed /assets/* files are cached for a year and immutable', () => {
  for (const p of ['/assets/index-abc123.js', '/assets/style-abc123.css']) {
    const values = cacheControlFor(p)
    assert.equal(values.length, 1, `${p} gets exactly one Cache-Control`)
    assert.equal(values[0], 'public, max-age=31536000, immutable')
  }
})

test('/icons/* gets a long max-age but is not immutable', () => {
  for (const p of ['/icons/pwa-192x192.png', '/icons/favicon.svg']) {
    const values = cacheControlFor(p)
    assert.equal(values.length, 1, `${p} gets exactly one Cache-Control`)
    assert.match(values[0], /(^|,\s*)public(\s*,|$)/)
    assert.ok(maxAge(values[0]) >= 86400, 'max-age is at least one day')
    assert.doesNotMatch(values[0], /immutable/, 'icons are not content-hashed')
  }
})

test('the new cache rules do not leak onto other paths', () => {
  for (const p of ['/', '/life/tasks', '/index.html', '/puzzles.json']) {
    assert.deepEqual(cacheControlFor(p), [], `${p} gets no Cache-Control rule`)
  }
  assert.deepEqual(cacheControlFor('/dsa/mastery-map.html'), [])
})

test('no static-asset cache rule matches /api/*', () => {
  const apiPaths = ['/api/agent', '/api/health', '/api/ics', '/api/_lib/ics.js']
  for (const p of apiPaths) {
    assert.deepEqual(cacheControlFor(p), [], `${p} gets no Cache-Control`)
  }
  // The only Cache-Control rule allowed to touch /api/* is the existing puzzle one.
  assert.deepEqual(cacheControlFor('/api/puzzle'), [
    'public, s-maxage=3600, stale-while-revalidate=86400',
  ])
  const staticSources = ['/sw.js', '/manifest.json', '/assets/(.*)', '/icons/(.*)']
  for (const source of staticSources) {
    const re = sourceToRegExp(source)
    for (const p of [...apiPaths, '/api/puzzle', '/api']) {
      assert.equal(re.test(p), false, `${source} must not match ${p}`)
    }
  }
})
