import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const tokens = read('../src/styles/tokens.css')
const agents = read('../src/agents/agents.css')

function declarations(css, selector) {
  const out = {}
  for (let i = css.indexOf(selector + ' {'); i >= 0; i = css.indexOf(selector + ' {', i + 1)) {
    for (const m of css.slice(i, css.indexOf('}', i)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  }
  return out
}
const rgb = (v) => {
  let m = v.match(/^#([0-9a-f]{6})$/i)
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1)
  m = v.match(/rgba?\(([^)]+)\)/)
  assert.ok(m, `unparseable colour ${v}`)
  const p = m[1].split(',').map(parseFloat)
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
}
const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1)
const lum = (c) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const ember = read('../src/styles/ember.css')
const emberTok = declarations(ember, ':root[data-accent="ember"]')
const cream = {
  ...declarations(tokens, ':root[data-accent="sky"],\n:root[data-accent="cream"]'),
  ...declarations(tokens, ':root[data-accent="cream"]'),
}

test('agents composer textarea border uses the form-field border token', () => {
  const block = agents.match(/\.agents-chat \.chat-input-row textarea\s*\{[^}]*\}/)[0]
  assert.match(block, /border:\s*1px solid var\(--field-border, var\(--border\)\)/)
})

test('form-field border reaches 3:1 on the surface in cream and ember', () => {
  assert.ok(ratio(rgb(cream['--field-border']), rgb(cream['--surface'])) >= 3)
  assert.ok(ratio(rgb(cream['--field-border']), rgb(cream['--bg'])) >= 3)
  if (emberTok['--field-border'] && emberTok['--bg']) {
    assert.ok(ratio(rgb(emberTok['--field-border']), rgb(emberTok['--bg'])) >= 3)
  }
})

test('light-family warn reaches 4.5:1 on its tint over the cream surfaces and Today mood tile', () => {
  const warn = rgb(cream['--warn'])
  const dim = rgb(cream['--warn-dim'])
  const fills = [cream['--bg'], cream['--surface'], cream['--surface-raised'], '#d1dec8']
  for (const f of fills) {
    const under = rgb(f)
    assert.ok(ratio(warn, over(dim, under)) >= 4.5, `warn on ${f}`)
    assert.ok(ratio(warn, under) >= 4.5, `warn on plain ${f}`)
  }
})
