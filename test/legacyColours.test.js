// E4-12: the legacy stylesheet (src/styles.css) must not hard-code colours in component rules.
// Literals (hex, rgb(), rgba(), hsl(), hsla()) are allowed ONLY as values of custom properties
// declared in :root / :root[data-accent=...] blocks (the token blocks). Components use var().
// There is no rgba(0,0,0,x) exception: shadow and scrim colours are tokens too (--shadow-pop, --scrim).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
const LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/

// Flat parse: [{ selector, decls: [[prop, value]] }], @media wrappers are descended into.
function parse(src) {
  const css = src.replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = []
  let i = 0
  const walk = (end) => {
    while (i < end) {
      const open = css.indexOf('{', i)
      if (open < 0 || open >= end) return
      const head = css.slice(i, open).trim()
      let depth = 1, j = open + 1
      while (depth && j < css.length) { const c = css[j++]; if (c === '{') depth++; else if (c === '}') depth-- }
      if (head.startsWith('@media') || head.startsWith('@supports')) {
        i = open + 1; walk(j - 1); i = j
      } else {
        const body = css.slice(open + 1, j - 1)
        const decls = []
        let d = 0, cur = ''
        for (const ch of body) {
          if (ch === '(') d++; if (ch === ')') d--
          if (ch === ';' && d === 0) { decls.push(cur); cur = '' } else cur += ch
        }
        decls.push(cur)
        rules.push({
          selector: head,
          decls: decls.map((x) => x.trim()).filter(Boolean).map((x) => {
            const k = x.indexOf(':')
            return [x.slice(0, k).trim(), x.slice(k + 1).trim()]
          }),
        })
        i = j
      }
    }
  }
  walk(css.length)
  return rules
}

const sheet = read('styles.css')
const rules = parse(sheet)
const isTokenBlock = (r) => r.selector.split(',').every((s) => /^:root(\[data-accent="[\w-]+"\])?$/.test(s.trim()))

test('no hard-coded colour outside the :root token blocks of styles.css', () => {
  const bad = []
  for (const r of rules) {
    for (const [prop, value] of r.decls) {
      const tokenDecl = isTokenBlock(r) && prop.startsWith('--')
      if (!tokenDecl && LITERAL.test(value)) bad.push(`${r.selector} { ${prop}: ${value} }`)
    }
  }
  assert.deepEqual(bad, [])
})

test('the checker catches a returning literal', () => {
  const sample = parse('.x { color: #fff; border: 1px solid rgba(0,0,0,.3); background: hsl(1 2% 3%) }\n:root { --a: #fff; }')
  const flagged = sample.flatMap((r) => r.decls.filter(([p, v]) => !(isTokenBlock(r) && p.startsWith('--')) && LITERAL.test(v)))
  assert.equal(flagged.length, 3)
})

// ── Computed-colour check: every replaced declaration still resolves to its old literal in every theme ──
const THEMES = ['ocean', 'forest', 'sunset', 'grape', 'rose', 'sky', 'cream', 'ember']
const sources = ['styles.css', 'styles/ember.css', 'styles/tokens.css'] // import order in main.jsx

function themeVars(theme) {
  const vars = {}
  const rank = {}
  let order = 0
  for (const f of sources) {
    for (const r of parse(read(f))) {
      for (const sel of r.selector.split(',').map((s) => s.trim())) {
        const m = sel.match(/^:root(?:\[data-accent="([\w-]+)"\])?$/)
        if (!m || (m[1] && m[1] !== theme)) continue
        const spec = m[1] ? 1 : 0
        for (const [p, v] of r.decls) {
          if (!p.startsWith('--')) continue
          order++
          if (!rank[p] || spec > rank[p][0] || (spec === rank[p][0])) { vars[p] = v; rank[p] = [spec, order] }
        }
      }
    }
  }
  return vars
}
function resolve(value, vars, depth = 0) {
  assert.ok(depth < 10, 'var() cycle')
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/g, (_, name, fb) => {
    const v = vars[name] ?? fb
    assert.ok(v !== undefined, `undefined ${name}`)
    return resolve(v.trim(), vars, depth + 1)
  })
}
function declOf(selector, prop) {
  const hits = rules.filter((r) => r.selector.split(',').map((x) => x.trim()).includes(selector)).flatMap((r) => r.decls.filter(([p]) => p === prop))
  assert.ok(hits.length, `${selector} ${prop} missing`)
  return hits[hits.length - 1][1]
}
const norm = (s) => s.replace(/\s+/g, ' ').trim()

// [selector, property, old literal value, themes where the old literal applied (default: all)]
const EXPECT = [
  ['.chip-muted', 'background', 'rgba(139, 149, 168, 0.1)'],
  ['.btn-primary', 'color', '#fff', ['ocean', 'forest', 'sunset', 'grape', 'rose', 'sky', 'cream']],
  ['.btn-primary', 'color', '#1d0d02', ['ember']], // ember --accent-fg (E4-19)
  ['.chat-bubble.user', 'color', '#fff', ['ocean', 'forest', 'sunset', 'grape', 'rose', 'sky', 'cream']],
  ['.chat-bubble.user', 'color', '#1d0d02', ['ember']], // ember --accent-fg (E4-19)
  ['.note-card[data-color="red"]', 'background', 'rgba(248, 113, 113, 0.08)'],
  ['.note-card[data-color="orange"]', 'background', 'rgba(251, 146, 60, 0.08)'],
  ['.note-card[data-color="green"]', 'background', 'rgba(74, 222, 128, 0.08)'],
  ['.note-card[data-color="blue"]', 'background', 'rgba(110, 168, 254, 0.08)'],
  ['.note-card[data-color="purple"]', 'background', 'rgba(192, 132, 252, 0.08)'],
  ['.note-swatch-orange', 'background', '#fb923c'],
  ['.note-swatch-blue', 'background', '#6ea8fe'],
  ['.note-swatch-purple', 'background', '#c084fc'],
  ['.banner-warn', 'border', '1px solid rgba(248, 113, 113, 0.2)'],
  ['.invest-disclaimer', 'border', '1px solid rgba(251, 191, 36, 0.2)'],
  ['.life-reminder-banner', 'border', '1px solid rgba(251, 191, 36, 0.3)'],
  ['.sheet-dialog::backdrop', 'background', 'rgba(0, 0, 0, 0.5)'],
  [':root[data-accent="sky"] .settings-panel', 'box-shadow', '0 8px 30px rgba(15, 23, 42, 0.08)', ['sky']],
]

test('replaced declarations resolve to the same colours in all eight themes', () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme)
    for (const [sel, prop, old, only] of EXPECT) {
      if (only && !only.includes(theme)) continue
      assert.equal(norm(resolve(declOf(sel, prop), vars)), old, `${theme}: ${sel} ${prop}`)
    }
  }
})

test('btn-success hover and toast shadow keep their old values', () => {
  const vars = themeVars('ocean')
  const hover = rules.find((r) => r.selector === '.btn-success:hover')
  assert.equal(norm(resolve(hover.decls[0][1], vars)), 'rgba(74, 222, 128, 0.2)')
  const toast = rules.flatMap((r) => r.decls.map(([p, v]) => [r.selector, p, v])).find(([, p, v]) => p === 'box-shadow' && v.includes('--shadow-pop'))
  assert.equal(norm(resolve(toast[2], vars)), '0 8px 24px rgba(0, 0, 0, 0.3)')
})
