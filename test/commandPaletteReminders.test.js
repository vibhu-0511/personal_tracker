import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/shell/CommandPalette.jsx', import.meta.url), 'utf8')

test('CommandPalette passes reminders into buildIndex', () => {
  assert.match(src, /buildIndex\(\{[^}]*\breminders\b[^}]*\}\)/)
})

test('reminders come from the Life data context and re-index on change', () => {
  assert.match(src, /useLifeOptional/)
  assert.match(src, /life\?\.reminders/)
  assert.match(src, /\[tasks, notes, reminders\]/)
})
