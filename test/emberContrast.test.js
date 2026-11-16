// E4-19: ember contrast for placeholders, primary button text and form-field borders.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
const ember = read('styles/ember.css')
const styles = read('styles.css')

const emberBlock = ember.slice(ember.indexOf(':root[data-accent="ember"] {'))
const tokens = {}
for (const m of emberBlock.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim()
const resolve = (name) => {
  let v = tokens[name]
  const ref = v && v.match(/^var\((--[\w-]+)\)$/)
  return ref ? resolve(ref[1]) : v
}

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255)
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('ember --on-accent resolves to --accent-fg and reads on --accent', () => {
  assert.equal(tokens['--on-accent'], 'var(--accent-fg)')
  assert.ok(ratio(resolve('--on-accent'), resolve('--accent')) >= 4.5)
})

test('placeholders use --text-secondary and reach 4.5:1 on field backgrounds', () => {
  assert.match(styles, /::placeholder[^{]*\{[^}]*color:\s*var\(--text-secondary\)/)
  const fg = resolve('--text-secondary')
  for (const bg of ['--bg', '--surface', '--surface-raised']) {
    assert.ok(ratio(fg, resolve(bg)) >= 4.5, `placeholder on ${bg}`)
  }
})

test('form fields use --field-border, >= 3:1 against every ember surface', () => {
  assert.match(styles, /input, textarea, select \{[^}]*border:\s*1px solid var\(--field-border, var\(--border\)\)/)
  for (const bg of ['--bg', '--surface', '--surface-raised']) {
    assert.ok(ratio(resolve('--field-border'), resolve(bg)) >= 3, `field border on ${bg}`)
  }
})
