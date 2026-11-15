import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/ember.css', import.meta.url), 'utf8')

function block(selector) {
  const i = css.indexOf(selector + ' {')
  assert.ok(i >= 0, `missing ${selector}`)
  return css.slice(i, css.indexOf('}', i))
}
function tokens(body) {
  const out = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

const ember = tokens(block(':root[data-accent="ember"]'))
const root = tokens(block(':root'))

const REQUIRED = {
  '--bg': '#0a0c10', '--surface': '#13161d', '--surface-raised': '#1d212c',
  '--border': '#262b37', '--text': '#eaecf1', '--text-secondary': '#909aad',
  '--accent': '#ff8a3d', '--accent-solid': '#ff8a3d', '--accent-fg': '#1d0d02',
  '--note': '#6ea8fe', '--success': '#4ade80', '--success-fg': '#062611',
  '--danger': '#ff8080', '--warn': '#fbbf24',
}

test('every DESIGN.md section 2 token is defined under ember', () => {
  for (const [k, v] of Object.entries(REQUIRED)) assert.equal(ember[k], v, k)
  assert.match(ember['--accent-dim'], /^rgba\(255,\s*138,\s*61,\s*0?\.12\)$/)
})

test('scales are defined on :root', () => {
  for (const k of ['--font-display', '--font-body', '--font-data', '--fs-body', '--space-4',
    '--radius-card', '--motion-press', '--motion-sheet']) assert.ok(root[k], k)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('contrast is at least 4.5:1 for text, secondary and accent on bg and surface', () => {
  for (const fg of ['--text', '--text-secondary', '--accent']) {
    for (const bg of ['--bg', '--surface']) {
      const r = ratio(ember[fg], ember[bg])
      assert.ok(r >= 4.5, `${fg} on ${bg} is ${r.toFixed(2)}`)
    }
  }
})

test('accent-fg on accent is at least 4.5:1', () => {
  const r = ratio(ember['--accent-fg'], ember['--accent'])
  assert.ok(r >= 4.5, `accent-fg on accent is ${r.toFixed(2)}`)
})
