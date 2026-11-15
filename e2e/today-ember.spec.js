// Today (Ember) end to end: the fixed sample day of the mockups, Sun 15 Nov 2026 16:18.
//
// Hermetic: the day is seeded through kvSeed (fake Supabase kv_store) and the page
// clock is fixed to NOW, so "next up", the overdue chip and the ring read the same
// on every run and in every timezone. The fixture covers reminders, expenses and
// notes; habits, mood and code are added here so the five dailies read as in
// DESIGN.md 5.1: Habits 3/3, Spend ₹640, Mood Good, Code 1/3, Puzzle Open (ring 3/5).
import { test, expect } from './fixtures/hermetic.js'
import { KV_SEED } from './fixtures/data.js'
import { KV_EMBER_DAY, NOW } from './fixtures/ember-day.js'
import {
  onlyProjects, openApp, appWidth, boxOf, expectNoHorizontalScroll, undersizedTargets,
} from './helpers/layout.js'

const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).getTime()

// 12 consecutive days up to and including today: the "12-DAY STREAK" of the mockup.
const checkins = Array.from({ length: 12 }, (_, i) => `2026-11-${String(15 - i).padStart(2, '0')}`)
const habits = [
  { id: 'h-run', name: 'Run', species: 'fox', checkins, createdAt: at(1, 8) },
  { id: 'h-read', name: 'Read', species: 'owl', checkins, createdAt: at(1, 8) },
  { id: 'h-water', name: 'Water', species: 'cat', checkins, createdAt: at(1, 8) },
]

const DAY_SEED = {
  ...KV_SEED,
  ...KV_EMBER_DAY,
  settings: { ...KV_SEED.settings, theme: 'ember' },
  tasks: [],
  habits,
  moodLog: [{ date: '2026-11-15', valence: 75, source: 'logged' }],
  progress: { 'cf-1': { status: 'solved', updatedAt: at(15, 10) } },
  puzzleProgress: {},
  dailyLog: {},
}

test.use({ kvSeed: DAY_SEED })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
})

const dailies = (page) => page.getByRole('navigation', { name: 'Dailies' })
const nextUp = (page) => page.getByRole('region', { name: 'Next up' })
const overdue = (page) => page.getByRole('group', { name: 'Overdue' })
const timeline = (page) => page.getByRole('list', { name: 'Today timeline' })
const tiles = (page) => page.getByRole('complementary', { name: 'Today tiles' })

async function openToday(page) {
  await openApp(page, '#/today')
  await expect(page.locator('.today-header-title')).toHaveText('Today')
  await expect(dailies(page)).toBeVisible()
  await expect(nextUp(page)).toBeVisible()
}

