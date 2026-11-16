// WCAG 2.x contrast checks computed from RENDERED colours (getComputedStyle), so a
// spec asserts what the user sees under whichever theme is active, not what a token
// table says.
//
// Thresholds (WCAG 1.4.3 and 1.4.11, level AA):
//   body and secondary text        4.5:1
//   large text (>= 24px, or >= 18.66px and bold)   3:1
//   UI component borders (form fields)             3:1
//
// How a pair is resolved, all inside the page:
//   - foreground: the element's computed `color`, times the product of `opacity` up
//     the ancestor chain, composited over the resolved background;
//   - background: walk up from the element compositing each ancestor's
//     `background-color` (alpha respected) until an opaque layer or the root; the
//     canvas falls back to the root/body colour, then white. A `background-image`
//     gradient is resolved to its colour stops and the WORST stop is used, so a
//     gradient can only make a check stricter, never hide a failure;
//   - disabled controls are skipped (WCAG 1.4.3 exempts inactive components);
//   - text on a raster image cannot be resolved and is reported as `unresolved`.
//
// A form field passes the 3:1 border rule when its border OR its fill separates it
// from the surface behind it by 3:1 (either one identifies the control).
import { expect } from '../fixtures/hermetic.js'

export const AA = { text: 4.5, large: 3, ui: 3 }

