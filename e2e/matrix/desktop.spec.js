// Desktop Chrome (1440x900, mouse): sidebar plus inspector, real hover, Ctrl+K
// palette, keyboard focus ring. The blueprint says "3 panes"; the hybrid decision
// (errata C-4, E-03) is sidebar + list + inspector, with no separate third pane.
import { test, expect } from '../fixtures/hermetic.js'
import { KV_SEED } from '../fixtures/data.js'
import { KV_EMBER_DAY, NOW } from '../fixtures/ember-day.js'
import {
  TAB_LABELS, onlyProjects, openApp, nav, navItems, appWidth, modeForWidth, boxOf,
  expectNoHorizontalScroll, inputModel, focusRing, backgroundOf, tokenColor,
} from '../helpers/layout.js'
import { SCREENS, openScreen } from '../helpers/contrast.js'

onlyProjects(test, ['desktop-chrome'])

test.describe('desktop 1440x900', () => {
  test('shows sidebar and inspector, no tab bar', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    expect(modeForWidth(await appWidth(page))).toBe('sidebar')
    const side = await boxOf(nav(page))
    expect(side.width).toBeCloseTo(220, 0)
    expect((await navItems(page)).map((i) => i.label)).toEqual(TAB_LABELS)
    await expect(page.getByLabel('Inspector')).toBeVisible()
    await expect(page.getByRole('region', { name: 'List' })).toBeVisible()
    await expectNoHorizontalScroll(page)

    await page.locator('.life-row', { hasText: 'Seeded task' }).first().click()
    await expect(page.getByLabel('Inspector').getByLabel('Title')).toHaveValue('Seeded task')
  })

  test('real hover is on: a nav item takes the hover colour under the mouse', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    expect(await inputModel(page)).toEqual({ hoverFine: true, coarse: false })
    const idle = nav(page).getByRole('link', { name: /Invest/ })
    const before = await backgroundOf(idle)
    await idle.hover()
    // Positive control for the touch specs: hover paints --hover here.
    // (Polled: the background has a 0.2s transition.)
    const hoverColor = await tokenColor(page, '--hover')
    await expect.poll(() => backgroundOf(idle)).toBe(hoverColor)
    expect(hoverColor).not.toBe(before)
  })

  test('Ctrl+K opens the command palette and Escape closes it', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    const palette = page.getByRole('dialog', { name: 'Command palette' })
    await expect(palette).toBeHidden()

    await page.keyboard.press('Control+k')
    await expect(palette).toBeVisible()
    const input = palette.getByRole('combobox')
    await expect(input).toBeFocused()

    // It navigates: filter to Money and confirm with Enter.
    await input.fill('money')
    await page.keyboard.press('Enter')
    await expect(palette).toBeHidden()
    await expect(page).toHaveURL(/#\/money/)

    await page.keyboard.press('Control+k')
    await expect(palette).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(palette).toBeHidden()
  })

  test('Tab shows a focus ring on the focused element', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    // Mouse users get no ring: nothing is focused at the start.
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)

    // Walk the first stops of the tab order; each must paint a visible ring.
    const seen = []
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Tab')
      const active = page.locator(':focus')
      await expect(active).toBeVisible()
      const ring = await focusRing(active)
      seen.push(await active.evaluate((el) => el.getAttribute('aria-label') || el.textContent.trim().slice(0, 20) || el.tagName))
      expect(ring.focusVisible, `focus-visible on stop ${i + 1}`).toBe(true)
      expect(ring.style, `outline style on stop ${i + 1}`).not.toBe('none')
      expect(ring.width, `outline width on stop ${i + 1}`).toBeGreaterThanOrEqual(2)
    }
    // The sidebar links come first in DOM order, so the order is nav before content.
    expect(seen[0]).toMatch(/Today/)
  })
})

// Today on the fixture day (Sun 15 Nov 2026, 16:18): seeded through kvSeed, clock fixed.
test.describe('desktop 1440x900: Today (Ember)', () => {
  test.use({ kvSeed: { ...KV_SEED, ...KV_EMBER_DAY, tasks: [], settings: { ...KV_SEED.settings, theme: 'ember' } } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

  const nextUp = (page) => page.getByRole('region', { name: 'Next up' })
  const tiles = (page) => page.getByRole('complementary', { name: 'Today tiles' })

  async function openToday(page) {
    await openApp(page, '#/today')
    await expect(nextUp(page).getByRole('heading')).toHaveText('Gym, leg day')
  }

  test('no horizontal scroll at 1440 and the layout follows the container width', async ({ page }) => {
    await openToday(page)
    await expect(page.getByRole('list', { name: 'Today timeline' })).toBeVisible()
    expect(page.viewportSize().width).toBe(1440)
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
test.describe('desktop: every screen', () => {
  test.use({ kvSeed: { ...KV_SEED, ...KV_EMBER_DAY, settings: { ...KV_SEED.settings, theme: 'ember' } } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

  for (const screen of SCREENS) {
    test(`${screen.name}: sidebar and a fine pointer, no horizontal scroll`, async ({ page }) => {
      await openScreen(page, screen)
      expect(modeForWidth(await appWidth(page))).toBe('sidebar')
      expect(await inputModel(page)).toEqual({ hoverFine: true, coarse: false })
      expect((await navItems(page)).map((i) => i.label)).toEqual(TAB_LABELS)
      await expectNoHorizontalScroll(page)
      await expect(page.getByRole('button', { name: 'New entry' })).toHaveCount(1)
    })
  }
})