test.describe('Today, fixture day', () => {
  test('header reads the date, the streak and the 3/5 ring', async ({ page }) => {
    await openToday(page)
    await expect(page.locator('.today-header-line')).toHaveText('SUN 15 NOV · 12-DAY STREAK')
    await expect(page.locator('.today-header-count')).toHaveText('3/5')
    await expect(page.getByRole('img', { name: /3 of 5 dailies done/ })).toBeVisible()
  })

  test('the five dailies read Habits 3/3, Spend ₹640, Mood Good, Code 1/3, Puzzle Open', async ({ page }) => {
    await openToday(page)
    const cells = dailies(page).locator('.ember-daily')
    await expect(cells).toHaveCount(5)
    const expected = [
      ['habits', 'Habits', '3/3', 'done', '#/life/habits'],
      ['spend', 'Spend', '₹640', 'done', '#/money/overview'],
      ['mood', 'Mood', 'Good', 'done', '#/life/growth'],
      ['code', 'Code', '1/3', 'open', '#/logic/code'],
      ['puzzle', 'Puzzle', 'Open', 'open', '#/logic/puzzles'],
    ]
    for (const [i, [id, label, value, state, href]] of expected.entries()) {
      const cell = cells.nth(i)
      await expect(cell).toHaveAttribute('data-daily', id)
      await expect(cell).toHaveAttribute('data-state', state)
      await expect(cell).toHaveAttribute('href', href)
      await expect(cell.locator('.ember-daily-label')).toHaveText(label)
      await expect(cell.locator('.ember-daily-value')).toContainText(value)
    }
  })

  test('next up is Gym; the overdue chip names Renew car insurance', async ({ page }) => {
    await openToday(page)
    await expect(nextUp(page).getByRole('heading')).toHaveText('Gym, leg day')
    await expect(nextUp(page)).toContainText(/5:00\s?PM · in 42 min/)
    await expect(overdue(page)).toContainText('1 overdue')
    await expect(overdue(page)).toContainText('Renew car insurance')
    await expect(overdue(page).getByRole('button', { name: 'Today 7 PM' })).toBeVisible()
  })

  test('sections come in order: header, dailies, overdue, next up, timeline, tiles', async ({ page }) => {
    await openToday(page)
    await expect(timeline(page)).toBeVisible()
    await expect(tiles(page)).toBeVisible()
    const tops = []
    for (const locator of [
      page.locator('.today-header'), dailies(page), overdue(page), nextUp(page), timeline(page), tiles(page),
    ]) tops.push((await boxOf(locator)).y)
    // Strictly increasing y; the tile column sits beside the timeline from 900px, so it
    // only has to start at or below the header there.
    for (let i = 1; i < 5; i++) expect(tops[i], `section ${i} below section ${i - 1}`).toBeGreaterThan(tops[i - 1])
    const wide = (await boxOf(page.locator('.today-home'))).width >= 900
    if (wide) expect(tops[5]).toBeLessThanOrEqual(tops[3])
    else expect(tops[5]).toBeGreaterThan(tops[4])
  })

  test('timeline lists today in time order with one Now row between 1:10 PM and 5:00 PM', async ({ page }) => {
    await openToday(page)
    const rows = timeline(page).locator('.tl-row')
    const titles = await rows.locator('.tl-title').allTextContents()
    expect(titles.map((t) => t.toLowerCase())).toEqual([
      'pay credit card bill', 'transport', 'binary lifting: lca in o(log n)', 'groceries', 'coffee',
      'now',
      'gym, leg day', 'call mom', 'codeforces round (div. 2)',
    ])
    // Done reminders stay in the list.
    await expect(rows.filter({ hasText: 'Pay credit card bill' })).toHaveAttribute('data-kind', 'done')
    await expect(rows.filter({ hasText: 'Now' })).toHaveAttribute('aria-current', 'time')
  })

  test('Done on next up completes Gym and next up moves to Call mom', async ({ page }) => {
    await openToday(page)
    await nextUp(page).getByRole('button', { name: 'Done' }).click()
    await expect(nextUp(page).getByRole('heading')).toHaveText('Call mom')
    await expect(nextUp(page)).toContainText(/6:00\s?PM/)
    await expect(timeline(page).locator('.tl-row', { hasText: 'Gym, leg day' })).toHaveAttribute('data-kind', 'done')
    // The ring counts dailies, not reminders.
    await expect(page.locator('.today-header-count')).toHaveText('3/5')
  })

  test('checking Gym in the timeline moves next up to Call mom', async ({ page }) => {
    await openToday(page)
    const gym = page.getByRole('checkbox', { name: 'Mark done: Gym, leg day' })
    await gym.click()
    await expect(nextUp(page).getByRole('heading')).toHaveText('Call mom')
  })

  test('Snooze 1h moves Gym to one hour from now (5:18 PM)', async ({ page }) => {
    await openToday(page)
    await nextUp(page).getByRole('button', { name: 'Snooze 1h' }).click()
    // 16:18 + 1h = 17:18, still before Call mom at 18:00, so Gym stays next up.
    await expect(nextUp(page)).toContainText(/5:18\s?PM · in 60 min/)
    await expect(nextUp(page).getByRole('heading')).toHaveText('Gym, leg day')
    const row = timeline(page).locator('.tl-row', { hasText: 'Gym, leg day' })
    await expect(row.locator('.tl-time')).toHaveText(/5:18\s?PM/)
  })

  test('Today 7 PM on the overdue chip reschedules the insurance reminder', async ({ page }) => {
    await openToday(page)
    await overdue(page).getByRole('button', { name: 'Today 7 PM' }).click()
    await expect(overdue(page)).toHaveCount(0)
    await expect(timeline(page).locator('.tl-row', { hasText: 'Renew car insurance' }).locator('.tl-time'))
      .toHaveText(/7:00\s?PM/)
  })

  test('with nothing left on the clock next up shows the empty state', async ({ page }) => {
    await openToday(page)
    for (const title of ['Gym, leg day', 'Call mom', 'Codeforces Round (Div. 2)']) {
      await expect(nextUp(page).getByRole('heading')).toHaveText(title)
      await nextUp(page).getByRole('button', { name: 'Done' }).click()
    }
    await expect(nextUp(page)).toContainText('Nothing left on the clock.')
  })

  test('no horizontal scroll with the fixture day', async ({ page }) => {
    await openToday(page)
    await expect(timeline(page)).toBeVisible()
    await expectNoHorizontalScroll(page)
  })

  test('kept tiles are present and none is a removed tile', async ({ page }) => {
    await openToday(page)
    await expect(tiles(page)).toBeVisible()
    await expect(page.locator('.today-grid-cells > *')).toHaveCount(5)
  })
})

