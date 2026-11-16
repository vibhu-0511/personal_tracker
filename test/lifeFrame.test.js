import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// node:test cannot import .jsx, so bundle in memory (react included), like segDots.test.js.
// Life.jsx reaches supabaseClient.js through the store; it throws without VITE_* keys, so the
// bundle gets an empty stub instead (nothing here talks to the network).
const stubSupabase = {
  name: 'stub-supabase',
  setup(b) {
    b.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({ path: 'supabase-stub', namespace: 'stub' }))
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {}', loader: 'js' }))
  },
}
async function load(rel, contents) {
  const entry = fileURLToPath(new URL(rel, import.meta.url))
  const out = await build({
    // `contents` (optional) is a wrapper entry, so React and the component share one copy.
    ...(contents
      ? { stdin: { contents: contents.replaceAll('%ENTRY%', JSON.stringify(entry)), resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'jsx' } }
      : { entryPoints: [entry] }),
    bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node',
    loader: { '.css': 'empty' },
    logLevel: 'silent',
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(" + JSON.stringify(import.meta.url) + ");" },
    plugins: [stubSupabase],
    define: { 'import.meta.env': '{}' },
  })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const { lifeChipItems, lifeHeaderLine } = await load('../src/tabs/Life.jsx')
const { renderChips } = await load('../src/ui/SubNav.jsx', `
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SubNav from %ENTRY%
export const renderChips = (items, value) =>
  renderToStaticMarkup(createElement(SubNav, { items, value, label: 'Life sections' }))
`)
const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

test('chips are Tasks, Reminders, Notes with counts, then Habits and Growth without', () => {
  const items = lifeChipItems({ tasks: 4, reminders: 2, notes: 9 })
  assert.deepEqual(items.map((i) => i.id), ['tasks', 'reminders', 'notes', 'habits', 'growth'])
  assert.deepEqual(items.map((i) => i.count), [4, 2, 9, null, null])
  const html = renderChips(items, 'tasks')
  assert.equal((html.match(/ui-subnav-count/g) || []).length, 3)
  assert.match(html, /Tasks<\/span><span class="ui-subnav-count">4</)
  assert.match(html, /Notes<\/span><span class="ui-subnav-count">9</)
  assert.doesNotMatch(html, /Habits<\/span><span class="ui-subnav-count"/)
})

test('a zero count still shows', () => {
  assert.equal(lifeChipItems({ tasks: 0, reminders: 0, notes: 0 })[0].count, 0)
})

test('header line is the wallet in rupees and the level', () => {
  assert.equal(lifeHeaderLine(4820, 7), '₹4,820 · LV 7')
  assert.equal(lifeHeaderLine(undefined, 1), '₹0 · LV 1')
})

test('Life renders the header first and exactly one chip bar below it; App renders none', () => {
  const life = read('../src/tabs/Life.jsx')
  assert.equal((life.match(/<SubNav\b/g) || []).length, 1)
  assert.ok(life.indexOf('className="life-head"') < life.indexOf('<SubNav'))
  assert.doesNotMatch(read('../src/App.jsx'), /<SubNav\b/)
})

test('header CSS uses no hex colours', () => {
  const css = read('../src/life/life.css')
  const rules = css.match(/\.life-(?:head|title|head-line)[^{]*\{[^}]*\}/g) || []
  assert.ok(rules.length >= 3)
  for (const r of rules) assert.doesNotMatch(r, /#[0-9a-fA-F]{3,8}\b/)
})
