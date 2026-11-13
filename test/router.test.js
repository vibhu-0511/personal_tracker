import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ROUTES, TAB_IDS, parseHash, formatHash, parsePath, formatPath,
  isView, defaultView, tabFromLegacyId,
} from '../src/routes.js'

const CANONICAL = [
  ['#/today', { tab: 'today', view: null }],
  ['#/life/tasks', { tab: 'life', view: 'tasks' }],
  ['#/logic/code', { tab: 'logic', view: 'code' }],
  ['#/money/overview', { tab: 'money', view: 'overview' }],
  ['#/invest/learn', { tab: 'invest', view: 'learn' }],
  ['#/agents', { tab: 'agents', view: null }],
]

for (const [hash, route] of CANONICAL) {
  test(`parse/format round-trip ${hash}`, () => {
    assert.deepEqual(parseHash(hash), route)
    assert.equal(formatHash(route), hash)
    assert.equal(formatHash(parseHash(hash)), hash)
  })
}

test('every table entry round-trips', () => {
  for (const tab of TAB_IDS) {
    assert.equal(formatHash(parseHash(`#/${tab}`)), `#/${tab}`)
    for (const view of ROUTES[tab].views) {
      assert.equal(formatHash(parseHash(`#/${tab}/${view}`)), `#/${tab}/${view}`)
    }
  }
})

test('unknown or empty paths fall back to #/today', () => {
  for (const h of ['', '#', '#/', '#/nope', '#/nope/tasks', '#/life2', undefined, null, 42]) {
    assert.deepEqual(parseHash(h), { tab: 'today', view: null }, String(h))
    assert.equal(formatHash(parseHash(h)), '#/today')
  }
  assert.equal(formatHash({ tab: 'bogus', view: 'tasks' }), '#/today')
  assert.equal(formatHash(), '#/today')
})

test('sub-view ids not in the table are rejected', () => {
  assert.equal(isView('life', 'code'), false)
  assert.equal(isView('life', 'bogus'), false)
  assert.equal(isView('today', 'tasks'), false)
  assert.equal(isView('agents', 'x'), false)
  assert.equal(isView('nope', 'tasks'), false)
  assert.deepEqual(parseHash('#/life/bogus'), { tab: 'life', view: null })
  assert.deepEqual(parseHash('#/today/tasks'), { tab: 'today', view: null })
  assert.deepEqual(parseHash('#/money/txns'), { tab: 'money', view: null })
  assert.equal(formatHash({ tab: 'life', view: 'bogus' }), '#/life')
  assert.equal(formatHash({ tab: 'agents', view: 'tasks' }), '#/agents')
})

test('lenient input forms normalise to canonical', () => {
  assert.equal(formatHash(parseHash('#/life/tasks/')), '#/life/tasks')
  assert.equal(formatHash(parseHash('#/Life/Tasks')), '#/life/tasks')
  assert.equal(formatHash(parseHash('#/life/tasks?x=1')), '#/life/tasks')
  assert.equal(formatPath(parsePath('/logic/puzzles')), '/logic/puzzles')
  assert.equal(formatPath(parsePath('logic/puzzles')), '/logic/puzzles')
  assert.deepEqual(parseHash('#/%E0%A4%A'), { tab: 'today', view: null })
})

test('route table shape', () => {
  assert.deepEqual(TAB_IDS, ['today', 'life', 'logic', 'money', 'invest', 'agents'])
  assert.deepEqual(ROUTES.today.views, [])
  assert.deepEqual(ROUTES.agents.views, [])
  assert.equal(ROUTES.money.views.length, 4)
  assert.equal(defaultView('life'), 'tasks')
  assert.equal(defaultView('today'), null)
  assert.equal(defaultView('nope'), null)
  assert.equal(tabFromLegacyId('Expenses'), 'money')
  assert.equal(tabFromLegacyId('LogicBuilding'), 'logic')
  assert.equal(tabFromLegacyId('zzz'), null)
})

test('prototype keys are not treated as tabs', () => {
  assert.deepEqual(parseHash('#/constructor'), { tab: 'today', view: null })
  assert.deepEqual(parseHash('#/__proto__'), { tab: 'today', view: null })
})

// router.js must be importable in node (no window) and navigate() must
// normalise through the table. Stub a minimal window.
test('navigate() writes canonical hashes and ignores junk', async () => {
  const win = {
    location: { hash: '' },
    history: { replaceState: (_s, _t, h) => { win.location.hash = h } },
    addEventListener() {},
    removeEventListener() {},
  }
  globalThis.window = win
  try {
    const { navigate } = await import('../src/router.js')
    navigate('/life/tasks')
    assert.equal(win.location.hash, '#/life/tasks')
    navigate({ tab: 'money', view: 'overview' })
    assert.equal(win.location.hash, '#/money/overview')
    navigate('#/invest/learn', { replace: true })
    assert.equal(win.location.hash, '#/invest/learn')
    navigate('/nope/zzz')
    assert.equal(win.location.hash, '#/today')
    navigate('/life/bogus')
    assert.equal(win.location.hash, '#/life')
  } finally {
    delete globalThis.window
  }
})

test('router.js exports the public API', async () => {
  const m = await import('../src/router.js')
  assert.equal(typeof m.useRoute, 'function')
  assert.equal(typeof m.navigate, 'function')
  assert.equal(typeof m.useSubView, 'function')
})
