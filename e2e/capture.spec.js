// Global capture end to end: the plus (Fab) on every tab, the lazy CaptureSheet, the N
// shortcut, palette commands, per-screen default type, parsed chips, Undo, focus return,
// and the forge:open-capture event from Money and Today.
//
// Hermetic: the day is Sun 15 Nov 2026 16:18 (page.clock, see today-ember.spec.js) and the
// kv_store is seeded through kvSeed, so "Today", "tomorrow 6pm" and the spend daily read
// the same on every run. The seed has no expense dated today, so the Spend daily starts
// open and a captured expense is what completes it.
import { test, expect } from './fixtures/hermetic.js'
import { KV_SEED } from './fixtures/data.js'
import { KV_EMBER_DAY, NOW } from './fixtures/ember-day.js'
import { openApp, expectNoHorizontalScroll, boxOf } from './helpers/layout.js'

const at = (day, h, m = 0) => new Date(2026, 10, day, h, m).getTime()

const SEED = {
  ...KV_SEED,
  ...KV_EMBER_DAY,
  settings: { ...KV_SEED.settings, theme: 'ember' },
  // Nothing spent today; yesterday's rows stay so Money is not empty.
  expenses: KV_EMBER_DAY.expenses.filter((e) => e.date < at(15, 0)),
  tasks: [],
  habits: [],
  moodLog: [],
  progress: {},
  puzzleProgress: {},
  dailyLog: {},
}

test.use({ kvSeed: SEED })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
})

const fab = (page) => page.getByRole('button', { name: 'New entry' })
const sheet = (page) => page.locator('dialog.capture-sheet')
const field = (page) => sheet(page).locator('.capture-field')
const chip = (page, key) => sheet(page).locator(`.capture-chip[data-chip="${key}"]`)
const primary = (page) => sheet(page).locator('.capture-primary')
const toast = (page) => page.locator('.toast')
const pressedType = (page) => sheet(page).locator('.capture-type[aria-pressed="true"]')
const dailies = (page) => page.getByRole('navigation', { name: 'Dailies' })

async function openCapture(page) {
  await fab(page).click()
  await expect(sheet(page)).toBeVisible()
}

// Fails the test on any console error, reported at the end of the test body.
function watchConsole(page) {
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  return errors
}

test.describe('plus button and sheet', () => {
  for (const hash of ['#/today', '#/life/tasks', '#/logic/code', '#/money/overview', '#/invest', '#/agents']) {
    test(`Fab is on ${hash}`, async ({ page }) => {
      await openApp(page, hash)
      await expect(fab(page)).toBeVisible()
      await expect(fab(page)).toHaveCount(1)
    })
  }

  test('tap opens the sheet on the lazy chunk, with the type chips', async ({ page }) => {
    const scripts = []
    page.on('request', (r) => { if (/\/assets\/.*\.js$/.test(r.url())) scripts.push(r.url()) })
    await openApp(page, '#/today')
    await expect(page.locator('.today-header-title')).toHaveText('Today')
    await page.waitForLoadState('networkidle')
    const before = scripts.length
    await openCapture(page)
    await expect(sheet(page).getByRole('group', { name: 'Type' }).locator('.capture-type'))
      .toHaveText(['Expense', 'Note', 'Reminder', 'Task', 'Habit', 'Solve', 'Mood'])
    await expect(field(page)).toBeFocused()
    expect(scripts.length, 'the sheet loads as its own chunk on first tap').toBeGreaterThan(before)
  })

  test('N opens it, but not while typing in a field', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    await page.locator('body').press('n')
    await expect(sheet(page)).toBeVisible()
    // Typing "n" inside the sheet's field types, and does not reopen or reset anything.
    await field(page).fill('')
    await field(page).press('n')
    await expect(field(page)).toHaveValue('n')
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeHidden()
    // An unrelated text field: the palette search must take "n" as text.
    await page.keyboard.press('Control+k')
    const search = page.getByRole('combobox')
    await expect(search).toBeFocused()
    await search.press('n')
    await expect(search).toHaveValue('n')
    await expect(sheet(page)).toBeHidden()
  })

  test('Esc closes and focus returns to the plus button', async ({ page }) => {
    await openApp(page, '#/today')
    await openCapture(page)
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeHidden()
    await expect(fab(page)).toBeFocused()
  })
})

