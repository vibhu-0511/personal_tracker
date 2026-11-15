import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createRegistry, filterCommands, matchShortcut, isTypingTarget, navigationCommands,
} from '../src/shell/commands.js'
import { TAB_IDS } from '../src/routes.js'

const key = (k, extra = {}) => ({ key: k, target: { tagName: 'BODY' }, ...extra })

test('registry: register, run, list, unregister', () => {
  const r = createRegistry()
  let ran = 0
  const off = r.register({ id: 'new', label: 'New task', run: () => { ran++ } })
  assert.equal(r.has('new'), true)
  assert.deepEqual(r.list().map((c) => c.id), ['new'])
  assert.equal(r.run('new'), true)
  assert.equal(ran, 1)
  off()
  assert.equal(r.has('new'), false)
  assert.equal(r.run('new'), false)
  assert.deepEqual(r.list(), [])
})

test('registry: unregister by id, replacement, stale unregister is a no-op', () => {
  const r = createRegistry()
  const calls = []
  const offA = r.register({ id: 'new', label: 'A', run: () => calls.push('a') })
  r.register({ id: 'new', label: 'B', run: () => calls.push('b') })
  offA() // A was replaced by B, so this must not remove B
  assert.equal(r.has('new'), true)
  r.run('new')
  assert.deepEqual(calls, ['b'])
  assert.equal(r.unregister('new'), true)
  assert.equal(r.unregister('new'), false)
})

test('registry: validates input, notifies subscribers, list is stable between changes', () => {
  const r = createRegistry()
  assert.throws(() => r.register({ label: 'x', run() {} }))
  assert.throws(() => r.register({ id: 'x' }))
  let n = 0
  const unsub = r.subscribe(() => { n++ })
  r.register({ id: 'a', label: 'A', run() {} })
  const snap = r.list()
  assert.equal(r.list(), snap)
  r.unregister('a')
  assert.equal(n, 2)
  unsub()
  r.register({ id: 'b', label: 'B', run() {} })
  assert.equal(n, 2)
})

test('registry: passes arguments to run', () => {
  const r = createRegistry()
  let got
  r.register({ id: 'x', label: 'X', run: (...a) => { got = a } })
  r.run('x', 1, 2)
  assert.deepEqual(got, [1, 2])
})

test('filterCommands: empty query keeps order', () => {
  const cmds = [{ label: 'Zebra' }, { label: 'Apple' }]
  assert.deepEqual(filterCommands(cmds, '').map((c) => c.label), ['Zebra', 'Apple'])
  assert.deepEqual(filterCommands(cmds, '   ').map((c) => c.label), ['Zebra', 'Apple'])
})

test('filterCommands: ranks exact > prefix > word start > substring > subsequence', () => {
  const cmds = [
    { label: 'Add transaction' },   // no t-s-k in order
    { label: 'Open tasks list' },   // word-start "tasks"
    { label: 'Retasks' },           // substring inside a word
    { label: 'Tasks' },             // exact
    { label: 'Tasks overview' },    // prefix
    { label: 'Time spent on kitchen' }, // subsequence only for "tsk"
  ]
  const out = filterCommands(cmds, 'tasks').map((c) => c.label)
  assert.deepEqual(out, ['Tasks', 'Tasks overview', 'Open tasks list', 'Retasks'])
  const sub = filterCommands(cmds, 'tsk').map((c) => c.label)
  assert.ok(sub.includes('Time spent on kitchen'))
  assert.ok(!sub.includes('Add transaction'))
})

test('filterCommands: case-insensitive, drops non-matches, keywords rank below label hits', () => {
  const cmds = [
    { label: 'Go to Money', keywords: ['finance', 'spend'] },
    { label: 'Spend less', keywords: [] },
  ]
  assert.deepEqual(filterCommands(cmds, 'SPEND').map((c) => c.label), ['Spend less', 'Go to Money'])
  assert.deepEqual(filterCommands(cmds, 'zzz'), [])
})

test('filterCommands: ties keep registration order (stable)', () => {
  const cmds = [{ label: 'Go to Life' }, { label: 'Go to Logic' }, { label: 'Go to Money' }]
  assert.deepEqual(filterCommands(cmds, 'go to').map((c) => c.label), ['Go to Life', 'Go to Logic', 'Go to Money'])
})

