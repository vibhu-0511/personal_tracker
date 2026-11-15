import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

// node:test cannot import .jsx, so bundle in memory (react included).
async function load(file) {
  const out = await build({
    stdin: {
      // render lives in the same bundle so React is loaded once
      contents: `export * from ${JSON.stringify(fileURLToPath(new URL(`../src/capture/${file}`, import.meta.url)))}
${file.endsWith(".jsx") ? `export { default } from ${JSON.stringify(fileURLToPath(new URL(`../src/capture/${file}`, import.meta.url)))}` : ""}
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
export const render = (C, props) => renderToStaticMarkup(createElement(C, props))`,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js',
    },
    bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node',
    loader: { '.css': 'empty' },
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(process.cwd() + '/x.js');" },
  })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const sheet = await load('CaptureSheet.jsx')
const { sheetReducer, initialSheetState, effectiveDraft, editableChips, finishCapture, savedMessage } = sheet
const { submitDraft } = await load('submit.js')

const NOW = new Date(2026, 10, 15, 12, 0, 0)

test('reducer: type change clears editor and error, text keeps overrides', () => {
  let s = initialSheetState('expense')
  s = sheetReducer(s, { type: 'setText', text: '450 coffee' })
  s = sheetReducer(s, { type: 'openEditor', key: 'date' })
  assert.equal(s.editor, 'when')
  s = sheetReducer(s, { type: 'override', patch: { person: 'Raj' } })
  s = sheetReducer(s, { type: 'failed', error: 'boom' })
  assert.equal(s.error, 'boom')
  assert.equal(s.busy, false)
  s = sheetReducer(s, { type: 'setText', text: '450 coffee x' })
  assert.equal(s.error, '')
  assert.equal(s.overrides.person, 'Raj')
  s = sheetReducer(s, { type: 'setType', captureType: 'note' })
  assert.equal(s.editor, null)
  assert.equal(s.text, '450 coffee x')
  assert.equal(sheetReducer(s, { type: 'open', captureType: 'task' }).text, '')
})

test('failed save keeps the typed text and overrides', () => {
  let s = initialSheetState('expense', '450 coffee')
  s = sheetReducer(s, { type: 'override', patch: { category: 'food' } })
  s = sheetReducer(s, { type: 'busy' })
  s = sheetReducer(s, { type: 'failed', error: 'Could not save' })
  assert.equal(s.text, '450 coffee')
  assert.equal(s.overrides.category, 'food')
  assert.equal(s.error, 'Could not save')
})

test('overrides win over the parser; chips are reachable for every editor', () => {
  const s = sheetReducer(initialSheetState('expense', '450 stuff'), { type: 'override', patch: { category: 'travel', amount: 500 } })
  const d = effectiveDraft('450 stuff', NOW, s)
  assert.equal(d.amount, 500)
  assert.equal(d.category, 'travel')
  const keys = editableChips(effectiveDraft('450 stuff', NOW, initialSheetState('expense')), NOW).map((c) => c.key)
  assert.ok(keys.includes('category') && keys.includes('person'))
  const rem = editableChips(effectiveDraft('call mom', NOW, initialSheetState('reminder')), NOW).map((c) => c.key)
  assert.ok(rem.includes('repeat'))
})

test('finishCapture: success carries a message and the undo', async () => {
  const draft = { type: 'expense' }
  const ok = await finishCapture(draft, async () => ({ ok: true, undo: async () => true }))
  assert.equal(ok.ok, true)
  assert.equal(ok.message, 'Expense added')
  assert.equal(typeof ok.undo, 'function')
  assert.equal((await finishCapture(draft, async () => undefined)).ok, true)
})

test('finishCapture: {ok:false} and throws both report an error', async () => {
  const a = await finishCapture({ type: 'note' }, async () => ({ ok: false, error: 'Write something first' }))
  assert.deepEqual(a, { ok: false, error: 'Write something first' })
  const b = await finishCapture({ type: 'note' }, async () => { throw new Error('offline') })
  assert.deepEqual(b, { ok: false, error: 'offline' })
})

test('save then Undo restores the previous data (through submitDraft)', async () => {
  const store = { notes: [{ id: 'old', body: 'keep' }] }
  const writers = { notes: async (fn) => { store.notes = fn(store.notes) } }
  const before = JSON.stringify(store)
  const draft = effectiveDraft('buy milk', NOW, initialSheetState('note'))
  const res = await finishCapture(draft, (d) => submitDraft(d, writers, { now: NOW, newId: () => 'n1' }))
  assert.equal(res.ok, true)
  assert.equal(store.notes.length, 2)
  await res.undo()
  assert.equal(JSON.stringify(store), before)
})

test('failed write keeps the sheet: error returned, data untouched', async () => {
  const store = { notes: [] }
  const writers = { notes: async () => { throw new Error('disk full') } }
  const draft = effectiveDraft('buy milk', NOW, initialSheetState('note'))
  const res = await finishCapture(draft, (d) => submitDraft(d, writers, { now: NOW }))
  assert.equal(res.ok, false)
  assert.match(res.error, /disk full/)
  assert.deepEqual(store.notes, [])
})

test('savedMessage names the action', () => {
  assert.equal(savedMessage({ type: 'mood' }), 'Mood logged')
  assert.equal(savedMessage({ type: 'solve', puzzle: true }), 'Puzzle marked done')
  assert.equal(savedMessage({ type: 'habit' }), 'Habit checked in')
})

test('sheet renders tappable chips and panels', () => {
  const html = sheet.render(sheet.default, { open: true, defaultType: 'expense' })
  assert.match(html, /aria-label="Type"/)
  const habit = sheet.render(sheet.default, { open: true, defaultType: 'mood' })
  assert.match(habit, /Mood today/)
  const solve = sheet.render(sheet.default, { open: true, defaultType: 'solve' })
  assert.match(solve, /Daily puzzle done/)
})
