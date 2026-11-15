// Run: node --test test/captureEditors.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

async function load(file) {
  const out = await build({
    stdin: {
      contents: `export * from ${JSON.stringify(fileURLToPath(new URL(file, new URL('../src/capture/editors/', import.meta.url))))}
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
export const render = (C, props) => renderToStaticMarkup(createElement(C, props))`,
      resolveDir: fileURLToPath(new URL('../src/capture/editors/', import.meta.url)), loader: 'js',
    },
    bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node',
    loader: { '.css': 'empty' },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(process.cwd() + '/x.js');" },
  })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const ed = await load('./index.js')
const render = ed.render
const { sortCategories, whenPresets, parseAmount } = ed
const { toLocalInput, fromLocalInput, saturdayTenAM } = await load('./logic.js')

test('sortCategories: all 12, recent first, rest in catalogue order', () => {
  const s = sortCategories(['coffee', 'bogus', 'travel', 'coffee']).map((c) => c.id)
  assert.equal(s.length, 12)
  assert.deepEqual(s.slice(0, 3), ['coffee', 'travel', 'food'])
  assert.equal(new Set(s).size, 12)
})

test('CategoryPicker renders 12 buttons in recent order with pressed state', () => {
  const html = render(ed.CategoryPicker, { value: 'coffee', recent: ['coffee'] })
  assert.equal((html.match(/<button/g) || []).length, 12)
  assert.match(html, /^<div[^>]*>\s*<div[^>]*><button[^>]*data-cat="coffee"[^>]*aria-pressed="true"/)
})

test('whenPresets: Tonight 8 PM, Tomorrow 9 AM, Sat 10 AM', () => {
  const now = new Date(2026, 10, 15, 14, 0) // Sun
  const [a, b, c] = whenPresets(now)
  assert.deepEqual([a.label, b.label, c.label], ['Tonight 8 PM', 'Tomorrow 9 AM', 'Sat 10 AM'])
  assert.equal(a.at, new Date(2026, 10, 15, 20).getTime())
  assert.equal(b.at, new Date(2026, 10, 16, 9).getTime())
  assert.equal(c.at, new Date(2026, 10, 21, 10).getTime())
  assert.equal(saturdayTenAM(new Date(2026, 10, 21, 9)), new Date(2026, 10, 21, 10).getTime())
  assert.equal(saturdayTenAM(new Date(2026, 10, 21, 11)), new Date(2026, 10, 28, 10).getTime())
})

test('WhenPicker offers the four options', () => {
  const html = render(ed.WhenPicker, { value: null, now: new Date(2026, 10, 15, 14) })
  for (const t of ['Tonight 8 PM', 'Tomorrow 9 AM', 'Sat 10 AM', 'Pick a time']) assert.ok(html.includes(t), t)
})

test('local input round trip', () => {
  const t = new Date(2026, 10, 16, 18, 5).getTime()
  assert.equal(toLocalInput(t), '2026-11-16T18:05')
  assert.equal(fromLocalInput('2026-11-16T18:05'), t)
  assert.equal(fromLocalInput(''), null)
})

test('parseAmount', () => {
  assert.equal(parseAmount('₹1,250.50'), 1250.5)
  for (const bad of ['', '0', '-3', '1.234', 'abc', '10000001', '.']) assert.equal(parseAmount(bad), null, bad)
})

test('RepeatPicker, PersonPicker, AmountEditor render', () => {
  const r = render(ed.RepeatPicker, { value: { type: 'weekly', days: [1] } })
  assert.match(r, /Never/); assert.equal((r.match(/cap-ed-day/g) || []).length, 7)
  assert.match(render(ed.PersonPicker, { value: 'Raj', people: ['Raj'] }), /No one/)
  assert.match(render(ed.AmountEditor, { value: 450 }), /value="450"/)
})

test('css: tokens only, 44px coarse targets, focus-visible', () => {
  const css = readFileSync(fileURLToPath(new URL('../src/capture/editors/editors.css', import.meta.url)), 'utf8')
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-height: 44px/)
  assert.match(css, /:focus-visible/)
})