test('navigationCommands: one per tab, in tab order, runs go() with the tab', () => {
  const seen = []
  const cmds = navigationCommands((to) => seen.push(to))
  assert.equal(cmds.length, TAB_IDS.length)
  cmds.forEach((c) => c.run())
  assert.deepEqual(seen, TAB_IDS.map((tab) => ({ tab })))
  assert.equal(cmds[0].hint, '⌘1')
})

test('matchShortcut: Cmd+K and Ctrl+K open the palette', () => {
  assert.deepEqual(matchShortcut(key('k', { metaKey: true })), { type: 'palette' })
  assert.deepEqual(matchShortcut(key('k', { ctrlKey: true })), { type: 'palette' })
  assert.deepEqual(matchShortcut(key('K', { metaKey: true })), { type: 'palette' })
  assert.equal(matchShortcut(key('k')), null)
  assert.equal(matchShortcut(key('k', { metaKey: true, shiftKey: true })), null)
  assert.equal(matchShortcut(key('k', { metaKey: true, altKey: true })), null)
})

test('matchShortcut: Cmd+1..6 pick the six tabs in order, 7..9 and 0 do nothing', () => {
  for (let i = 1; i <= 6; i++) {
    assert.deepEqual(
      matchShortcut(key(String(i), { metaKey: true })),
      { type: 'tab', tab: TAB_IDS[i - 1], index: i - 1 },
    )
  }
  assert.equal(TAB_IDS[0], 'today')
  assert.equal(matchShortcut(key('7', { metaKey: true })), null)
  assert.equal(matchShortcut(key('0', { metaKey: true })), null)
  assert.equal(matchShortcut(key('1')), null)
})

test('matchShortcut: N and X map to the new and complete commands', () => {
  assert.deepEqual(matchShortcut(key('n')), { type: 'command', id: 'new' })
  assert.deepEqual(matchShortcut(key('N')), { type: 'command', id: 'new' })
  assert.deepEqual(matchShortcut(key('x')), { type: 'command', id: 'complete' })
  assert.equal(matchShortcut(key('n', { shiftKey: true })), null)
  assert.equal(matchShortcut(key('n', { altKey: true })), null)
  assert.equal(matchShortcut(key('n', { repeat: true })), null)
  assert.equal(matchShortcut(key('q')), null)
})

test('matchShortcut: Cmd+N / Cmd+X are not hijacked', () => {
  assert.equal(matchShortcut(key('n', { metaKey: true })), null)
  assert.equal(matchShortcut(key('x', { ctrlKey: true })), null)
})

test('matchShortcut: plain keys are ignored while typing in input, textarea, select', () => {
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) {
    const target = { tagName }
    assert.equal(matchShortcut({ key: 'n', target }), null, tagName)
    assert.equal(matchShortcut({ key: 'x', target }), null, tagName)
  }
  assert.equal(matchShortcut({ key: 'n', target: { tagName: 'DIV', isContentEditable: true } }), null)
  assert.equal(matchShortcut({ key: 'n', target: { tagName: 'BUTTON' } })?.id, 'new')
})

test('matchShortcut: Cmd+K and Cmd+digit still work inside a text field', () => {
  const target = { tagName: 'INPUT' }
  assert.deepEqual(matchShortcut({ key: 'k', metaKey: true, target }), { type: 'palette' })
  assert.equal(matchShortcut({ key: '2', ctrlKey: true, target })?.tab, TAB_IDS[1])
})

test('matchShortcut: charKeys:false disables N and X only; defaultPrevented and IME are skipped', () => {
  assert.equal(matchShortcut(key('n'), { charKeys: false }), null)
  assert.equal(matchShortcut(key('x'), { charKeys: false }), null)
  assert.deepEqual(matchShortcut(key('k', { metaKey: true }), { charKeys: false }), { type: 'palette' })
  assert.equal(matchShortcut(key('n', { defaultPrevented: true })), null)
  assert.equal(matchShortcut(key('n', { isComposing: true })), null)
  assert.equal(matchShortcut(null), null)
})

test('isTypingTarget', () => {
  assert.equal(isTypingTarget(null), false)
  assert.equal(isTypingTarget({ tagName: 'DIV' }), false)
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true)
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true)
})
