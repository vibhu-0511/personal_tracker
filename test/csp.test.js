import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CSP_HEADER_KEY,
  SECURITY_HEADERS,
  SOURCES,
  SUPABASE_HOST,
  buildDsaPolicy,
  buildHeaderRules,
  buildMainPolicy,
} from '../config/csp.js'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const vercel = JSON.parse(read('../vercel.json'))

// "default-src 'self'; script-src 'self'" -> { 'default-src': ["'self'"], ... }
function parse(policy) {
  const out = {}
  for (const part of policy.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/)
    if (name) out[name] = values
  }
  return out
}

const main = parse(buildMainPolicy())
const dsa = parse(buildDsaPolicy())
const rule = (source) => vercel.headers.find((h) => h.source === source)
const headerValue = (r, key) =>
  r.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value

test('main policy: script-src is self only, no unsafe-inline', () => {
  assert.deepEqual(main['script-src'], ["'self'"])
  assert.ok(!buildMainPolicy().includes("script-src 'self' 'unsafe-inline'"))
  assert.ok(!main['script-src'].includes("'unsafe-inline'"))
  assert.ok(!main['script-src'].includes("'unsafe-eval'"))
})

test('main policy: connect-src lists Supabase https + wss and mfapi', () => {
  assert.ok(main['connect-src'].includes(`https://${SUPABASE_HOST}`))
  assert.ok(main['connect-src'].includes(`wss://${SUPABASE_HOST}`))
  assert.ok(main['connect-src'].includes('https://api.mfapi.in'))
  assert.ok(main['connect-src'].includes("'self'"))
})

test('main policy: worker, object, frame and style directives', () => {
  assert.ok(main['worker-src'].includes('blob:'))
  assert.deepEqual(main['object-src'], ["'none'"])
  assert.deepEqual(main['frame-ancestors'], ["'none'"])
  // DSA map is embedded same-origin (src/tabs/DsaView.jsx).
  assert.deepEqual(main['frame-src'], ["'self'"])
  // course.js / DSA markup carries style="..." attributes.
  assert.ok(main['style-src'].includes("'unsafe-inline'"))
})

test('main policy: supabaseHost option is honoured', () => {
  const p = parse(buildMainPolicy({ supabaseHost: 'abc.supabase.co' }))
  assert.ok(p['connect-src'].includes('https://abc.supabase.co'))
  assert.ok(p['connect-src'].includes('wss://abc.supabase.co'))
})

test('index.html has no inline script, so script-src self is enough', () => {
  const html = read('../index.html')
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  assert.ok(scripts.length > 0)
  for (const [, attrs, body] of scripts) {
    assert.match(attrs, /\bsrc=/, 'every script is external')
    assert.equal(body.trim(), '')
  }
})

test('dsa policy: inline scripts, jsDelivr and Google Fonts allowed', () => {
  assert.ok(dsa['script-src'].includes("'unsafe-inline'"))
  assert.ok(dsa['script-src'].includes('https://cdn.jsdelivr.net'))
  assert.ok(dsa['style-src'].includes('https://fonts.googleapis.com'))
  assert.ok(dsa['style-src'].includes("'unsafe-inline'"))
  assert.ok(dsa['font-src'].includes('https://fonts.gstatic.com'))
  assert.ok(dsa['connect-src'].includes(`https://${SUPABASE_HOST}`))
  assert.ok(dsa['connect-src'].includes(`wss://${SUPABASE_HOST}`))
  assert.deepEqual(dsa['object-src'], ["'none'"])
  // Embedded by the main app, so it must allow its own origin as ancestor.
  assert.deepEqual(dsa['frame-ancestors'], ["'self'"])
})

test('dsa page really uses what its policy allows', () => {
  const html = read('../public/dsa/mastery-map.html')
  assert.match(html, /https:\/\/cdn\.jsdelivr\.net\//)
  assert.match(html, /https:\/\/fonts\.googleapis\.com\//)
  assert.match(html, new RegExp(SUPABASE_HOST.replace(/\./g, '\\.')))
})

test('vercel.json CSP values equal config/csp.js output', () => {
  assert.equal(headerValue(rule(SOURCES.main), CSP_HEADER_KEY), buildMainPolicy())
  assert.equal(headerValue(rule(SOURCES.dsa), CSP_HEADER_KEY), buildDsaPolicy())
})

test('vercel.json carries every rule from buildHeaderRules verbatim', () => {
  for (const expected of buildHeaderRules()) {
    assert.deepEqual(rule(expected.source), expected)
  }
})

test('CSP ships report-only and never as an enforcing header yet', () => {
  assert.equal(CSP_HEADER_KEY, 'Content-Security-Policy-Report-Only')
  for (const r of vercel.headers) {
    for (const h of r.headers) {
      assert.notEqual(h.key.toLowerCase(), 'content-security-policy')
    }
  }
})

test('main CSP rule does not match /dsa paths, dsa rule does', () => {
  const mainRe = new RegExp(`^${SOURCES.main}$`)
  const dsaRe = new RegExp(`^${SOURCES.dsa}$`)
  for (const p of ['/dsa/', '/dsa/mastery-map.html']) {
    assert.equal(mainRe.test(p), false, `${p} must not get the main policy`)
    assert.equal(dsaRe.test(p), true, `${p} gets the dsa policy`)
  }
  for (const p of ['/', '/life', '/assets/index-abc.js', '/dsa-notes']) {
    assert.equal(mainRe.test(p), true, `${p} gets the main policy`)
    assert.equal(dsaRe.test(p), false)
  }
})

test('security headers: nosniff, Referrer-Policy, Permissions-Policy', () => {
  const r = rule(SOURCES.all)
  assert.ok(r, 'catch-all header rule exists')
  assert.equal(headerValue(r, 'X-Content-Type-Options'), 'nosniff')
  assert.ok(headerValue(r, 'Referrer-Policy'))
  const pp = headerValue(r, 'Permissions-Policy')
  assert.match(pp, /camera=\(\)/)
  assert.match(pp, /microphone=\(\)/)
  assert.match(pp, /geolocation=\(\)/)
  assert.deepEqual(r.headers, SECURITY_HEADERS)
})

test('existing /api/puzzle cache rule is untouched', () => {
  const r = rule('/api/puzzle')
  assert.ok(r)
  assert.match(headerValue(r, 'Cache-Control'), /s-maxage=3600/)
})
