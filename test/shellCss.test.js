// Static CSS guard for the shell and input-model rules (R1-13, absorbs B3-19).
// A cheap regression net until R7 adds Playwright viewport tests. It reads the
// CSS source as text; nothing here renders or measures anything.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))

function cssFiles(dir) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...cssFiles(full))
    else if (name.endsWith('.css')) out.push(full)
  }
  return out
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const FILES = cssFiles(SRC).map((full) => ({
  name: relative(SRC, full).split('\\').join('/'),
  css: stripComments(readFileSync(full, 'utf8')),
}))
const ALL_CSS = FILES.map((f) => f.css).join('\n')

// Walk the CSS and report every style rule with the stack of at-rule preludes
// that enclose it, e.g. { selector: '.btn:hover', atRules: ['@media (hover: hover)'] }.
// Strings and parentheses are skipped so ';' or '{' inside url(...) cannot confuse it.
export function parseRules(css) {
  const rules = []
  const stack = []
  let buf = ''
  let paren = 0
  let quote = null
  for (const ch of css) {
    if (quote) {
      buf += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue }
    if (ch === '(') paren++
    if (ch === ')') paren = Math.max(0, paren - 1)
    if (paren === 0 && ch === '{') {
      const prelude = buf.trim().replace(/\s+/g, ' ')
      buf = ''
      if (prelude.startsWith('@')) stack.push({ at: prelude })
      else {
        stack.push({ selector: prelude })
        const atRules = stack.filter((s) => s.at).map((s) => s.at)
        rules.push({ selector: prelude, atRules })
      }
      continue
    }
    if (paren === 0 && ch === '}') {
      buf = ''
      stack.pop()
      continue
    }
    if (paren === 0 && ch === ';') { buf = ''; continue }
    buf += ch
  }
  return rules
}

const HOVER_QUERY = /\(\s*hover\s*:\s*hover\s*\)/
const guardsHover = (at) => /^@media\b/i.test(at) && !/^@media\s+not\b/i.test(at) && HOVER_QUERY.test(at)

export function unguardedHoverRules(css) {
  return parseRules(css).filter(
    (r) => /:hover\b/.test(r.selector) && !r.atRules.some(guardsHover),
  )
}

export function hasContainerQuery(css, minWidth) {
  return new RegExp(`@container\\s+app\\s*\\(\\s*min-width\\s*:\\s*${minWidth}px\\s*\\)`).test(css)
}

export const hasFocusVisibleRule = (css) => parseRules(css).some((r) => /:focus-visible\b/.test(r.selector))

