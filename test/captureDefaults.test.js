import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LAST_TYPE_KEY, defaultCaptureType, screenDefaultType, readLastType, saveLastType,
  initialCaptureState, openCapture, setCaptureType, closeCapture,
} from '../src/capture/captureContext.js'

function memStore(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}
const throwing = {
  getItem() { throw new Error('blocked') },
  setItem() { throw new Error('blocked') },
}

test('fixed defaults per screen', () => {
  const s = memStore({ [LAST_TYPE_KEY]: 'mood' })
  assert.equal(defaultCaptureType({ tab: 'money', view: 'overview' }, s), 'expense')
  assert.equal(defaultCaptureType({ tab: 'money', view: null }, s), 'expense')
  assert.equal(defaultCaptureType({ tab: 'life', view: 'reminders' }, s), 'reminder')
  assert.equal(defaultCaptureType({ tab: 'life', view: 'notes' }, s), 'note')
  assert.equal(defaultCaptureType({ tab: 'life', view: 'tasks' }, s), 'task')
  assert.equal(defaultCaptureType({ tab: 'logic', view: 'code' }, s), 'solve')
  assert.equal(defaultCaptureType({ tab: 'logic', view: null }, s), 'solve')
})

test('elsewhere: last used type, else expense', () => {
  const routes = [
    { tab: 'today', view: null }, { tab: 'life', view: 'habits' }, { tab: 'life', view: null },
    { tab: 'invest', view: 'watch' }, { tab: 'agents', view: null }, undefined,
  ]
  for (const r of routes) {
    assert.equal(screenDefaultType(r), null)
    assert.equal(defaultCaptureType(r, memStore()), 'expense')
    assert.equal(defaultCaptureType(r, memStore({ [LAST_TYPE_KEY]: 'habit' })), 'habit')
  }
})

test('invalid stored value falls back to expense', () => {
  assert.equal(readLastType(memStore({ [LAST_TYPE_KEY]: 'bogus' })), null)
  assert.equal(defaultCaptureType({ tab: 'today' }, memStore({ [LAST_TYPE_KEY]: 'bogus' })), 'expense')
})

test('storage that throws or is missing never breaks', () => {
  assert.equal(defaultCaptureType({ tab: 'today' }, throwing), 'expense')
  assert.equal(saveLastType('note', throwing), false)
  assert.equal(defaultCaptureType({ tab: 'today' }, null), 'expense')
  assert.equal(saveLastType('note', null), false)
})

test('setCaptureType persists the last used type', () => {
  const s = memStore()
  let st = openCapture(initialCaptureState(), { tab: 'today' }, { storage: s })
  assert.equal(st.open, true)
  assert.equal(st.type, 'expense')
  st = setCaptureType(st, 'mood', s)
  assert.equal(st.type, 'mood')
  assert.equal(s.getItem(LAST_TYPE_KEY), 'mood')
  assert.equal(setCaptureType(st, 'nope', s), st)
  assert.equal(openCapture(closeCapture(st), { tab: 'today' }, { storage: s }).type, 'mood')
})

test('open with prefill, explicit type, and close', () => {
  const s = memStore({ [LAST_TYPE_KEY]: 'note' })
  let st = openCapture(initialCaptureState(), { tab: 'money' }, { text: '450 coffee', storage: s })
  assert.deepEqual([st.open, st.type, st.text], [true, 'expense', '450 coffee'])
  st = openCapture(st, { tab: 'money' }, { type: 'mood', storage: s })
  assert.equal(st.type, 'mood')
  assert.equal(st.text, '')
  st = closeCapture(st)
  assert.deepEqual([st.open, st.text], [false, ''])
})
