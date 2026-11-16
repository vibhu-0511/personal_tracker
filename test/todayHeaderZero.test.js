import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// node:test cannot import .jsx, so bundle in memory (react included).
async function load(file) {
  const out = await build({
    entryPoints: [fileURLToPath(new URL(`../src/today/${file}`, import.meta.url))],
    bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node',
    loader: { '.css': 'empty' },
  })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const { default: TodayHeader } = await load('TodayHeader.jsx')
const { computeDailies } = await load('dailies.js')
const now = new Date(2026, 10, 15)

test('computeDailies with all five unticked gives total 0', () => {
  const r = computeDailies({ settings: { dailies: [] } }, now.getTime())
  assert.equal(r.total, 0)
  assert.equal(r.done, 0)
})

test('header with total 0 has no NaN/Infinity and says None enabled', () => {
  const { done, total } = computeDailies({ settings: { dailies: [] } }, now.getTime())
  const html = renderToStaticMarkup(createElement(TodayHeader, { now, streak: 3, done, total }))
  assert.doesNotMatch(html, /NaN|Infinity/)
  assert.match(html, /None enabled/)
  assert.doesNotMatch(html, /0\/0|viz-ring/)
})

test('header survives junk done/total', () => {
  for (const props of [{ done: 5, total: 0 }, { done: NaN, total: NaN }, { done: undefined, total: undefined }]) {
    const html = renderToStaticMarkup(createElement(TodayHeader, { now, ...props }))
    assert.doesNotMatch(html, /NaN|Infinity/)
    assert.match(html, /None enabled/)
  }
})

test('header with dailies still shows the ring', () => {
  const html = renderToStaticMarkup(createElement(TodayHeader, { now, done: 3, total: 5 }))
  assert.match(html, /3\/5/)
  assert.doesNotMatch(html, /None enabled/)
})

test('source guards the division by total', () => {
  const src = readFileSync(new URL('../src/today/TodayHeader.jsx', import.meta.url), 'utf8')
  assert.match(src, /t === 0/)
})
