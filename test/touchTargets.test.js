import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

// Collect the bodies of every `@media (pointer: coarse)` block (brace-balanced).
function coarseBlocks(src) {
  const out = []
  const re = /@media[^{]*\(pointer:\s*coarse\)[^{]*\{/g
  let m
  while ((m = re.exec(src))) {
    let depth = 1
    let i = re.lastIndex
    while (i < src.length && depth) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; i++ }
    out.push(src.slice(re.lastIndex, i - 1))
  }
  return out.join('\n')
}

function has44(src, selector) {
  const body = coarseBlocks(src)
  const rules = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  const hit = rules.filter(([, sel]) => sel.split(',').some((s) => s.trim().endsWith(selector)))
  const decl = hit.map((r) => r[2]).join(';')
  return /min-width:\s*44px/.test(decl) && /min-height:\s*44px/.test(decl)
}

const cases = [
  ['src/life/notes.css', '.notes-chip'],
  ['src/money/screens/spend.css', '.spend-filter'],
  ['src/settings/settings.css', '.theme-swatch'],
  ['src/settings/settings.css', '.settings-goal .btn'],
]

for (const [file, sel] of cases) {
  test(`${sel} is at least 44x44 under (pointer: coarse)`, () => {
    assert.ok(has44(css(file), sel), `${file}: ${sel} needs min-width and min-height 44px in @media (pointer: coarse)`)
  })
}
