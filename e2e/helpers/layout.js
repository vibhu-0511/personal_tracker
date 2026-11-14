// Layout helpers for the device-matrix specs (e2e/matrix/*).
//
// The shell chooses its layout by the width of the `.app-root` container, never
// by device (blueprint "Design rule", errata C-5): below 600 bottom tabs, 600 to
// 1023 a 72px rail, 1024 and up a 220px sidebar plus the inspector pane. These
// helpers read that container, so a spec asserts what the user sees at the
// current width whatever project is running.
//
// Playwright reports env(safe-area-inset-*) as 0 (errata E-22), so safe-area
// behaviour is asserted as arithmetic on the --tabbar-h token only: see
// `safeAreaMetrics`.
import { expect } from '../fixtures/hermetic.js'

export const BREAKPOINTS = { rail: 600, sidebar: 1024 }
export const MIN_TARGET = 44
export const TAB_COUNT = 6
export const TAB_LABELS = ['Today', 'Life', 'Logic', 'Money', 'Invest', 'Agents']

// Mirrors the @container rules in src/styles/shell.css and nav.css.
export function modeForWidth(width) {
  if (width >= BREAKPOINTS.sidebar) return 'sidebar'
  if (width >= BREAKPOINTS.rail) return 'rail'
  return 'phone'
}

// Skip every test in the file unless the running project is one of `names`.
// Call at the top level of a spec. Skipped tests are reported as skipped.
export function onlyProjects(test, names) {
  test.beforeEach(({}, testInfo) => {
    test.skip(!names.includes(testInfo.project.name), `matrix spec for ${names.join(', ')}`)
  })
}

export const nav = (page) => page.getByRole('navigation', { name: 'Primary' })
export const navLinks = (page) => nav(page).getByRole('link')

// Opens a route signed in (hermetic fixture) and waits for the shell.
export async function openApp(page, hash = '#/life/tasks') {
  await page.goto(`/${hash}`)
  await expect(nav(page)).toBeAttached()
  await expect(page.locator('.app-root')).toBeVisible()
}

// Width of the size container the shell queries (not the window).
export const appWidth = (page) => page.locator('.app-root').evaluate((el) => el.clientWidth)

// Pixels the document or the shell can scroll sideways.
export function horizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const root = document.querySelector('.app-root')
    const main = document.querySelector('.page')
    return {
      document: doc.scrollWidth - doc.clientWidth,
      body: document.body.scrollWidth - doc.clientWidth,
      root: root ? root.scrollWidth - root.clientWidth : 0,
      page: main ? main.scrollWidth - main.clientWidth : 0,
    }
  })
}

export async function expectNoHorizontalScroll(page) {
  expect(await horizontalOverflow(page), 'horizontal overflow in px').toEqual({
    document: 0, body: 0, root: 0, page: 0,
  })
  // A page that can scroll sideways moves; one that cannot stays at 0.
  await page.evaluate(() => window.scrollTo(200, 0))
  expect(await page.evaluate(() => window.scrollX), 'window scrolled sideways').toBe(0)
}

// Bounding box, with a clear failure when the element is not rendered.
export async function boxOf(locator) {
  const box = await locator.boundingBox()
  expect(box, 'element has no box (hidden or detached)').not.toBeNull()
  return box
}

// Links of the primary nav with their box and aria-current.
export function navItems(page) {
  return navLinks(page).evaluateAll((links) => links.map((a) => {
    const r = a.getBoundingClientRect()
    return {
      label: a.querySelector('.nav-label')?.textContent.trim() ?? a.textContent.trim(),
      href: a.getAttribute('href'),
      current: a.getAttribute('aria-current'),
      x: r.x, y: r.y, width: r.width, height: r.height,
    }
  }))
}

// Interactive elements inside `scope` whose box is smaller than `min` on either
// side, as readable strings. Hidden elements are ignored.
export function undersizedTargets(scope, min = MIN_TARGET, selector = 'a, button, [role="button"], input, select, textarea, summary') {
  return scope.locator(selector).evaluateAll((els, limit) => els
    .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
    .filter(({ r, cs }) => r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.pointerEvents !== 'none')
    .filter(({ r }) => r.width < limit - 0.5 || r.height < limit - 0.5)
    .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).trim().split(/\s+/).join('.')}` : ''}`
      + `[${el.getAttribute('aria-label') || el.textContent.trim().slice(0, 24)}] ${Math.round(r.width)}x${Math.round(r.height)}`), min)
}

// What the input model says on this project: touch projects must not match the
// real-hover query, or `(hover: hover) and (pointer: fine)` rules would stick.
export function inputModel(page) {
  return page.evaluate(() => ({
    hoverFine: matchMedia('(hover: hover) and (pointer: fine)').matches,
    coarse: matchMedia('(pointer: coarse)').matches,
  }))
}

// Computed background of an element, for before/after comparisons.
export const backgroundOf = (locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor)

// Resolves a colour token (e.g. '--hover') to the rgb() string a computed
// background would report, so a spec can ask "is this the hover colour?".
export function tokenColor(page, name) {
  return page.evaluate((token) => {
    const probe = document.createElement('div')
    probe.style.cssText = `position:absolute;visibility:hidden;background:var(${token})`
    document.querySelector('.app-root').appendChild(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  }, name)
}

// Safe-area arithmetic (errata E-22). Emulation reports every inset as 0, so a
// spec cannot see a notch. It can check the token the shell derives from the
// inset: a probe inside `.app-shell` resolves var(--tabbar-h) and env() to px,
// and the real nav bar and FAB are compared with these numbers by the caller.
export function safeAreaMetrics(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell')
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:1px;'
      + 'box-sizing:content-box;height:var(--tabbar-h);padding-bottom:env(safe-area-inset-bottom, 0px)'
    shell.appendChild(probe)
    const cs = getComputedStyle(probe)
    const metrics = { tabbarH: parseFloat(cs.height), inset: parseFloat(cs.paddingBottom) }
    probe.remove()
    return metrics
  })
}

// Waits for entry animations to finish. A transformed ancestor mid-animation
// moves position:fixed children, so measure fixed elements (FAB) only after this.
export const settle = (page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))))

// Distance between an element's bottom edge and the bottom of the viewport.
export const gapToViewportBottom = (locator) =>
  locator.evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom)

// Focus ring: the computed outline of the focused element, so it holds for any
// ring colour.
export function focusRing(locator) {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      style: cs.outlineStyle,
      width: parseFloat(cs.outlineWidth),
      focusVisible: el.matches(':focus-visible'),
    }
  })
}
