import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const life = readFileSync(new URL('../src/tabs/Life.jsx', import.meta.url), 'utf8')

test('App imports LifeDataProvider', () => {
  assert.match(app, /import \{ LifeDataProvider \} from '\.\/life\/LifeData\.jsx'/)
})

test('CommandPalette renders inside a LifeDataProvider, fed the Life sync tick', () => {
  const open = app.indexOf('<LifeDataProvider')
  const close = app.indexOf('</LifeDataProvider>')
  const palette = app.indexOf('<CommandPalette')
  assert.ok(open > -1 && close > open, 'provider element present')
  assert.ok(palette > open && palette < close, 'palette is inside the provider')
  assert.match(app.slice(open, open + 80), /syncTick=\{syncTicks\.Life \|\| 0\}/)
})

test('App mounts exactly one provider and Life reuses it', () => {
  assert.equal((app.match(/<LifeDataProvider/g) || []).length, 1)
  assert.match(life, /useLifeOptional\(\)/)
  assert.match(life, /shared \? body :/)
})
