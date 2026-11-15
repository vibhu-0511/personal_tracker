import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { icons } from '../src/ui/icons.js'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// node:test cannot import .jsx, so bundle Icon.jsx in memory (react included).
const out = await build({
  entryPoints: [fileURLToPath(new URL('../src/ui/Icon.jsx', import.meta.url))],
  bundle: true,
  write: false,
  format: 'esm',
  jsx: 'automatic',
  platform: 'node',
})
const Icon = (await import(
  'data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64')
)).default

const NAMES = ['today', 'life', 'logic', 'money', 'invest', 'agents', 'plus', 'bell', 'note', 'check',
  'clock', 'pin', 'calendar', 'repeat', 'search', 'mic', 'list', 'up', 'face', 'close']

test('icons exports exactly the 20 names, each a path string', () => {
  assert.deepEqual(Object.keys(icons).sort(), [...NAMES].sort())
  for (const n of NAMES) {
    assert.equal(typeof icons[n], 'string', n)
    assert.match(icons[n], /^[Mm]/, n)
    assert.doesNotMatch(icons[n], /#|rgb|hsl/i, n)
  }
})

test('Icon is aria-hidden without a label', () => {
  const html = renderToStaticMarkup(createElement(Icon, { name: 'bell' }))
  assert.match(html, /aria-hidden="true"/)
  assert.match(html, /viewBox="0 0 24 24"/)
  assert.match(html, /stroke="currentColor"/)
  assert.doesNotMatch(html, /aria-label/)
})

test('Icon with a label is an image with that name', () => {
  const html = renderToStaticMarkup(createElement(Icon, { name: 'bell', label: 'Reminders' }))
  assert.match(html, /role="img"/)
  assert.match(html, /aria-label="Reminders"/)
  assert.doesNotMatch(html, /aria-hidden/)
})

test('Icon renders nothing for an unknown name', () => {
  assert.equal(renderToStaticMarkup(createElement(Icon, { name: 'nope' })), '')
})
