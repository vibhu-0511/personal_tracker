import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// node:test cannot import .jsx, so bundle in memory (react included).
const out = await build({
  stdin: {
    contents: `
      export * from './src/money/MoneyContext.jsx'
      export { createElement } from 'react'
      export { renderToStaticMarkup } from 'react-dom/server'`,
    resolveDir: fileURLToPath(new URL('..', import.meta.url)),
    loader: 'js',
  },
  bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node',
  loader: { '.css': 'empty' },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(process.cwd() + '/');" },
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://localhost.invalid', VITE_SUPABASE_ANON_KEY: 'test' }) },
})
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
const { createElement, renderToStaticMarkup, withNoSpend, clearNoSpendForAdded, MoneyProvider, useMoney } = mod

const ts = (y, m, d) => new Date(y, m - 1, d, 12).getTime()

test('markNoSpend sets dailyLog[day].noSpend and keeps other fields', () => {
  const log = withNoSpend({ '2026-11-14': { puzzle: true } }, '2026-11-14')
  assert.deepEqual(log['2026-11-14'], { puzzle: true, noSpend: true })
  assert.deepEqual(withNoSpend({}, '2026-11-15'), { '2026-11-15': { noSpend: true } })
})

test('adding a transaction that day clears noSpend, other days untouched', () => {
  const log = { '2026-11-14': { noSpend: true, puzzle: true }, '2026-11-13': { noSpend: true } }
  const prev = []
  const next = [{ amount: 5, date: ts(2026, 11, 14), type: 'expense' }]
  const out = clearNoSpendForAdded(log, prev, next)
  assert.deepEqual(out['2026-11-14'], { puzzle: true })
  assert.equal(out['2026-11-13'].noSpend, true)
  assert.equal(clearNoSpendForAdded(log, next, next), log)
})

test('context value includes logStreak and monthStrip', () => {
  let seen
  function Probe() { seen = useMoney(); return null }
  renderToStaticMarkup(createElement(MoneyProvider, null, createElement(Probe)))
  assert.equal(typeof seen.logStreak, 'number')
  assert.ok(Array.isArray(seen.monthStrip))
  assert.equal(typeof seen.markNoSpend, 'function')
})