test.describe('palette commands', () => {
  const COMMANDS = [
    ['New expense', 'Expense'],
    ['New note', 'Note'],
    ['New reminder', 'Reminder'],
    ['New task', 'Task'],
    ['New habit check-in', 'Habit'],
    ['Log a solve', 'Solve'],
    ['Log mood', 'Mood'],
  ]
  for (const [label, type] of COMMANDS) {
    test(`"${label}" opens capture on ${type}`, async ({ page }) => {
      await openApp(page, '#/today')
      await page.keyboard.press('Control+k')
      await page.getByRole('combobox').fill(label)
      await page.getByRole('option', { name: new RegExp(label) }).first().click()
      await expect(sheet(page)).toBeVisible()
      await expect(pressedType(page)).toHaveText(type)
    })
  }
})

test.describe('default type per screen', () => {
  const SCREENS = [
    ['#/money/overview', 'Expense'],
    ['#/life/reminders', 'Reminder'],
    ['#/life/notes', 'Note'],
    ['#/life/tasks', 'Task'],
    ['#/logic/code', 'Solve'],
  ]
  for (const [hash, type] of SCREENS) {
    test(`${hash} opens on ${type}`, async ({ page }) => {
      await openApp(page, hash)
      await openCapture(page)
      await expect(pressedType(page)).toHaveText(type)
    })
  }
})

test.describe('default type after in-app navigation', () => {
  test('tapping the Reminders pill in Life, then plus, opens on Reminder', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    await page.getByRole('button', { name: /Reminders/ }).click()
    await expect(page.getByText('Dentist check-up')).toBeVisible()
    await openCapture(page)
    await expect(pressedType(page)).toHaveText('Reminder')
  })

  test('tapping the Notes pill in Life, then plus, opens on Note', async ({ page }) => {
    await openApp(page, '#/life/tasks')
    await page.getByRole('button', { name: /Notes/ }).click()
    await openCapture(page)
    await expect(pressedType(page)).toHaveText('Note')
  })
})

test.describe('saving', () => {
  test('"450 coffee with raj" parses to chips and adds the expense, Undo restores', async ({ page }) => {
    await openApp(page, '#/today')
    await expect(dailies(page).locator('[data-daily="spend"]')).toHaveAttribute('data-state', 'open')
    await openCapture(page)
    await field(page).fill('450 coffee with raj')
    await expect(sheet(page).locator('.capture-parsed .capture-chip')).toHaveText(['₹450', /Coffee/, 'Today', 'With Raj'])
    await primary(page).click()
    await expect(sheet(page)).toBeHidden()
    await expect(toast(page)).toContainText('Expense added')
    await expect(dailies(page).locator('[data-daily="spend"]')).toHaveAttribute('data-state', 'done')
    await expect(dailies(page).locator('[data-daily="spend"]')).toContainText('₹450')

    // The row is under Today in Money.
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /Money/ }).click()
    const today = page.locator('.spend-day', { has: page.locator('.spend-day-head', { hasText: 'Today' }) })
    await expect(today.getByText('with Raj')).toBeVisible()
    await expect(today).toContainText('450')

    // Undo from the toast removes it again.
    await expect(toast(page)).toBeVisible()
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(page.getByText('with Raj', { exact: false }).filter({ hasText: '450' })).toHaveCount(0)
    await expect(page.locator('.spend-day-head', { hasText: 'Today' })).toHaveCount(0)
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /Today/ }).click()
    await expect(dailies(page).locator('[data-daily="spend"]')).toHaveAttribute('data-state', 'open')
  })

  test('an expense needs a category: the button stays disabled until one is picked', async ({ page }) => {
    await openApp(page, '#/today')
    await openCapture(page)
    await field(page).fill('450 zzz')
    await expect(chip(page, 'category')).toHaveText('Pick category')
    await expect(primary(page)).toBeDisabled()
    await chip(page, 'category').click()
    await sheet(page).getByRole('group', { name: 'Edit Category' }).getByRole('button').first().click()
    await expect(primary(page)).toBeEnabled()
  })

  test('"call mom tomorrow 6pm" creates a reminder, Undo removes it', async ({ page }) => {
    await openApp(page, '#/life/reminders')
    await page.getByRole('button', { name: /Reminders/ }).click()
    await expect(page.getByText('Dentist check-up')).toBeVisible()
    await openCapture(page)
    await expect(pressedType(page)).toHaveText('Reminder')
    await field(page).fill('call mom tomorrow 6pm')
    await expect(chip(page, 'time')).toContainText('6:00')
    await primary(page).click()
    await expect(sheet(page)).toBeHidden()
    await expect(toast(page)).toContainText('Reminder added')
    // The seed already has "Call mom" (today 18:00); the new one makes two.
    const calls = page.getByText('call mom', { exact: false })
    await expect(calls).toHaveCount(2)
    await toast(page).getByRole('button', { name: 'Undo' }).click()
    await expect(calls).toHaveCount(1)
  })

  test('a failed save keeps the sheet open and the text', async ({ page }) => {
    // Money's data is still loading when the sheet saves: its goals read (issued once the
    // shell is on screen, after the boot reads) is held back for 5 s. The expense write is then
    // refused with "Still loading" rather than replacing stored expenses with an empty list,
    // and the sheet must stay open with what was typed.
    await page.addInitScript(() => {
      const get = IDBObjectStore.prototype.get
      IDBObjectStore.prototype.get = function slowGoals(key) {
        if (key !== 'goals' || !document.querySelector('nav.nav')) return get.call(this, key)
        const held = {}
        setTimeout(() => {
          const real = get.call(this, key)
          real.onsuccess = () => { held.result = real.result; held.onsuccess?.({ target: held }) }
          real.onerror = () => { held.error = real.error; held.onerror?.({ target: held }) }
        }, 5000)
        return held
      }
    })
    await openApp(page, '#/today')
    await openCapture(page)
    await field(page).fill('450 coffee with raj')
    await expect(primary(page)).toBeEnabled()
    await primary(page).click()
    await expect(sheet(page).getByRole('alert')).toContainText(/loading/i)
    await expect(sheet(page)).toBeVisible()
    await expect(field(page)).toHaveValue('450 coffee with raj')
    await expect(toast(page)).toHaveCount(0)
  })
})

