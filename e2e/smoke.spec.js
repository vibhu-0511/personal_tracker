import { test, expect } from './fixtures/hermetic.js'

const VIEWPORTS = {
  'iphone-14': { width: 390, height: 844 },
  'ipad-portrait': { width: 834, height: 1194 },
  'ipad-landscape': { width: 1194, height: 834 },
  'ipad-split-third': { width: 375, height: 1024 },
  'desktop-chrome': { width: 1440, height: 900 },
}

test('app boots signed in with seeded kv_store rows', async ({ page, hermetic }, testInfo) => {
  expect(page.viewportSize()).toEqual(VIEWPORTS[testInfo.project.name])

  const kvReads = []
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/kv_store') && req.method() === 'GET') kvReads.push(req.url())
  })

  await page.goto('/#/life/tasks')

  // Signed in: no sign-in form, the tab bar is up.
  await expect(page.getByLabel('Email')).toHaveCount(0)
  const tabBar = page.getByRole('navigation', { name: 'Primary' })
  await expect(tabBar).toBeVisible()
  await expect(tabBar.getByRole('link', { name: /Life/ })).toBeVisible()

  // Seeded kv_store rows were fetched and rendered (settings.cfHandle is set,
  // so the first-run settings panel stays closed; tasks come from the seed).
  await expect(page.getByRole('heading', { name: 'Settings' })).toHaveCount(0)
  await expect(page.getByText('Seeded task')).toBeVisible()
  await expect.poll(() => kvReads.length).toBeGreaterThan(0)
  expect(kvReads.some((u) => u.includes('key=eq.settings'))).toBe(true)

  // Hermetic guarantees: nothing external escaped, nothing blew up. The
  // fixture re-asserts both at teardown; checked here for a clear message.
  expect(hermetic.pageErrors).toEqual([])
  expect(hermetic.unfulfilled).toEqual([])
})
