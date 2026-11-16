import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { complete, normalizeRepeat } from '../src/life/reminderLogic.js'

// node:test cannot import .jsx, so bundle in memory (react included).
async function load(file) {
  const out = await build({
    entryPoints: [fileURLToPath(new URL(`../src/life/screens/${file}`, import.meta.url))],
    bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node',
    loader: { '.css': 'empty' },
  })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const { default: ReminderInspector } = await load('ReminderInspector.jsx')

// Second bundle with a stub React so the editor can be called as a plain function and its
// element tree inspected (no DOM library in this repo); handlers are then invoked directly.
async function loadStubbed(file) {
  const stub = {
    name: 'stub-react',
    setup(b) {
      b.onResolve({ filter: /^react(\/jsx-runtime)?$/ }, (a) => ({ path: a.path, namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
        loader: 'js',
        contents: a.path === 'react'
          ? 'export const useState = (v) => [typeof v === "function" ? v() : v, () => {}]'
          : 'export const jsx = (type, props, key) => ({ type, props, key }); export const jsxs = jsx; export const Fragment = "fragment"',
      }))
    },
  }
  const out = await build({
    entryPoints: [fileURLToPath(new URL(`../src/life/screens/${file}`, import.meta.url))],
    bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node',
    loader: { '.css': 'empty' }, plugins: [stub],
  })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const { default: StubInspector } = await loadStubbed('ReminderInspector.jsx')

// Monday 2026-11-16 09:00 local.
const AT = new Date(2026, 10, 16, 9, 0).getTime()
const noop = () => {}

function render(repeat, onRepeat = noop) {
  const reminder = { id: 'r1', title: 'Water plants', at: AT, done: false, repeat }
  const el = StubInspector({ reminder, onChange: noop, onReschedule: noop, onRepeat, onSnooze: noop, onToggle: noop, onDelete: noop })
  // Walk the element tree through the keyed ReminderEditor to its rendered output.
  return el.type(el.props)
}

function findAll(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { node.forEach((n) => findAll(n, pred, out)); return out }
  if (pred(node)) out.push(node)
  findAll(node.props?.children, pred, out)
  return out
}

const dayButtons = (t) => findAll(t, (n) => n.type === 'button' && n.props['data-day'] !== undefined)
const pressed = (t) => dayButtons(t).filter((n) => n.props['aria-pressed'] === true).map((n) => n.props['data-day'])

test('weekday buttons only show for Weekly, with aria-pressed on the chosen days', () => {
  assert.equal(dayButtons(render({ type: 'daily' })).length, 0)
  assert.equal(dayButtons(render('none')).length, 0)
  const weekly = render({ type: 'weekly', days: [1, 3] })
  assert.equal(dayButtons(weekly).length, 7)
  assert.deepEqual(pressed(weekly), [1, 3])
  assert.ok(dayButtons(weekly).every((n) => typeof n.props['aria-pressed'] === 'boolean'))
})

test('weekly without saved days preselects the weekday of the reminder time', () => {
  assert.deepEqual(pressed(render('weekly')), [1]) // AT is a Monday
})

test('toggling saves {type:weekly, days} sorted, and the last day cannot be cleared', () => {
  const calls = []
  const tree = render({ type: 'weekly', days: [1, 3] }, (id, r) => calls.push([id, r]))
  const btn = (t, d) => findAll(t, (n) => n.type === 'button' && n.props['data-day'] === d)[0]
  btn(tree, 5).props.onClick()
  btn(tree, 1).props.onClick()
  assert.deepEqual(calls, [
    ['r1', { type: 'weekly', days: [1, 3, 5] }],
    ['r1', { type: 'weekly', days: [3] }],
  ])
  for (const [, r] of calls) assert.deepEqual(normalizeRepeat(r), r)

  const single = []
  const t2 = render({ type: 'weekly', days: [3] }, (id, r) => single.push(r))
  btn(t2, 3).props.onClick()
  assert.deepEqual(single, [])
})

test('choosing Weekly in the select saves the reminder weekday as the only day', () => {
  const calls = []
  const tree = render({ type: 'none' }, (id, r) => calls.push(r))
  const select = findAll(tree, (n) => n.type === 'select')[0]
  select.props.onChange({ target: { value: 'weekly' } })
  select.props.onChange({ target: { value: 'daily' } })
  assert.deepEqual(calls, [{ type: 'weekly', days: [1] }, { type: 'daily' }])
})

test('completing lands on the next chosen weekday', () => {
  const repeat = { type: 'weekly', days: [3, 5] } // Wed, Fri
  const r = complete({ id: 'r1', title: 'x', at: AT, repeat }, AT)
  assert.equal(new Date(r.at).getDay(), 3)
  assert.equal(new Date(r.at).getDate(), 18)
  const r2 = complete(r, r.at)
  assert.equal(new Date(r2.at).getDay(), 5)
  const r3 = complete(r2, r2.at)
  assert.equal(new Date(r3.at).getDay(), 3)
  assert.equal(new Date(r3.at).getDate(), 25)
})

test('weekday buttons reuse the 44px coarse-pointer chip rule', () => {
  const css = readFileSync(new URL('../src/life/reminders.css', import.meta.url), 'utf8')
  const coarse = css.slice(css.indexOf('@media (pointer: coarse)'))
  assert.match(coarse, /\.rem-chip[^{]*\{[^}]*min-height: 44px/)
  const src = readFileSync(new URL('../src/life/screens/ReminderInspector.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgb\(/)
})
