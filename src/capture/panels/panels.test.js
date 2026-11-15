import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// node:test cannot import .jsx, so bundle in memory (react included).
async function load(file) {
  const out = await build({
    entryPoints: [fileURLToPath(new URL(`./${file}`, import.meta.url))],
    bundle: true, write: false, format: 'esm', jsx: 'automatic', platform: 'node', loader: { '.css': 'empty' },
  })
  return import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'))
}
const { default: HabitPanel } = await load('HabitPanel.jsx')
const { default: SolvePanel } = await load('SolvePanel.jsx')
const { default: MoodPanel } = await load('MoodPanel.jsx')
const logic = await load('logic.js')

const NOW = new Date(2026, 10, 15, 12).getTime()
const habits = [
  { id: 'a', name: 'Gym', species: '🐶', checkins: ['2026-11-15'] },
  { id: 'b', name: 'Read', species: '🐱', checkins: ['2026-11-14'] },
]

test('habit panel lists only unchecked habits', () => {
  const html = renderToStaticMarkup(createElement(HabitPanel, { habits, now: NOW }))
  assert.match(html, /Check in Read/)
  assert.doesNotMatch(html, /Gym/)
})
test('habit panel empty states', () => {
  assert.match(renderToStaticMarkup(createElement(HabitPanel, { habits: [], now: NOW })), /No habits yet/)
  assert.match(renderToStaticMarkup(createElement(HabitPanel, { habits: [habits[0]], now: NOW })), /All habits are checked in/)
})
test('mood panel shows the five moods and marks the selected one', () => {
  const html = renderToStaticMarkup(createElement(MoodPanel, { value: 75 }))
  assert.equal((html.match(/role="radio"/g) || []).length, 5)
  assert.equal((html.match(/data-selected="true"/g) || []).length, 1)
  assert.match(html, /aria-label="Good" data-selected="true"/)
})
test('solve panel offers both actions; puzzle done is disabled', () => {
  const open = renderToStaticMarkup(createElement(SolvePanel, { solvedToday: 2 }))
  assert.match(open, /Solved a problem/)
  assert.match(open, /2 in Code today/)
  assert.match(open, /Daily puzzle done/)
  assert.doesNotMatch(open, /disabled/)
  assert.match(renderToStaticMarkup(createElement(SolvePanel, { puzzleDone: true })), /disabled/)
})
test('quickSolve counts in code today; markPuzzleDone sets the daily flag', async () => {
  const { solvedToday } = await import('../../logic/stats.js')
  const q = logic.quickSolve(NOW)
  const progress = { [q.id]: { status: q.status, tags: q.tags, updatedAt: NOW } }
  assert.equal(solvedToday(progress, NOW), 1)
  const log = logic.markPuzzleDone({ '2026-11-15': { noSpend: true } }, NOW)
  assert.deepEqual(log['2026-11-15'], { noSpend: true, puzzle: true })
  assert.equal(logic.isPuzzleDone(log, NOW), true)
})
test('css uses tokens only and 44px coarse targets', () => {
  const css = readFileSync(new URL('./panels.css', import.meta.url), 'utf8')
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  assert.match(css, /@media \(pointer: coarse\)[\s\S]*min-height: 44px/)
})
