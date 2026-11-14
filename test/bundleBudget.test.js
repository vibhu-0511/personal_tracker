import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluate, parseChunk } from '../scripts/ci/bundle-budget.mjs'

const { budgets } = JSON.parse(readFileSync(new URL('../scripts/ci/budgets.json', import.meta.url), 'utf8'))

const files = [
  { name: 'index-DCSpIJZC.js', gzip: 123_780 },
  { name: 'Life-DMXFa43x.js', gzip: 57_240 },
  { name: 'Invest-CiqpJpUQ.js', gzip: 28_140 },
  { name: 'index-DfBu0wiv.css', gzip: 7_870 },
  { name: 'Home-DV2FvQD-.css', gzip: 1_280 },
  { name: 'index.html', gzip: 530 },
]

test('parseChunk strips the hash and ignores non-chunk files', () => {
  assert.deepEqual(parseChunk('Life-DMXFa43x.js'), { prefix: 'Life', type: 'js' })
  assert.deepEqual(parseChunk('confetti.module-DX0toIYy.js'), { prefix: 'confetti.module', type: 'js' })
  assert.deepEqual(parseChunk('Home-DV2FvQD-.css'), { prefix: 'Home', type: 'css' })
  assert.deepEqual(parseChunk('assets/index-DfBu0wiv.css'), { prefix: 'index', type: 'css' })
  assert.equal(parseChunk('index.html'), null)
  assert.equal(parseChunk('vendor.js'), null)
})

test('seeded budgets match the re-baselined numbers (2026-11-14)', () => {
  const kb = Object.fromEntries(budgets.map((b) => [b.name, b.maxKb]))
  assert.deepEqual(kb, { 'entry JS': 135, 'Life chunk': 62, 'total JS': 280, 'entry CSS': 12 })
})

test('evaluate passes when every budget is met', () => {
  const r = evaluate(files, budgets)
  assert.equal(r.ok, true)
  const byName = Object.fromEntries(r.results.map((x) => [x.name, x]))
  assert.equal(byName['entry JS'].actual, 123_780)
  assert.equal(byName['Life chunk'].actual, 57_240)
  assert.equal(byName['total JS'].actual, 123_780 + 57_240 + 28_140)
  assert.equal(byName['entry CSS'].actual, 7_870)
  assert.equal(byName['entry CSS'].limit, 12_000)
})

test('evaluate fails and names the budget when a chunk is over', () => {
  const over = files.map((f) => (f.name.startsWith('Life') ? { ...f, gzip: 62_001 } : f))
  const r = evaluate(over, budgets)
  assert.equal(r.ok, false)
  assert.deepEqual(r.results.filter((x) => !x.ok).map((x) => x.name), ['Life chunk'])
})

test('a size exactly at the limit passes, one byte over fails', () => {
  const rule = [{ name: 'entry JS', type: 'js', match: 'index', maxKb: 135 }]
  assert.equal(evaluate([{ name: 'index-AAAAAAAA.js', gzip: 135_000 }], rule).ok, true)
  assert.equal(evaluate([{ name: 'index-AAAAAAAA.js', gzip: 135_001 }], rule).ok, false)
})

test('total budgets fail when the sum is over even if each chunk is small', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ name: `c${i}-ABCDEFGH.js`, gzip: 28_000 }))
  const r = evaluate(many, [{ name: 'total JS', type: 'js', total: true, maxKb: 270 }])
  assert.equal(r.ok, false)
  assert.equal(r.results[0].actual, 280_000)
})

test('type separates js from css with the same prefix', () => {
  const r = evaluate(
    [{ name: 'index-AAAAAAAA.js', gzip: 100 }, { name: 'index-BBBBBBBB.css', gzip: 99_999 }],
    [{ name: 'entry JS', type: 'js', match: 'index', maxKb: 1 }],
  )
  assert.equal(r.ok, true)
  assert.equal(r.results[0].actual, 100)
})

test('a budget that matches no file fails instead of passing silently', () => {
  const r = evaluate([{ name: 'index-AAAAAAAA.js', gzip: 1 }], [{ name: 'Life chunk', type: 'js', match: 'Life', maxKb: 62 }])
  assert.equal(r.ok, false)
  assert.equal(r.results[0].note, 'no matching files')
})
