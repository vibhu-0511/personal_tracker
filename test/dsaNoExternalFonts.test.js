import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../public/dsa/mastery-map.html', import.meta.url), 'utf8')

test('mastery map page makes no request to Google Fonts hosts', () => {
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/)
})

test('mastery map page has no external stylesheet or @import', () => {
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["'][^>]+href=["']https?:/i)
  assert.doesNotMatch(html, /@import\s+url\(\s*['"]?https?:/i)
})

test('mastery map page no longer names the web fonts it used to load', () => {
  assert.doesNotMatch(html, /JetBrains Mono|Space Grotesk/)
})
