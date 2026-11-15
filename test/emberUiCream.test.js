import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const ui = read('../src/ui/ember-ui.css')
const tokensCss = read('../src/styles/tokens.css')
const emberCss = read('../src/styles/ember.css')

// every `selector {` block, concatenated (cream is split across a shared light block and its own)
function block(css, selector) {
  let out = ''
  for (let i = css.indexOf(selector + ' {'); i >= 0; i = css.indexOf(selector + ' {', i + 1)) {
    out += css.slice(i, css.indexOf('}', i)) + '\n'
  }
  assert.ok(out, `missing ${selector}`)
  return out
}
function tokens(body) {
  const out = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}
const cream = tokens(block(tokensCss, ':root[data-accent="cream"]'))
const ember = tokens(block(emberCss, ':root[data-accent="ember"]'))
const rootTokens = tokens(block(tokensCss, ':root'))

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('ember-only tokens used in ember-ui.css always have a fallback under cream', () => {
  const emberOnly = Object.keys(ember).filter((k) => !(k in cream) && !(k in rootTokens))
  assert.ok(emberOnly.includes('--success-fg'))
  for (const name of emberOnly) {
    for (const m of ui.matchAll(new RegExp(`var\\(${name}(\\s*[,)])`, 'g'))) {
      assert.equal(m[1].trim(), ',', `${name} used without a fallback`)
    }
  }
  assert.match(ui, /color:\s*var\(--success-fg,\s*var\(--on-accent/)
})

test('done glyph is legible on --success under cream', () => {
  assert.equal(rootTokens['--on-accent'], '#fff')
  assert.ok(ratio('#ffffff', cream['--success']) >= 4.5)
})

test('empty SegDots border has >= 3:1 against cream bg and surface', () => {
  const rule = ui.match(/:root\[data-accent="cream"\] \.ember-segdot:not\(\[data-filled="true"\]\)\s*\{([^}]*)\}/)
  assert.ok(rule, 'missing cream empty-segdot rule')
  const m = rule[1].match(/border-color:\s*var\((--[\w-]+)\)/)
  assert.ok(m, 'border-color must be a token')
  const colour = cream[m[1]]
  assert.match(colour, /^#[0-9a-f]{6}$/i)
  assert.ok(ratio(colour, cream['--bg']) >= 3, 'vs bg')
  assert.ok(ratio(colour, cream['--surface']) >= 3, 'vs surface')
})
