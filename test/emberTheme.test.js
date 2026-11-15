import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const app = read('../src/App.jsx')
const store = read('../src/store.js')

// App.jsx is JSX and store.js pulls in browser-only modules, so the real source is
// evaluated in pieces rather than imported.
function themes() {
  const m = app.match(/export const THEMES = (\[[\s\S]*?\n\])/)
  assert.ok(m, 'THEMES not found')
  return new Function(`return ${m[1]}`)()
}

async function getSettings(saved) {
  const m = store.match(/export async function getSettings\(\) \{[\s\S]*?\n\}/)
  assert.ok(m, 'getSettings not found')
  const src = m[0].replace('export async function', 'async function')
  return new Function('getSynced', `${src}\nreturn getSettings()`)(async () => saved)
}

test('THEMES has ember first with chrome #0a0c10', () => {
  const t = themes()
  assert.equal(t[0].id, 'ember')
  assert.equal(t[0].chrome, '#0a0c10')
  assert.ok(t.some((x) => x.id === 'ocean'))
})

test('getSettings defaults new installs to ember', async () => {
  assert.equal((await getSettings({})).theme, 'ember')
})

test('a saved theme is returned unchanged', async () => {
  assert.equal((await getSettings({ theme: 'ocean' })).theme, 'ocean')
})

test('main.jsx imports fonts.css and ember.css', () => {
  const main = read('../src/main.jsx')
  assert.match(main, /styles\/fonts\.css/)
  assert.match(main, /styles\/ember\.css/)
})

test('workbox precaches woff2', () => {
  const m = read('../vite.config.js').match(/globPatterns:\s*\[([^\]]*)\]/)
  assert.ok(m && m[1].includes('woff2'))
})