test.describe('Today, phone 390', () => {
  onlyProjects(test, ['iphone-14'])

  test('five dailies sit in one row, each inside the screen, text clipped only by ellipsis', async ({ page }) => {
    await openToday(page)
    expect(await appWidth(page)).toBeLessThan(600)
    const cells = dailies(page).locator('.ember-daily')
    await expect(cells).toHaveCount(5)
    const viewport = page.viewportSize()
    const boxes = []
    for (let i = 0; i < 5; i++) boxes.push(await boxOf(cells.nth(i)))
    for (const b of boxes) {
      expect(b.y, 'one row').toBeCloseTo(boxes[0].y, 0)
      expect(b.x).toBeGreaterThanOrEqual(0)
      expect(b.x + b.width).toBeLessThanOrEqual(viewport.width + 0.5)
    }
    for (let i = 1; i < 5; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width - 0.5)

    // Nothing spills out of its cell: any text wider than its box must be ellipsised.
    const clipped = await dailies(page).evaluate((nav) => [...nav.querySelectorAll('.ember-daily')].flatMap((cell) => {
      const cr = cell.getBoundingClientRect()
      return [...cell.querySelectorAll('.ember-daily-label, .ember-daily-value, .ember-daily-value > span')].flatMap((el) => {
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        const problems = []
        if (r.left < cr.left - 0.5 || r.right > cr.right + 0.5) problems.push('outside cell')
        const overflows = el.scrollWidth > el.clientWidth + 0.5
        if (overflows && cs.textOverflow !== 'ellipsis') problems.push('clipped without ellipsis')
        if (cs.whiteSpace === 'normal' && el.classList.contains('ember-daily-label') && r.height > parseFloat(cs.fontSize) * 2) problems.push('wrapped')
        return problems.map((p) => `${cell.dataset.daily} ${el.className || el.tagName}: ${p}`)
      })
    }))
    expect(clipped).toEqual([])
    await expectNoHorizontalScroll(page)
  })

  test('Done and Snooze 1h are at least 44px targets', async ({ page }) => {
    await openToday(page)
    expect(await undersizedTargets(nextUp(page), 44, 'button')).toEqual([])
    expect(await undersizedTargets(overdue(page), 44, 'button')).toEqual([])
  })

  test('tiles stack below the timeline in one column', async ({ page }) => {
    await openToday(page)
    const main = await boxOf(page.locator('.today-home-main'))
    const side = await boxOf(tiles(page))
    expect(side.y).toBeGreaterThanOrEqual(main.y + main.height - 0.5)
    expect(side.x).toBeCloseTo(main.x, 0)
  })
})

test.describe('Today, second column from 900px', () => {
  // Any project: the rule follows the width of the Today container, not the device.
  test('tiles sit beside the timeline exactly when the container is 900px or wider', async ({ page }) => {
    await openToday(page)
    await expect(timeline(page)).toBeVisible()
    const home = await boxOf(page.locator('.today-home'))
    const main = await boxOf(page.locator('.today-home-main'))
    const side = await boxOf(tiles(page))
    if (home.width >= 900) {
      expect(side.x, 'tiles are the right column').toBeGreaterThanOrEqual(main.x + main.width - 0.5)
      expect(side.y, 'tiles start at the top of the screen').toBeLessThanOrEqual(main.y + 1)
      expect(main.width).toBeGreaterThan(side.width) // 3fr / 2fr
    } else {
      expect(side.y, 'tiles below the main column').toBeGreaterThanOrEqual(main.y + main.height - 0.5)
    }
    await expectNoHorizontalScroll(page)
  })
})
