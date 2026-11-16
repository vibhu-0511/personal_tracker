import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

function declarations(selector) {
  const out = {}
  for (let i = css.indexOf(selector + ' {'); i >= 0; i = css.indexOf(selector + ' {', i + 1)) {
    for (const m of css.slice(i, css.indexOf('}', i)).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  }
  return out
}
const root = declarations(':root')
// shared light-family block first, then the cream block (later wins)
const tokens = { ...declarations(':root[data-accent="sky"],\n:root[data-accent="cream"]'), ...declarations(':root[data-accent="cream"]') }
const t = (k) => tokens[k] ?? root[k]

const rgb = (v) => {
  v = v.replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i, '#$1$1$2$2$3$3')
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
const SURFACES = ['--bg', '--surface', '--surface-raised']

test('cream: text tokens on their tinted fills reach 4.5:1 on every surface', () => {
  for (const [fg, dim] of [['--accent', '--accent-dim'], ['--success', '--success-dim']]) {
    for (const s of SURFACES) {
      const r = ratio(rgb(t(fg)), over(rgb(t(dim)), rgb(t(s))))
      assert.ok(r >= 4.5, `${fg} on ${dim} over ${s}: ${r.toFixed(2)}`)
    }
  }
})

test('cream: muted text on tinted fills reaches 4.5:1', () => {
  for (const dim of ['--accent-dim', '--success-dim']) {
    for (const s of SURFACES) {
      const r = ratio(rgb(t('--text-secondary')), over(rgb(t(dim)), rgb(t(s))))
      assert.ok(r >= 4.5, `--text-secondary on ${dim} over ${s}: ${r.toFixed(2)}`)
    }
  }
})

test('cream: accent-fg and on-accent on accent fills reach 4.5:1', () => {
  for (const fg of ['--accent-fg', '--on-accent']) {
    for (const bg of ['--accent', '--accent-solid', '--accent-hover']) {
      const r = ratio(rgb(t(fg)), rgb(t(bg)))
      assert.ok(r >= 4.5, `${fg} on ${bg}: ${r.toFixed(2)}`)
    }
  }
})

test('cream: form-field border reaches 3:1 against surface and bg', () => {
  for (const s of ['--surface', '--bg']) {
    const r = ratio(rgb(t('--field-border')), rgb(t(s)))
    assert.ok(r >= 3, `--field-border on ${s}: ${r.toFixed(2)}`)
  }
  assert.match(css, /:root\[data-accent="cream"\] textarea/)
})
