import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(new URL('../src/styles/fonts.css', import.meta.url), 'utf8')
const blocks = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1])
const get = (b, prop) => b.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`))?.[1].trim()

const EXPECTED = {
  'Space Grotesk': '500 700',
  Inter: '400 700',
  'JetBrains Mono': '500',
}

test('one latin-subset face per family with the DESIGN.md weights', () => {
  assert.equal(blocks.length, 3)
  const seen = {}
  for (const b of blocks) {
    const family = get(b, 'font-family').replace(/['"]/g, '')
    seen[family] = get(b, 'font-weight')
  }
  assert.deepEqual(seen, EXPECTED)
})

test('every face uses font-display: swap', () => {
  for (const b of blocks) assert.equal(get(b, 'font-display'), 'swap')
})

test('only local latin woff2 files, no remote hosts', () => {
  assert.doesNotMatch(css, /googleapis|gstatic|https?:/)
  for (const b of blocks) {
    const url = get(b, 'src').match(/url\(['"]?([^'")]+)['"]?\)/)[1]
    assert.match(url, /^@fontsource-variable\/[a-z-]+\/files\/[a-z-]+-latin-wght-normal\.woff2$/)
  }
})

test('woff2 files exist and total under 160 kB', () => {
  let total = 0
  for (const b of blocks) {
    const url = get(b, 'src').match(/url\(['"]?([^'")]+)['"]?\)/)[1]
    total += statSync(resolve('node_modules', url)).size
  }
  assert.ok(total < 160_000, `fonts total ${total} B`)
})
