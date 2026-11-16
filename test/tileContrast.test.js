import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const tilesB = read('../src/today/tiles/tiles-b.css')
const wellbeing = read('../src/life/wellbeing.css')
const tokensCss = read('../src/styles/tokens.css')
const emberCss = read('../src/styles/ember.css')

function rule(css, selector) {
  const i = css.indexOf(selector + ' {')
  assert.ok(i >= 0, `missing ${selector}`)
  return css.slice(i, css.indexOf('}', i))
}
function blocks(css, selector) {
  let out = ''
  for (let i = css.indexOf(selector + ' {'); i >= 0; i = css.indexOf(selector + ' {', i + 1)) out += css.slice(i, css.indexOf('}', i)) + '\n'
  return out
}
function tokens(body) {
  const out = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}
const root = tokens(blocks(tokensCss, ':root'))
const themes = {
  ember: { ...root, ...tokens(blocks(emberCss, ':root[data-accent="ember"]')) },
  cream: { ...root, ...tokens(blocks(tokensCss, ':root[data-accent="cream"]')) },
}
// tile surface behind the input: ember tile is #2f3a4c (plan note), cream tile-inner is white 65% over a tile
const tileBase = { ember: '#2f3a4c', cream: '#ffffff' }

const rgb = (h) => {
  const x = h.length === 4 ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h
  return [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16))
}
const lum = (c) => {
  const [r, g, b] = c.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
// resolve `var(--a, var(--b))` against a theme to a hex value
function resolve(expr, t) {
  const m = expr.trim().match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/)
  if (!m) return expr.trim()
  if (m[1] in t) return resolve(t[m[1]], t)
  assert.ok(m[2], `${m[1]} has no value and no fallback`)
  return resolve(m[2], t)
}
const decl = (body, prop) => body.match(new RegExp(`(?:^|[\\s;])${prop}:\\s*([^;]+);`))[1]

test('no colour literals in the touched rules', () => {
  for (const sel of ['.tb-ask-btn', '.tb-ask-input::placeholder']) assert.doesNotMatch(rule(tilesB, sel), /#[0-9a-f]{3,8}\b|rgba?\(/i, sel)
  assert.doesNotMatch(wellbeing.slice(wellbeing.indexOf('.wb-toggle {')).split('/* ── Icon buttons')[0], /#[0-9a-f]{3,8}\b|rgba?\(/i)
})

test('.tb-ask-btn text uses --accent-fg with a fallback valid in every theme, >= 4.5:1', () => {
  const body = rule(tilesB, '.tb-ask-btn')
  assert.match(decl(body, 'color'), /var\(--accent-fg,\s*var\(--on-accent\)\)/)
  for (const [name, t] of Object.entries(themes)) {
    const fg = resolve(decl(body, 'color'), t)
    const bg = resolve(decl(body, 'background'), t)
    assert.ok(ratio(rgb(fg), rgb(bg)) >= 4.5, `${name}: ${fg} on ${bg} = ${ratio(rgb(fg), rgb(bg)).toFixed(2)}`)
  }
})

test('.tb-ask-input placeholder >= 4.5:1 on its fill', () => {
  const body = rule(tilesB, '.tb-ask-input::placeholder')
  assert.match(decl(body, 'opacity'), /^1$/)
  const fills = {
    ember: tileBase.ember, // dark tile-inner is a 6% white wash; check the worse case, the plain tile (white wash only lightens)
    cream: tileBase.cream,
  }
  for (const [name, t] of Object.entries(themes)) {
    const fg = resolve(decl(body, 'color'), t)
    let bg = rgb(fills[name])
    if (name === 'ember') bg = bg.map((v) => v + (255 - v) * 0.06) // tile-inner wash
    assert.ok(ratio(rgb(fg), bg.map(Math.round)) >= 4.5, `${name}: ${fg} on fill = ${ratio(rgb(fg), bg.map(Math.round)).toFixed(2)}`)
  }
})

test('.wb-toggle off state does not use opacity and keeps >= 4.5:1; pressed differs by more than colour', () => {
  assert.doesNotMatch(wellbeing, /\.wb-toggle\[aria-pressed="false"\]\s*\{[^}]*opacity:\s*0?\.\d/)
  const base = rule(wellbeing, '.wb-toggle')
  assert.match(decl(base, 'opacity'), /^1$/)
  for (const [name, t] of Object.entries(themes)) {
    const fg = resolve(decl(base, 'color'), t)
    const bg = resolve('var(--surface)', t)
    assert.ok(ratio(rgb(fg), rgb(bg)) >= 4.5, `${name}: ${fg} on ${bg}`)
  }
  const off = rule(wellbeing, '.wb-toggle[aria-pressed="false"]')
  const on = rule(wellbeing, '.wb-toggle[aria-pressed="true"]')
  assert.match(decl(off, 'border'), /dashed/)
  assert.match(decl(on, 'border'), /solid/)
})
