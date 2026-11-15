// Desktop Chrome (1440x900, mouse): sidebar plus inspector, real hover, Ctrl+K
// palette, keyboard focus ring. The blueprint says "3 panes"; the hybrid decision
// (errata C-4, E-03) is sidebar + list + inspector, with no separate third pane.
import { test, expect } from '../fixtures/hermetic.js'
import {
  TAB_LABELS, onlyProjects, openApp, nav, navItems, appWidth, modeForWidth, boxOf,
  expectNoHorizontalScroll, inputModel, focusRing, backgroundOf, tokenColor,
} from '../helpers/layout.js'

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
