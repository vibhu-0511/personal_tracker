import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cspMetaPlugin, buildNativePolicy, apiOrigin } from '../vite-plugins/cspMeta.js'
import { buildMainPolicy } from '../config/csp.js'

const API = 'https://api.example.com'

function parse(policy) {
  const out = {}
  for (const part of policy.split('; ')) {
    const [name, ...values] = part.split(' ')
    out[name] = values
  }
  return out
}

const run = (opts) => cspMetaPlugin(opts).transformIndexHtml('<html></html>', {})

test('no tag unless mode is native', () => {
  for (const mode of ['production', 'development', 'e2e', undefined, 'Native']) {
    assert.equal(run({ mode, apiBase: API }), undefined, String(mode))
  }
})

test('native mode injects one CSP meta tag first in head', () => {
  const tags = run({ mode: 'native', apiBase: API })
  assert.equal(tags.length, 1)
  assert.equal(tags[0].tag, 'meta')
  assert.equal(tags[0].attrs['http-equiv'], 'Content-Security-Policy')
  assert.equal(tags[0].injectTo, 'head-prepend')
  assert.equal(tags[0].attrs.content, buildNativePolicy({ apiBase: API }))
})

test('connect-src includes the VITE_API_BASE origin (path and slash dropped)', () => {
  const [tag] = run({ mode: 'native', apiBase: `${API}/v1/` })
  const d = parse(tag.attrs.content)
  assert.ok(d['connect-src'].includes(API))
  assert.ok(d['connect-src'].includes("'self'"))
  assert.equal(d['connect-src'].filter((v) => v === API).length, 1)
})

test('port is kept in the origin', () => {
  assert.equal(apiOrigin('http://192.168.1.5:3000/x'), 'http://192.168.1.5:3000')
})

test('empty API base leaves connect-src as the shared policy', () => {
  const d = parse(buildNativePolicy({ apiBase: '' }))
  const main = parse(buildMainPolicy())
  assert.deepEqual(d['connect-src'], main['connect-src'])
})

test('invalid or non-http API base throws', () => {
  assert.throws(() => apiOrigin('api.example.com'), /absolute URL/)
  assert.throws(() => apiOrigin('capacitor://localhost'), /http\(s\)/)
})

test('frame-ancestors is omitted; other directives match the shared policy', () => {
  const d = parse(buildNativePolicy({ apiBase: API }))
  const main = parse(buildMainPolicy())
  assert.ok(!('frame-ancestors' in d))
  for (const [name, values] of Object.entries(main)) {
    if (name === 'frame-ancestors' || name === 'connect-src') continue
    assert.deepEqual(d[name], values, name)
  }
})

test('content survives as an HTML attribute (no double quotes)', () => {
  const [tag] = run({ mode: 'native', apiBase: API })
  assert.ok(!tag.attrs.content.includes('"'))
})
