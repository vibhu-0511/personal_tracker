import { defineConfig, devices } from '@playwright/test'

// Only Chromium is installed here (and in CI), so every project pins
// browserName 'chromium' and keeps just the emulation bits (touch, mobile,
// dsf, UA) of the iOS descriptors. Real WebKit behaviour is a manual check.
// `defaultBrowserType` is dropped so a descriptor cannot pull in webkit.
function device(name, overrides = {}) {
  const { defaultBrowserType: _ignored, ...descriptor } = devices[name]
  return { ...descriptor, browserName: 'chromium', ...overrides }
}

const desktop = device('Desktop Chrome', { viewport: { width: 1440, height: 900 } })

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.js/,
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  projects: [
    // Matrix from the blueprint (docs/plan/blueprint.txt:64-69). Playwright's
    // own iPhone 14 is 390x664 and "iPad 11" is the iPad Pro 11 descriptor.
    {
      name: 'iphone-14',
      testIgnore: /pwa\.spec/,
      use: device('iPhone 14', { viewport: { width: 390, height: 844 } }),
    },
    {
      name: 'ipad-portrait',
      testIgnore: /pwa\.spec/,
      use: device('iPad Pro 11'),
    },
    {
      name: 'ipad-landscape',
      testIgnore: /pwa\.spec/,
      use: device('iPad Pro 11 landscape'),
    },
    {
      // Split View one-third width: no descriptor exists.
      name: 'ipad-split-third',
      testIgnore: /pwa\.spec/,
      use: device('iPad Pro 11', {
        viewport: { width: 375, height: 1024 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 2,
      }),
    },
    {
      name: 'desktop-chrome',
      testIgnore: /pwa\.spec/,
      use: desktop,
    },
    // Only project that lets the service worker register. R7-09 adds
    // e2e/pwa.spec.js and needs no config edit.
    {
      name: 'pwa',
      testMatch: /pwa\.spec\.js/,
      use: { ...desktop, serviceWorkers: 'allow' },
    },
  ],
  webServer: {
    command: 'npm run build:e2e && npm run preview:e2e',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
