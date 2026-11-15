// Phone shell: iPhone 14 (390x844) and the iPad Split View one-third window
// (375x1024). The second proves the shell follows container width, not device:
// an iPad in a narrow window gets the phone layout (blueprint matrix, E-01).
import { test, expect } from '../fixtures/hermetic.js'
import {
  TAB_COUNT, TAB_LABELS, onlyProjects, openApp, nav, navItems, appWidth, modeForWidth,
  expectNoHorizontalScroll, boxOf, safeAreaMetrics, gapToViewportBottom, undersizedTargets, settle,
} from '../helpers/layout.js'

onlyProjects(test, ['iphone-14', 'ipad-split-third'])

test.describe('phone shell', () => {
  test('container is under 600px and the shell reports the phone layout', async ({ page }) => {
    await openApp(page)
    const width = await appWidth(page)
    expect(width).toBeLessThan(600)
    expect(modeForWidth(width)).toBe('phone')
    // The sidebar brand text and the inspector slot belong to wider layouts.
    await expect(page.locator('.nav-brand')).toBeHidden()
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveCount(0)
  })

  test('shows 6 bottom tabs, in order, in the bottom row', async ({ page }) => {
    await openApp(page)
    const items = await navItems(page)
    expect(items).toHaveLength(TAB_COUNT)
    expect(items.map((i) => i.label)).toEqual(TAB_LABELS)

    const viewport = page.viewportSize()
    const bar = await boxOf(nav(page))
    expect(bar.x).toBe(0)
    expect(bar.width).toBeCloseTo(viewport.width, 0)
    expect(bar.y + bar.height).toBeCloseTo(viewport.height, 0)

    // One row, side by side, every tab fully on screen.
    for (const item of items) {
      expect(item.y).toBeCloseTo(items[0].y, 0)
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.x + item.width).toBeLessThanOrEqual(viewport.width + 0.5)
    }
    // Exactly the Life tab is current for #/life/tasks.
    expect(items.filter((i) => i.current === 'page').map((i) => i.label)).toEqual(['Life'])
  })

  test('has no horizontal scroll on any tab', async ({ page }) => {
    for (const hash of ['#/today', '#/life/tasks', '#/logic/code', '#/money/overview', '#/invest/learn', '#/agents']) {
      await openApp(page, hash)
      await expect(page.locator('.page')).toBeVisible()
      await expectNoHorizontalScroll(page)
    }
  })

  test('tab bar targets are at least 44px tall and tapping a tab navigates', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    const tooSmall = await undersizedTargets(nav(page), 44, 'a')
    expect(tooSmall).toEqual([])

    await nav(page).getByRole('link', { name: /Money/ }).tap()
    await expect(page).toHaveURL(/#\/money/)
    await expect(nav(page).getByRole('link', { name: /Money/ })).toHaveAttribute('aria-current', 'page')
  })

  // Safe-area: emulation reports env(safe-area-inset-bottom) as 0 (errata E-22), so the
  // check is arithmetic on --tabbar-h. Real notch behaviour is a manual device item.
  test('tab bar height and FAB offset follow the --tabbar-h arithmetic', async ({ page }) => {
    await openApp(page, '#/money/overview')
    const { tabbarH, inset } = await safeAreaMetrics(page)
    expect(inset, 'emulation reports no inset').toBe(0)
    expect(tabbarH).toBe(56 + inset) // tokens.css: calc(56px + env(safe-area-inset-bottom))

    const bar = await boxOf(nav(page))
    expect(bar.height).toBeCloseTo(tabbarH, 0)
    expect(await gapToViewportBottom(nav(page))).toBeCloseTo(0, 0)

    // overlays.css / money.css: bottom = max(--tabbar-h, inset) + 12.
    const fab = page.getByRole('button', { name: 'Add transaction' })
    await expect(fab).toBeVisible()
    await settle(page)
    expect(await gapToViewportBottom(fab)).toBeCloseTo(Math.max(tabbarH, inset) + 12, 0)
    // And it clears the tab bar: its bottom edge is above the bar's top edge.
    const fabBox = await boxOf(fab)
    expect(fabBox.y + fabBox.height).toBeLessThanOrEqual(bar.y)
  })
})
