// iPad 11" portrait (834x1194, touch): the 72px rail replaces the bottom tabs.
import { test, expect } from '../fixtures/hermetic.js'
import { KV_SEED } from '../fixtures/data.js'
import { KV_EMBER_DAY, NOW } from '../fixtures/ember-day.js'
import {
  TAB_COUNT, TAB_LABELS, MIN_TARGET, onlyProjects, openApp, nav, navItems, appWidth, modeForWidth,
  expectNoHorizontalScroll, boxOf, inputModel, backgroundOf, tokenColor, undersizedTargets, safeAreaMetrics,
} from '../helpers/layout.js'
import { SCREENS, openScreen } from '../helpers/contrast.js'

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
    // Ember (DESIGN.md 2): a selected row is filled with --accent-dim. That is the selection,
    // not a hover tint: it must be exactly the selected fill and never the --hover colour.
    const selected = await backgroundOf(row)
    expect(selected).toBe(await tokenColor(page, '--accent-dim'))
    expect(selected).not.toBe(hoverColor)
  })
})

// Today on the fixture day (Sun 15 Nov 2026, 16:18): seeded through kvSeed, clock fixed.
test.describe('iPad portrait rail: Today (Ember)', () => {
  test.use({ kvSeed: { ...KV_SEED, ...KV_EMBER_DAY, tasks: [], settings: { ...KV_SEED.settings, theme: 'ember' } } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

  const nextUp = (page) => page.getByRole('region', { name: 'Next up' })
  const tiles = (page) => page.getByRole('complementary', { name: 'Today tiles' })

  async function openToday(page) {
    await openApp(page, '#/today')
    await expect(nextUp(page).getByRole('heading')).toHaveText('Gym, leg day')
  }

  test('no horizontal scroll at 834 and the layout follows the container width', async ({ page }) => {
    await openToday(page)
    await expect(page.getByRole('list', { name: 'Today timeline' })).toBeVisible()
    expect(page.viewportSize().width).toBe(834)
    await expectNoHorizontalScroll(page)
    const home = await boxOf(page.locator('.today-home'))
    const main = await boxOf(page.locator('.today-home-main'))
    const side = await boxOf(tiles(page))
    expect(home.width).toBeLessThan(900)
    expect(side.y, 'tiles stack below').toBeGreaterThanOrEqual(main.y + main.height - 0.5)
  })

  test('dailies are one row and Done on next up moves it from Gym to Call mom', async ({ page }) => {
    await openToday(page)
    const cells = page.getByRole('navigation', { name: 'Dailies' }).locator('.ember-daily')
    await expect(cells).toHaveCount(5)
    const ys = []
    for (let i = 0; i < 5; i++) ys.push((await boxOf(cells.nth(i))).y)
    for (const y of ys) expect(y).toBeCloseTo(ys[0], 0)
    await nextUp(page).getByRole('button', { name: 'Done' }).click()
    await expect(nextUp(page).getByRole('heading')).toHaveText('Call mom')
    await expectNoHorizontalScroll(page)
  })
})

// Every restyled screen (Today, Agents, Settings panel and the 17 sub-views) in this layout,
// on the fixed sample day. The full per-screen load/contrast matrix lives in
// e2e/ember-screens.spec.js; these assert what is specific to this shell.
test.describe('iPad portrait: every screen', () => {
  test.use({ kvSeed: { ...KV_SEED, ...KV_EMBER_DAY, settings: { ...KV_SEED.settings, theme: 'ember' } } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

  for (const screen of SCREENS) {
    test(`${screen.name}: 72px rail, no horizontal scroll`, async ({ page }) => {
      await openScreen(page, screen)
      expect(modeForWidth(await appWidth(page))).toBe('rail')
      expect((await boxOf(nav(page))).width).toBeCloseTo(72, 0)
      expect((await navItems(page)).map((i) => i.label)).toEqual(TAB_LABELS)
      await expectNoHorizontalScroll(page)
      await expect(page.getByRole('button', { name: 'New entry' })).toHaveCount(1)
    })
  }
})
