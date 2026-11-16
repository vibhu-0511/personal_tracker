// iPad 11" landscape (1194x834, touch): labelled sidebar plus the inspector pane
// (hybrid decision D5: inspector from 1024px; errata C-4, E-03). Rotating
// mid-session must keep the selected item.
import { test, expect } from '../fixtures/hermetic.js'
import { KV_SEED } from '../fixtures/data.js'
import { KV_EMBER_DAY, NOW } from '../fixtures/ember-day.js'
import {
  TAB_LABELS, onlyProjects, openApp, nav, navItems, appWidth, modeForWidth, boxOf,
  expectNoHorizontalScroll, inputModel, safeAreaMetrics,
} from '../helpers/layout.js'
import { SCREENS, openScreen } from '../helpers/contrast.js'

onlyProjects(test, ['ipad-landscape'])

const PORTRAIT = { width: 834, height: 1194 }
const LANDSCAPE = { width: 1194, height: 834 }

test.describe('iPad landscape sidebar and inspector', () => {
  test('shows the 220px sidebar with labels and the inspector pane', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    const width = await appWidth(page)
    expect(width).toBeGreaterThanOrEqual(1024)
    expect(modeForWidth(width)).toBe('sidebar')

    const side = await boxOf(nav(page))
    expect(side.x).toBe(0)
    expect(side.width).toBeCloseTo(220, 0)
    await expect(page.locator('.nav-brand-text')).toBeVisible()
    expect((await navItems(page)).map((i) => i.label)).toEqual(TAB_LABELS)
    expect((await safeAreaMetrics(page)).tabbarH).toBe(0)

    // List pane plus inspector pane, side by side, inside the viewport.
    const list = await boxOf(page.getByRole('region', { name: 'List' }))
    const inspector = page.getByLabel('Inspector')
    await expect(inspector).toBeVisible()
    await expect(inspector).toContainText('Select a task to edit it.')
    const insp = await boxOf(inspector)
    expect(list.x).toBeGreaterThanOrEqual(side.x + side.width)
    expect(insp.x).toBeGreaterThanOrEqual(list.x + list.width - 0.5)
    expect(insp.x + insp.width).toBeLessThanOrEqual(LANDSCAPE.width + 0.5)
    await expectNoHorizontalScroll(page)
  })

  test('selecting a task fills the inspector pane, no sheet opens', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    await page.locator('.life-row', { hasText: 'Seeded task' }).first().tap()
    const inspector = page.getByLabel('Inspector')
    await expect(inspector.getByLabel('Title')).toHaveValue('Seeded task')
    await expect(page.locator('dialog[open]')).toHaveCount(0)
  })

  test('rotating to portrait mid-session keeps the selected item', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    const row = page.locator('.life-row', { hasText: 'Seeded task' }).first()
    await row.tap()
    await expect(page.getByLabel('Inspector').getByLabel('Title')).toHaveValue('Seeded task')

    // Portrait: rail layout, the inspector pane is gone and the same editor moves
    // into the side sheet. The row is still the selected one, the route is unchanged.
    await page.setViewportSize(PORTRAIT)
    await expect.poll(() => appWidth(page)).toBe(PORTRAIT.width)
    await expect(page.locator('.nav-brand-text')).toBeHidden()
    expect((await boxOf(nav(page))).width).toBeCloseTo(72, 0)
    await expect(page.locator('dialog[open]').getByLabel('Title')).toHaveValue('Seeded task')
    await expect(row).toHaveAttribute('data-selected', 'true')
    await expect(page).toHaveURL(/#\/life\/tasks/)
    await expectNoHorizontalScroll(page)
  })

  test('rotating portrait and back keeps the selected item', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    const row = page.locator('.life-row', { hasText: 'Seeded task' }).first()
    await row.tap()
    await page.setViewportSize(PORTRAIT)
    await expect.poll(() => appWidth(page)).toBe(PORTRAIT.width)
    await expect(page.locator('dialog[open]').getByLabel('Title')).toHaveValue('Seeded task')

    await page.setViewportSize(LANDSCAPE)
    await expect.poll(() => appWidth(page)).toBe(LANDSCAPE.width)
    await expect(page.locator('dialog[open]')).toHaveCount(0)
    await expect(row).toHaveAttribute('data-selected', 'true')
    await expect(page.getByLabel('Inspector').getByLabel('Title')).toHaveValue('Seeded task')
    expect((await boxOf(nav(page))).width).toBeCloseTo(220, 0)
  })

  test('touch input model: coarse pointer, no real-hover query', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    expect(await inputModel(page)).toEqual({ hoverFine: false, coarse: true })
  })
})

// Today on the fixture day (Sun 15 Nov 2026, 16:18): seeded through kvSeed, clock fixed.
test.describe('iPad landscape sidebar and inspector: Today (Ember)', () => {
  test.use({ kvSeed: { ...KV_SEED, ...KV_EMBER_DAY, tasks: [], settings: { ...KV_SEED.settings, theme: 'ember' } } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

  const nextUp = (page) => page.getByRole('region', { name: 'Next up' })
  const tiles = (page) => page.getByRole('complementary', { name: 'Today tiles' })

  async function openToday(page) {
    await openApp(page, '#/today')
    await expect(nextUp(page).getByRole('heading')).toHaveText('Gym, leg day')
  }

  test('no horizontal scroll at 1194 and the layout follows the container width', async ({ page }) => {
    await openToday(page)
    await expect(page.getByRole('list', { name: 'Today timeline' })).toBeVisible()
    expect(page.viewportSize().width).toBe(1194)
    await expectNoHorizontalScroll(page)
    const home = await boxOf(page.locator('.today-home'))
    const main = await boxOf(page.locator('.today-home-main'))
    const side = await boxOf(tiles(page))
    expect(home.width, 'Today container beside the sidebar').toBeGreaterThanOrEqual(900)
    expect(side.x, 'tiles are a second column').toBeGreaterThanOrEqual(main.x + main.width - 0.5)
    expect(side.y).toBeLessThanOrEqual(main.y + 1)
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
test.describe('iPad landscape: every screen', () => {
  test.use({ kvSeed: { ...KV_SEED, ...KV_EMBER_DAY, settings: { ...KV_SEED.settings, theme: 'ember' } } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

  for (const screen of SCREENS) {
    test(`${screen.name}: 220px sidebar, no horizontal scroll`, async ({ page }) => {
      await openScreen(page, screen)
      expect(modeForWidth(await appWidth(page))).toBe('sidebar')
      expect((await boxOf(nav(page))).width).toBeCloseTo(220, 0)
      expect((await navItems(page)).map((i) => i.label)).toEqual(TAB_LABELS)
      await expectNoHorizontalScroll(page)
      await expect(page.getByRole('button', { name: 'New entry' })).toHaveCount(1)
    })
  }
})
