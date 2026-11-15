import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { icons } from '../src/ui/icons.js'

// node:test cannot import .jsx, so bundle Nav.jsx in memory. The entry renders
// the nav inside the bundle so React and react-dom/server share one instance.
const out = await build({
  stdin: {
    contents: `
      import { createElement } from 'react'
      import { renderToStaticMarkup } from 'react-dom/server'
      import Nav, { NAV_ITEMS } from './src/shell/Nav.jsx'
      export { NAV_ITEMS }
      export const render = (props) => renderToStaticMarkup(createElement(Nav, props))
    `,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'js',
  },
  bundle: true,
  write: false,
  format: 'cjs',
  jsx: 'automatic',
  platform: 'node',
})
const mod = { exports: {} }
new Function('module', 'exports', 'require', out.outputFiles[0].text)(
  mod, mod.exports, createRequire(import.meta.url),
)
const { NAV_ITEMS, render } = mod.exports

const ORDER = ['today', 'life', 'logic', 'money', 'invest', 'agents']

test('six nav items in order, each with an Icon name', () => {
  assert.deepEqual(NAV_ITEMS.map((i) => i.id), ORDER)
  for (const item of NAV_ITEMS) {
    assert.equal(typeof item.icon, 'string', item.id)
    assert.ok(icons[item.icon], `${item.id} icon "${item.icon}" exists`)
    assert.ok(!/\p{Extended_Pictographic}/u.test(item.icon), `${item.id} icon is not an emoji`)
  }
})

test('rendered tabs use svg icons and labels, no emoji', () => {
  const html = render({ active: 'life' })
  assert.equal((html.match(/class="nav-icon"/g) || []).length, 6)
  assert.equal((html.match(/<svg/g) || []).length, 6)
  assert.equal((html.match(/class="nav-label"/g) || []).length, 6)
  const tabs = html.slice(html.indexOf('nav-list'))
  assert.ok(!/\p{Extended_Pictographic}/u.test(tabs))
})