test.describe('open-capture event', () => {
  test('Money + Expense opens capture on Expense, not the old sheet', async ({ page }) => {
    await openApp(page, '#/money/overview')
    await page.getByRole('button', { name: '+ Expense' }).click()
    await expect(sheet(page)).toBeVisible()
    await expect(pressedType(page)).toHaveText('Expense')
    await expect(primary(page)).toHaveText('Add expense')
    await expect(page.locator('dialog[open]')).toHaveCount(1)
  })

  test('Money + Income preselects income', async ({ page }) => {
    await openApp(page, '#/money/overview')
    await page.getByRole('button', { name: '+ Income' }).click()
    await expect(sheet(page)).toBeVisible()
    await expect(pressedType(page)).toHaveText('Expense')
    await expect(primary(page)).toHaveText('Add income')
    await field(page).fill('5000 salary')
    await expect(primary(page)).toBeEnabled()
  })

  test("Today's Mood cell opens capture on Mood", async ({ page }) => {
    await openApp(page, '#/today')
    await dailies(page).locator('[data-daily="mood"]').click()
    await expect(sheet(page)).toBeVisible()
    await expect(pressedType(page)).toHaveText('Mood')
    await expect(page).toHaveURL(/#\/today/)
  })
})

test.describe('phone width', () => {
  test('type chip row scrolls sideways at 390px without scrolling the page; no console errors', async ({ page }) => {
    const errors = watchConsole(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await openApp(page, '#/today')
    await openCapture(page)
    const row = sheet(page).locator('.capture-types')
    const m = await row.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, ox: getComputedStyle(el).overflowX }))
    expect(m.ox).toBe('auto')
    expect(m.sw, 'chip row overflows its box').toBeGreaterThan(m.cw)
    await row.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    expect(await row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    await expectNoHorizontalScroll(page)
    const box = await boxOf(sheet(page))
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(errors, 'console errors').toEqual([])
  })

  test('opening and saving produces no console errors', async ({ page }) => {
    const errors = watchConsole(page)
    await openApp(page, '#/life/tasks')
    await openCapture(page)
    await field(page).fill('buy milk')
    await primary(page).click()
    await expect(toast(page)).toContainText('Task added')
    expect(errors, 'console errors').toEqual([])
  })
})
