import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// node:test cannot import .jsx, so bundle in memory (react included).
async function load(file) {
  const out = await build({
    entryPoints: [fileURLToPath(new URL(`../src/ui/${file}`, import.meta.url))],
    bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node',
    loader: { '.css': 'empty' },
  })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const { default: SegDots, segStates } = await load('SegDots.jsx')
const { default: DailyCell } = await load('DailyCell.jsx')

test('segStates maps filled/empty and clamps', () => {
  assert.deepEqual(segStates(2, 4), [true, true, false, false])
  assert.deepEqual(segStates(9, 3), [true, true, true])
  assert.deepEqual(segStates(-1, 2), [false, false])
  assert.deepEqual(segStates(0, 0), [])
})

test('SegDots renders one square per day with aria-label', () => {
  const html = renderToStaticMarkup(createElement(SegDots, { filled: 13, total: 15 }))
  assert.match(html, /aria-label="13 of 15 days logged"/)
  assert.equal((html.match(/data-filled="true"/g) || []).length, 13)
  assert.equal((html.match(/data-filled="false"/g) || []).length, 2)
})

test('DailyCell done shows a check glyph, open does not', () => {
  const done = renderToStaticMarkup(createElement(DailyCell, { label: 'Habits', value: '3/3', done: true }))
  const open = renderToStaticMarkup(createElement(DailyCell, { label: 'Puzzle', value: 'Open' }))
  assert.match(done, /data-state="done"/)
  assert.match(done, /✓/)
  assert.match(open, /data-state="open"/)
  assert.doesNotMatch(open, /✓/)
})
