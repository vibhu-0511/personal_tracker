import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const jsx = readFileSync(new URL('../src/capture/CaptureSheet.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/capture/capture.css', import.meta.url), 'utf8')

const rules = (sel) => css.split('}').filter((r) => r.split('{')[0].includes(sel))

test('CaptureSheet.jsx has no inline style props', () => {
  assert.equal(/style=\{\{/.test(jsx), false)
})

test('capture.css defines chip, editor and panel host classes', () => {
  for (const sel of ['.capture-chip', '.capture-editor', '.capture-panel-host']) {
    assert.ok(rules(sel).length > 0, `${sel} missing`)
  }
})

test('capture.css uses tokens only (no colour literals)', () => {
  assert.equal(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/.test(css), false)
})

test('accent foreground always has a fallback', () => {
  assert.equal(/var\(--accent-fg\)/.test(css), false)
})

test('chips reach 44px under coarse pointers', () => {
  const coarse = css.slice(css.indexOf('(pointer: coarse)'))
  assert.match(coarse, /\.capture-chip[^}]*min-height:\s*44px/)
})
