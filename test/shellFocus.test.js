// The plus button must stay mounted while the capture sheet is open, so the
// focus-return ref in App.jsx never holds a detached node (E3-12).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/shell/Shell.jsx', import.meta.url), 'utf8')
const code = src.replace(/^\s*\/\/.*$/gm, '')

test('Shell renders the Fab unconditionally', () => {
  assert.match(code, /<Fab\b/)
  assert.doesNotMatch(code, /captureOpen\s*&&/)
  assert.doesNotMatch(code, /!\s*captureOpen/)
})

test('shell.css hides the Fab under an open dialog', () => {
  const css = readFileSync(new URL('../src/styles/shell.css', import.meta.url), 'utf8')
  assert.match(css, /dialog\[open\]\)\s*\.ui-fab\s*\{\s*display:\s*none/)
})