// Runs in the browser. Kept self-contained: page.evaluate serialises it as source.
function collect([scopeSelector, thresholds]) {
  const root = scopeSelector ? document.querySelector(scopeSelector) : document.body
  if (!root) return { checked: 0, failures: [], unresolved: [], error: `scope ${scopeSelector} not found` }

  // ---- colour maths ----
  const parse = (str) => {
    // Chromium reports rgb()/rgba() for computed colours; color(srgb ...) for some functions.
    let m = str.match(/rgba?\(([^)]+)\)/)
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat)
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    m = str.match(/color\(srgb ([^)]+)\)/)
    if (m) {
      const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat)
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }
    }
    return null
  }
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a)
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }
    const mix = (t, u) => (t * top.a + u * under.a * (1 - top.a)) / a
    return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a }
  }
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)
  }
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }
  const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
  const WHITE = { r: 255, g: 255, b: 255, a: 1 }

  // Colour stops of a gradient, as parsed colours (the worst stop is checked).
  const gradientStops = (image) => (image.match(/rgba?\([^)]*\)/g) || []).map(parse).filter(Boolean)

  // Backgrounds under `el`: list of candidate opaque colours (more than one only
  // when a gradient sits in the stack), plus a flag for raster images.
  function backgroundsFor(el) {
    const layers = []
    let raster = false
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n)
      const bg = parse(cs.backgroundColor)
      const image = cs.backgroundImage
      const stops = image && image !== 'none' && /gradient/.test(image) ? gradientStops(image) : []
      if (image && image !== 'none' && /url\(/.test(image)) raster = true
      layers.push({ bg, stops })
      if (bg && bg.a >= 1 && !stops.length) break
      if (stops.length && stops.every((s) => s.a >= 1)) break
    }
    // Resolve bottom-up. Start from the canvas.
    const rootBg = parse(getComputedStyle(document.documentElement).backgroundColor)
    const bodyBg = parse(getComputedStyle(document.body).backgroundColor)
    let bases = [over(bodyBg || { r: 0, g: 0, b: 0, a: 0 }, over(rootBg || { r: 0, g: 0, b: 0, a: 0 }, WHITE))]
    for (let i = layers.length - 1; i >= 0; i--) {
      const { bg, stops } = layers[i]
      if (bg && bg.a > 0) bases = bases.map((b) => over(bg, b))
      if (stops.length) bases = bases.flatMap((b) => stops.map((s) => over(s, b)))
    }
    return { bases, raster }
  }

  const effectiveOpacity = (el) => {
    let o = 1
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity)
    return o
  }

  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false
      if (parseFloat(cs.opacity) === 0) return false
    }
    // Visually-hidden text (sr-only clips to 1px).
    if (r.width <= 1 && r.height <= 1) return false
    return true
  }
  const inactive = (el) => !!el.closest('[disabled], [aria-disabled="true"], fieldset:disabled')
  const describe = (el) => {
    const id = el.id ? `#${el.id}` : ''
    const cls = el.className && typeof el.className === 'string'
      ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${id}${cls}`
  }

  const out = { checked: 0, failures: [], unresolved: [] }
  const seen = new Set()

  function testText(el, text, fgStr, kind) {
    const cs = getComputedStyle(el)
    const fg0 = parse(fgStr)
    if (!fg0) return
    const px = parseFloat(cs.fontSize)
    const bold = parseInt(cs.fontWeight, 10) >= 700
    const large = px >= 24 || (px >= 18.66 && bold)
    const need = large ? thresholds.large : thresholds.text
    const { bases, raster } = backgroundsFor(el)
    const opacity = effectiveOpacity(el)
    let worst = Infinity
    let worstPair = null
    for (const base of bases) {
      const fg = over({ ...fg0, a: fg0.a * opacity }, base)
      const r = ratio(fg, base)
      if (r < worst) { worst = r; worstPair = { fg, base } }
    }
    out.checked++
    const label = `${describe(el)} "${text.trim().slice(0, 32)}"`
    if (raster) out.unresolved.push(`${label}: background image`)
    if (worst + 1e-9 >= need) return
    const key = `${describe(el)}|${hex(worstPair.fg)}|${hex(worstPair.base)}|${kind}`
    if (seen.has(key)) return
    seen.add(key)
    out.failures.push({
      kind, element: label, ratio: Math.round(worst * 100) / 100, need,
      fg: hex(worstPair.fg), bg: hex(worstPair.base), size: `${px}px/${cs.fontWeight}`,
    })
  }

  // ---- text ----
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.trim()) continue
    const el = node.parentElement
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION'].includes(el.tagName)) continue
    if (el.closest('[aria-hidden="true"], svg')) continue
    if (!visible(el) || inactive(el)) continue
    testText(el, node.nodeValue, getComputedStyle(el).color, 'text')
  }
  // Field values and placeholders (no text node).
  for (const el of root.querySelectorAll('input, textarea, select')) {
    if (!visible(el) || inactive(el) || ['hidden', 'checkbox', 'radio', 'range', 'color'].includes(el.type)) continue
    const value = el.tagName === 'SELECT' ? el.selectedOptions[0]?.textContent : el.value
    if (value) testText(el, value, getComputedStyle(el).color, 'field value')
    else if (el.placeholder) testText(el, el.placeholder, getComputedStyle(el, '::placeholder').color, 'placeholder')
  }

  // ---- UI borders of form fields ----
  for (const el of root.querySelectorAll('input, textarea, select')) {
    if (!visible(el) || inactive(el) || ['hidden', 'checkbox', 'radio', 'range', 'color', 'file'].includes(el.type)) continue
    const cs = getComputedStyle(el)
    const { bases } = backgroundsFor(el.parentElement || el)
    const fill = parse(cs.backgroundColor)
    const border = parse(cs.borderTopColor)
    const hasBorder = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' && border && border.a > 0
    out.checked++
    let best = 0
    let detail = 'no border and no fill'
    for (const base of bases) {
      const options = []
      if (hasBorder) options.push([ratio(over(border, base), base), `border ${hex(over(border, base))}`])
      if (fill && fill.a > 0) options.push([ratio(over(fill, base), base), `fill ${hex(over(fill, base))}`])
      for (const [r, d] of options) if (r > best) { best = r; detail = `${d} on ${hex(base)}` }
    }
    // Pass if the best separator meets 3:1 on the base that matters most; take the
    // worst base so a gradient surface cannot hide a failure.
    let worstBest = Infinity
    for (const base of bases) {
      let b = 0
      if (hasBorder) b = Math.max(b, ratio(over(border, base), base))
      if (fill && fill.a > 0) b = Math.max(b, ratio(over(fill, base), base))
      worstBest = Math.min(worstBest, b)
    }
    if (worstBest + 1e-9 >= thresholds.ui) continue
    const key = `${describe(el)}|ui|${detail}`
    if (seen.has(key)) continue
    seen.add(key)
    out.failures.push({
      kind: 'ui border', element: `${describe(el)} [${el.getAttribute('aria-label') || el.name || el.type || ''}]`,
      ratio: Math.round(worstBest * 100) / 100, need: thresholds.ui, fg: detail, bg: '', size: '',
    })
  }
  return out
}

// Contrast findings for everything visible under `scope` (a CSS selector; the whole
// body by default). Returns { checked, failures, unresolved }.
export const contrastReport = (page, scope = null) => page.evaluate(collect, [scope, AA])

export function formatFailures(failures) {
  return failures.map((f) =>
    `${f.kind} ${f.ratio}:1 < ${f.need}:1  ${f.element}  fg ${f.fg}${f.bg ? ` on ${f.bg}` : ''}  ${f.size}`)
}

// Asserts that nothing under `scope` is below AA. The message lists each failing
// pair so a failure names the colours, not just a count. Returns the report.
export async function expectContrast(page, scope = null) {
  const report = await contrastReport(page, scope)
  expect(report.error ?? '', 'contrast scope').toBe('')
  expect(report.checked, 'contrast probe saw some text').toBeGreaterThan(0)
  expect(formatFailures(report.failures), 'WCAG AA contrast failures').toEqual([])
  return report
}

// ---------------------------------------------------------------------------
// Screen catalogue shared by e2e/ember-screens.spec.js and the matrix specs:
// Today, Agents, and the 17 sub-views (Life 5, Money 4, Logic 4 incl. the DSA
// frame, Invest 3) plus the Settings panel.
// ---------------------------------------------------------------------------
export const SCREENS = [
  { id: 'today', name: 'Today', tab: 'today' },
  { id: 'life-tasks', name: 'Life: Tasks', tab: 'life', view: 'tasks' },
  { id: 'life-reminders', name: 'Life: Reminders', tab: 'life', view: 'reminders' },
  { id: 'life-notes', name: 'Life: Notes', tab: 'life', view: 'notes' },
  { id: 'life-habits', name: 'Life: Habits', tab: 'life', view: 'habits' },
  { id: 'life-growth', name: 'Life: Growth', tab: 'life', view: 'growth' },
  { id: 'money-spend', name: 'Money: Spend', tab: 'money', pill: 'Spend', pills: 'Money sections' },
  { id: 'money-budgets', name: 'Money: Budgets', tab: 'money', pill: 'Budgets', pills: 'Money sections' },
  { id: 'money-goals', name: 'Money: Goals', tab: 'money', pill: 'Goals', pills: 'Money sections' },
  { id: 'money-loans', name: 'Money: Loans', tab: 'money', pill: 'Loans', pills: 'Money sections' },
  { id: 'logic-code', name: 'Logic: Code', tab: 'logic', pill: 'Code', pills: 'Logic sections' },
  { id: 'logic-puzzles', name: 'Logic: Puzzles', tab: 'logic', pill: 'Puzzles', pills: 'Logic sections' },
  { id: 'logic-exams', name: 'Logic: Exams', tab: 'logic', pill: 'Exams', pills: 'Logic sections' },
  { id: 'logic-dsa', name: 'Logic: DSA', tab: 'logic', pill: 'DSA', pills: 'Logic sections' },
  { id: 'invest-learn', name: 'Invest: Learn', tab: 'invest', pill: 'Learn' },
  { id: 'invest-research', name: 'Invest: Research', tab: 'invest', pill: 'Research' },
  { id: 'invest-watch', name: 'Invest: Watchlist', tab: 'invest', pill: 'Watchlist' },
  { id: 'agents', name: 'Agents', tab: 'agents' },
  { id: 'settings', name: 'Settings panel', tab: 'today', settings: true },
]

// Opens `screen` and waits until it has rendered (no loading dots, pill selected).
export async function openScreen(page, screen) {
  const hash = screen.view ? `#/${screen.tab}/${screen.view}` : `#/${screen.tab}`
  await page.goto(`/${hash}`)
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeAttached()
  await expect(page.locator('.app-root')).toBeVisible()
  if (screen.pill) {
    // Money/Logic/Invest keep their sub-view in local state: click the chip.
    const bar = screen.pills
      ? page.getByRole('navigation', { name: screen.pills }).or(page.getByRole('group', { name: screen.pills }))
      : page.locator('.agent-bar')
    const pill = bar.getByRole('button', { name: screen.pill })
    await pill.click()
    if (screen.pills === 'Logic sections') await expect(pill).toHaveAttribute('aria-pressed', 'true')
    else if (screen.pills) await expect(pill).toHaveAttribute('aria-current', 'page')
    else await expect(pill).toHaveClass(/active/)
  }
  if (screen.settings) {
    await page.getByRole('button', { name: 'Settings' }).click()
    await expect(page.locator('.settings-panel')).toBeVisible()
  }
  await expect(page.locator('.loading-dot')).toHaveCount(0)
  await expect(page.locator('.page')).toBeVisible()
  // Entry animations and lazy chunks settle before anything is measured.
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity) // looping ones (pets) never finish
    .map((a) => a.finished.catch(() => {}))))
}
