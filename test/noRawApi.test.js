import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Guard: every request to our own /api routes must go through apiFetch
// (src/api/client.js) so the base URL and auth header are applied. A raw
// fetch('/api/...') bypasses VITE_API_BASE and breaks native/hosted builds.

const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const API_DIR = join(SRC, 'api')

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

function stripComments(text) {
  // Blank out comments but keep newlines so reported line numbers stay right.
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length))
}

// fetch( immediately followed by a relative /api string or template literal.
// apiFetch( does not match because of the lookbehind.
const RAW_API_FETCH = /(?<![\w$.])fetch\(\s*['"`]\/api(?![\w])/g

export function findRawApiFetches(text) {
  const clean = stripComments(text)
  const hits = []
  for (const m of clean.matchAll(RAW_API_FETCH)) {
    hits.push(clean.slice(0, m.index).split('\n').length)
  }
  return hits
}

test('detector flags raw fetch of a relative /api path', () => {
  assert.deepEqual(findRawApiFetches("await fetch('/api/agent', {})"), [1])
  assert.deepEqual(findRawApiFetches('a\nfetch(`/api/quote?x=${y}`)'), [2])
  assert.deepEqual(findRawApiFetches('fetch( "/api/cf")'), [1])
})

test('detector ignores apiFetch, other hosts, and comments', () => {
  assert.deepEqual(findRawApiFetches("apiFetch('/api/agent')"), [])
  assert.deepEqual(findRawApiFetches("fetch('/puzzles.json')"), [])
  assert.deepEqual(findRawApiFetches("fetch('https://x.test/api/y')"), [])
  assert.deepEqual(findRawApiFetches("// fetch('/api/agent')"), [])
  assert.deepEqual(findRawApiFetches("/* fetch('/api/agent') */"), [])
})

test('no src file outside src/api fetches a relative /api path directly', () => {
  const offenders = []
  for (const file of walk(SRC)) {
    if (file.startsWith(API_DIR + sep)) continue
    const lines = findRawApiFetches(readFileSync(file, 'utf8'))
    for (const line of lines) offenders.push(`${relative(SRC, file).split(sep).join('/')}:${line}`)
  }
  assert.deepEqual(offenders, [], `raw /api fetch found, use apiFetch from src/api/client.js: ${offenders.join(', ')}`)
})
