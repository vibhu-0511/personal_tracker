import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parsePath, formatPath, isView } from '../src/routes.js'
import { LIFE_VIEWS, DEFAULT_LIFE_VIEW } from '../src/life/views.js'

test('every Life view is a valid route view and round-trips through the path', () => {
  for (const v of LIFE_VIEWS) {
    assert.ok(isView('life', v.id), v.id)
    assert.equal(formatPath({ tab: 'life', view: v.id }), v.path)
    assert.deepEqual(parsePath(`#${v.path}`), { tab: 'life', view: v.id })
  }
})

test('deep links to reminders and notes parse to those views', () => {
  assert.equal(parsePath('#/life/reminders').view, 'reminders')
  assert.equal(parsePath('#/life/notes').view, 'notes')
  assert.equal(parsePath('#/life').view, null)
  assert.equal(DEFAULT_LIFE_VIEW, 'tasks')
})

test('App passes the route view and change handler to Life', () => {
  const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  assert.match(src, /useSubView\('life', 'tasks'\)/)
  assert.match(src, /<Life [^>]*view=\{lifeView\}[^>]*onViewChange=\{setLifeView\}/)
})
