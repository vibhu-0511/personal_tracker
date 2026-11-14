// iPad 11" portrait (834x1194, touch): the 72px rail replaces the bottom tabs.
import { test, expect } from '../fixtures/hermetic.js'
import {
  TAB_COUNT, TAB_LABELS, MIN_TARGET, onlyProjects, openApp, nav, navItems, appWidth, modeForWidth,
  expectNoHorizontalScroll, boxOf, inputModel, backgroundOf, tokenColor, undersizedTargets, safeAreaMetrics,
} from '../helpers/layout.js'

onlyProjects(test, ['ipad-portrait'])

test.describe('iPad portrait rail', () => {
  test('container is in the rail range and the rail replaces the tab bar', async ({ page }) => {
    await openApp(page)
    const width = await appWidth(page)
    expect(width).toBeGreaterThanOrEqual(600)
    expect(width).toBeLessThan(1024)
    expect(modeForWidth(width)).toBe('rail')

    const items = await navItems(page)
    expect(items.map((i) => i.label)).toEqual(TAB_LABELS)
    expect(items).toHaveLength(TAB_COUNT)

    // A left column 72px wide (--rail-w), stacked vertically, not along the bottom.
    const rail = await boxOf(nav(page))
    expect(rail.x).toBe(0)
    expect(rail.width).toBeCloseTo(72, 0)
    expect(rail.y).toBeCloseTo(0, 0)
    expect(rail.height).toBeCloseTo(page.viewportSize().height, 0)
    for (let i = 1; i < items.length; i += 1) expect(items[i].y).toBeGreaterThan(items[i - 1].y)
    for (const item of items) expect(item.x + item.width).toBeLessThanOrEqual(rail.width + 0.5)

    // The labelled sidebar and the inspector slot are not part of this layout.
    await expect(page.locator('.nav-brand-text')).toBeHidden()
    await expect(page.locator('.inspector-slot')).toBeHidden()
  })

  test('hides the bottom tab bar: nothing is docked to the bottom edge', async ({ page }) => {
    await openApp(page)
    const rail = await boxOf(nav(page))
    // With --tabbar-h 0 the nav no longer spans the width of the screen.
    expect(rail.width).toBeLessThan(page.viewportSize().width / 4)
    const { tabbarH } = await safeAreaMetrics(page)
    expect(tabbarH, 'rail and sidebar layouts zero the tab bar offset').toBe(0)
    await expectNoHorizontalScroll(page)
  })

  test('touch input model: coarse pointer, no real-hover query', async ({ page }) => {
    await openApp(page)
    expect(await inputModel(page)).toEqual({ hoverFine: false, coarse: true })
  })

  test('nav and list targets are at least 44px', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    expect(await undersizedTargets(nav(page), MIN_TARGET)).toEqual([])
    const row = page.locator('.life-row').first()
    await expect(row).toBeVisible()
    expect((await boxOf(row)).height).toBeGreaterThanOrEqual(MIN_TARGET)
  })

  test('top bar targets are at least 44px', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    expect(await undersizedTargets(page.locator('.topbar'), MIN_TARGET)).toEqual([])
  })

  // Touch browsers still match :hover on the tapped element, so the check is on the
  // painted result: the hover rules sit behind (hover: hover) and (pointer: fine), so a
  // tap must not paint the --hover colour (nav.css, blueprint "input model").
  test('no sticky hover after a tap on a nav item or a list row', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    const hoverColor = await tokenColor(page, '--hover')

    const current = nav(page).getByRole('link', { name: /Life/ })
    const navBefore = await backgroundOf(current)
    const navColorBefore = await current.evaluate((el) => getComputedStyle(el).color)
    await current.tap() // same route: nothing navigates, the finger stays on the item
    expect(await backgroundOf(current)).toBe(navBefore)
    expect(await current.evaluate((el) => getComputedStyle(el).color)).toBe(navColorBefore)

    const other = nav(page).getByRole('link', { name: /Invest/ })
    await other.tap()
    await expect(other).toHaveAttribute('aria-current', 'page')
    await nav(page).getByRole('link', { name: /Life/ }).tap()
    await expect(page.locator('.life-row').first()).toBeVisible()
    // The previously tapped Invest item is idle again and must not look hovered.
    expect(await backgroundOf(other)).not.toBe(hoverColor)

    const row = page.locator('.life-row').first()
    const rowBefore = await backgroundOf(row)
    expect(rowBefore).not.toBe(hoverColor)
    await row.tap()
    await expect(row).toHaveAttribute('data-selected', 'true')
    expect(await backgroundOf(row)).toBe(rowBefore) // selection paints a ring, not a hover tint
  })
})
