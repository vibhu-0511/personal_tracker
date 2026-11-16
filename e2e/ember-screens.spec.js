// Every restyled screen, first browser run: Today, Agents, the Settings panel and the 17
// sub-views (Life: Tasks, Reminders, Notes, Habits, Growth; Money: Spend, Budgets, Goals,
// Loans; Logic: Code, Puzzles, Exams, DSA; Invest: Learn, Research, Watchlist).
//
// For each screen, on the four matrix widths (390, 834, 1194, 1440) and under both the
// ember and the cream theme (settings.theme in kvSeed):
//   - loads with no console error and no uncaught page error;
//   - no horizontal scroll;
//   - exactly one plus button ("New entry");
//   - six labelled tabs, all on screen at 390 (bottom bar) and present at every width;
//   - touch targets of the primary controls are >= 44px under a coarse pointer;
//   - WCAG AA contrast from rendered colours (e2e/helpers/contrast.js): 4.5:1 for body
//     and secondary text, 3:1 for large text and form-field borders. Run at 390 and 1440,
//     the two layouts that differ (bottom tabs vs sidebar + inspector).
//
// Hermetic: kvSeed (fake Supabase kv_store) and page.clock fixed at NOW, the same fixed day
// as today-ember.spec.js and capture.spec.js. Real failures stay failing: nothing here is
// skipped, loosened or exempted to get green.
import { test, expect } from './fixtures/hermetic.js'
import { KV_SEED } from './fixtures/data.js'
import { KV_EMBER_DAY, NOW } from './fixtures/ember-day.js'
import {
  TAB_COUNT, TAB_LABELS, onlyProjects, nav, navItems, appWidth, modeForWidth, inputModel,
  expectNoHorizontalScroll, undersizedTargets,
} from './helpers/layout.js'
import { SCREENS, openScreen, contrastReport, formatFailures } from './helpers/contrast.js'

const MATRIX = ['iphone-14', 'ipad-portrait', 'ipad-landscape', 'desktop-chrome']
const CONTRAST_PROJECTS = ['iphone-14', 'desktop-chrome']
const THEMES = ['ember', 'cream']

onlyProjects(test, MATRIX)

const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).getTime()
const checkins = Array.from({ length: 12 }, (_, i) => `2026-11-${String(15 - i).padStart(2, '0')}`)

const seedFor = (theme) => ({
  ...KV_SEED,
  ...KV_EMBER_DAY,
  settings: { ...KV_SEED.settings, theme },
  habits: [
    { id: 'h-run', name: 'Run', species: 'fox', checkins, createdAt: at(1, 8) },
    { id: 'h-read', name: 'Read', species: 'owl', checkins: checkins.slice(2), createdAt: at(1, 8) },
  ],
  moodLog: [{ date: '2026-11-15', valence: 75, source: 'logged' }],
  progress: { 'cf-1': { status: 'solved', updatedAt: at(15, 10) } },
})

// Interactive controls a thumb must hit: buttons, form fields, summaries, the tab bar and
// the sub-view pills. Inline text links inside prose are not primary controls.
// A bare checkbox or radio is a 18px glyph inside its <label> row: the label is the target.
const PRIMARY = 'button, [role="button"], input:not([type="hidden"], [type="checkbox"], [type="radio"]), '
  + 'label:has(> input[type="checkbox"], > input[type="radio"]), select, textarea, summary, nav a, a.ui-subnav-pill'

function watchConsole(page) {
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  return errors
}

for (const theme of THEMES) {
  test.describe(`screens, ${theme} theme`, () => {
    test.use({ kvSeed: seedFor(theme) })
    test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

    for (const screen of SCREENS) {
      test.describe(screen.name, () => {
        test('loads clean, no horizontal scroll, one plus button', async ({ page }) => {
          const errors = watchConsole(page)
          await openScreen(page, screen)
          await expect(page.locator('html')).toHaveAttribute('data-accent', theme)
          await expectNoHorizontalScroll(page)
          const fab = page.getByRole('button', { name: 'New entry' })
          await expect(fab).toHaveCount(1)
          await expect(fab).toBeVisible()
          expect(errors, 'console errors').toEqual([])
        })

        test('six labelled tabs, all on screen at phone width', async ({ page }) => {
          await openScreen(page, screen)
          const items = await navItems(page)
          expect(items).toHaveLength(TAB_COUNT)
          expect(items.map((i) => i.label)).toEqual(TAB_LABELS)
          const width = await appWidth(page)
          if (modeForWidth(width) !== 'phone') return
          const viewport = page.viewportSize()
          for (const item of items) {
            expect(item.y, `${item.label} on the first row`).toBeCloseTo(items[0].y, 0)
            expect(item.x).toBeGreaterThanOrEqual(0)
            expect(item.x + item.width).toBeLessThanOrEqual(viewport.width + 0.5)
            expect(item.width, `${item.label} has room for its label`).toBeGreaterThan(40)
          }
          const labels = nav(page).locator('.nav-label')
          const clipped = await labels.evaluateAll((els) => els
            .filter((el) => el.scrollWidth > el.clientWidth + 0.5).map((el) => el.textContent))
          expect(clipped, 'tab labels clipped').toEqual([])
        })

        test('primary controls are at least 44px under a coarse pointer', async ({ page }, testInfo) => {
          await openScreen(page, screen)
          const model = await inputModel(page)
          if (testInfo.project.name === 'desktop-chrome') {
            expect(model.coarse, 'desktop has a fine pointer').toBe(false)
            return
          }
          expect(model.coarse, 'touch projects report a coarse pointer').toBe(true)
          expect(await undersizedTargets(page.locator('.app-root'), 44, PRIMARY)).toEqual([])
        })

        test('text and form borders meet WCAG AA (4.5:1 text, 3:1 large text and borders)', async ({ page }, testInfo) => {
          test.skip(!CONTRAST_PROJECTS.includes(testInfo.project.name), 'contrast runs at 390 and 1440')
          await openScreen(page, screen)
          const report = await contrastReport(page)
          expect(report.checked, 'contrast probe saw text').toBeGreaterThan(0)
          // Unresolvable backgrounds (text on a raster image) are surfaced, not ignored.
          expect(report.unresolved, 'text over images cannot be measured').toEqual([])
          expect(formatFailures(report.failures), `contrast failures on ${screen.name} (${theme})`).toEqual([])
        })
      })
    }
  })
}
