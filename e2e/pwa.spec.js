// PWA offline spec. Runs only in the `pwa` project, the one project that lets
// the service worker register (every matrix project blocks them).
import { test, expect } from './fixtures/hermetic.js'

const ICS_PATH = '/api/ics?title=a&start=2026-01-01T00:00:00Z'

// Once the SW controls the page, navigations (reloads, goto) go through it.
async function boot(page) {
  await page.goto('/#/life/tasks')
  await page.evaluate(() => navigator.serviceWorker.ready)
  // First load is not controlled; reload so the active SW claims the page.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

const shell = (page) => page.getByRole('navigation', { name: 'Primary' })

test('service worker registers and takes control', async ({ page }) => {
  await page.goto('/#/life/tasks')
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toBe(new URL('/', page.url()).href)
  await boot(page)
})

test('offline reload still renders the app shell', async ({ page, context }) => {
  await boot(page)
  await expect(shell(page)).toBeVisible()

  await context.setOffline(true)
  try {
    await page.reload()
    await expect(shell(page)).toBeVisible()
    await expect(page.locator('#root')).not.toBeEmpty()
  } finally {
    await context.setOffline(false)
  }
})

test('navigating to /api/ics is not answered with the app shell', async ({ page }) => {
  await boot(page)

  const responses = []
  page.on('response', (res) => {
    if (new URL(res.url()).pathname === '/api/ics') responses.push(res)
  })

  // The endpoint sends Content-Disposition: attachment, so the navigation
  // becomes a download and goto rejects. Wait for the download alongside it.
  const downloading = page.waitForEvent('download')
  await page.goto(ICS_PATH).catch(() => {})
  const download = await downloading

  expect(download.suggestedFilename()).toBe('reminder.ics')
  await expect.poll(() => responses.length).toBeGreaterThan(0)
  const res = responses[0]
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/calendar')
  const body = await res.text().catch(() => null)
  if (body !== null) {
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).not.toMatch(/<!doctype html/i)
  }
})

test('/dsa/mastery-map.html is not answered with the app shell', async ({ page, context }) => {
  await boot(page)

  // Fresh page in the same context, so the SW controls it. The mastery map
  // loads CDN assets; abort them here so they are not counted as leaks.
  const dsa = await context.newPage()
  await dsa.route(/^https?:\/\/(?!localhost[:/])(?!127\.0\.0\.1[:/])/, (route) =>
    route.abort('blockedbyclient'),
  )
  const res = await dsa.goto('/dsa/mastery-map.html')
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('text/html')

  const html = await res.text()
  // The app shell mounts into #root; the static mastery map does not.
  expect(html).not.toContain('id="root"')
  expect(html).not.toContain('/src/main.jsx')
  await expect(dsa.locator('#root')).toHaveCount(0)
  await expect(dsa.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  await dsa.close()
})