export const hasCreamBlock = (css) =>
  parseRules(css).some((r) => /\[data-accent=["']?cream["']?\]/.test(r.selector))

export const hasCoarsePointer44 = (css) =>
  parseRules(css).length > 0 &&
  /@media[^{]*\(\s*pointer\s*:\s*coarse\s*\)\s*\{[^@]*?(?:min-)?(?:height|width)\s*:\s*44px/.test(
    css.replace(/\s+/g, ' '),
  )

// 100vw includes the scrollbar and ignores the app container, so layout must not
// use it. The command palette is a top-layer dialog that is sized from the
// viewport on purpose (R1-05); that one declaration is allowed, nothing else is.
const VW_ALLOW = [{ file: 'styles/palette.css', text: 'min(560px, calc(100vw - 24px))' }]

export function forbiddenLiterals(files, allow = VW_ALLOW) {
  const found = []
  for (const { name, css } of files) {
    for (const m of css.matchAll(/[^;{}]*\b100vw\b[^;{}]*/g)) {
      const text = m[0].trim()
      if (!allow.some((a) => a.file === name && text.includes(a.text))) found.push(`${name}: ${text}`)
    }
    for (const m of css.matchAll(/[^;{}]*calc\(\s*64px\s*\+[^;{}]*/g)) {
      found.push(`${name}: ${m[0].trim()}`)
    }
  }
  return found
}

// ── Guards on the real source ──

test('source CSS is found and parsed', () => {
  assert.ok(FILES.length >= 8, `expected the shell CSS partials, found ${FILES.length} files`)
  assert.ok(parseRules(ALL_CSS).length > 100)
})

test('every :hover rule sits inside @media (hover: hover)', () => {
  for (const { name, css } of FILES) {
    const bad = unguardedHoverRules(css).map((r) => r.selector)
    assert.deepEqual(bad, [], `${name} has :hover rules outside @media (hover: hover)`)
  }
  assert.ok(parseRules(ALL_CSS).some((r) => /:hover\b/.test(r.selector)), 'sanity: some :hover rules exist')
})

test('no 100vw or calc(64px + ...) literals', () => {
  assert.deepEqual(forbiddenLiterals(FILES), [])
})

test('shell has @container app queries at 600px and 1024px', () => {
  const shell = FILES.find((f) => f.name === 'styles/shell.css')
  assert.ok(shell, 'src/styles/shell.css exists')
  assert.ok(hasContainerQuery(shell.css, 600), 'missing @container app (min-width: 600px) in shell.css')
  assert.ok(hasContainerQuery(shell.css, 1024), 'missing @container app (min-width: 1024px) in shell.css')
})

test('a :focus-visible rule exists', () => {
  assert.ok(hasFocusVisibleRule(ALL_CSS))
})

test('a data-accent="cream" block exists', () => {
  assert.ok(hasCreamBlock(ALL_CSS))
})

test('coarse pointers get 44px targets', () => {
  assert.ok(hasCoarsePointer44(ALL_CSS), 'missing @media (pointer: coarse) rule with a 44px target')
})

// ── The guards themselves must fail on regressions ──

test('guard: detects unguarded and mis-guarded :hover', () => {
  assert.equal(unguardedHoverRules('.a:hover { color: red }').length, 1)
  assert.equal(unguardedHoverRules('@media (min-width: 600px) { .a:hover { color: red } }').length, 1)
  assert.equal(unguardedHoverRules('@media (hover: none) { .a:hover { color: red } }').length, 1)
  assert.equal(unguardedHoverRules('@media not all and (hover: hover) { .a:hover { color: red } }').length, 1)
  assert.equal(
    unguardedHoverRules('@media (hover: hover) and (pointer: fine) { .a:hover { color: red } }\n.b { color: blue }').length,
    0,
  )
  assert.equal(
    unguardedHoverRules('@media (hover: hover) { @supports (display: grid) { .a:hover, .b:hover { color: red } } }').length,
    0,
  )
  // a guarded block does not leak its guard to the next rule
  assert.equal(unguardedHoverRules('@media (hover: hover) { .a:hover { color: red } }\n.b:hover { color: red }').length, 1)
})

test('guard: detects 100vw and calc(64px + ...) literals', () => {
  const f = (css) => forbiddenLiterals([{ name: 'x.css', css }], [])
  assert.equal(f('.a { width: 100vw }').length, 1)
  assert.equal(f('.a { width: calc(100vw - 24px) }').length, 1)
  assert.equal(f('.a { bottom: calc(64px + env(safe-area-inset-bottom)) }').length, 1)
  assert.equal(f('.a { bottom: calc(var(--tabbar-h) + 12px); width: 100% }').length, 0)
  assert.equal(
    forbiddenLiterals([{ name: 'other.css', css: '.a { width: min(560px, calc(100vw - 24px)) }' }]).length,
    1,
    'the palette allowance must not apply to other files',
  )
})

test('guard: detects missing container queries, focus ring, cream, 44px rule', () => {
  assert.equal(hasContainerQuery('@container app (min-width: 600px) { .a { color: red } }', 600), true)
  assert.equal(hasContainerQuery('@container app (min-width: 600px) { .a { color: red } }', 1024), false)
  assert.equal(hasContainerQuery('@media (min-width: 1024px) { .a { color: red } }', 1024), false)
  assert.equal(hasFocusVisibleRule('.a { color: red }'), false)
  assert.equal(hasFocusVisibleRule(':focus-visible { outline: 2px solid red }'), true)
  assert.equal(hasCreamBlock(':root[data-accent="sky"] { --bg: #fff }'), false)
  assert.equal(hasCreamBlock(':root[data-accent="cream"] { --bg: #fff }'), true)
  assert.equal(hasCoarsePointer44('.btn { min-height: 30px }'), false)
  assert.equal(hasCoarsePointer44('@media (pointer: coarse) { .btn { min-height: 44px } }'), true)
})
