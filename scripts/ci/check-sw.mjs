// Verifies the built service worker and manifest in dist/ (run after `npm run build`).
// Asserts: precache has index.html and icons but not dsa/ or puzzles.json, the navigate
// denylist covers /api/ and /dsa/, /api/ and *.supabase.co are NetworkOnly, and
// manifest.json lists the 192, 512 and maskable PNGs with id and scope.
//
// Usage: node scripts/ci/check-sw.mjs [distDir]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const dist = resolve(process.argv[2] ?? 'dist')
const failures = []
const check = (ok, msg) => {
  if (!ok) failures.push(msg)
}

const swPath = join(dist, 'sw.js')
check(existsSync(swPath), 'dist/sw.js is missing')
check(
  existsSync(dist) && readdirSync(dist).some((f) => /^workbox-.+\.js$/.test(f)),
  'dist/workbox-*.js is missing',
)

if (existsSync(swPath)) {
  const sw = readFileSync(swPath, 'utf8')

  // Precache entries: workbox-build emits `{url:"x",revision:...}` (or `{revision,url}`).
  const urls = [...sw.matchAll(/\burl:\s*"([^"]+)"/g)].map((m) => m[1])
  check(urls.length > 0, 'no precache entries found in sw.js')
  check(urls.includes('index.html'), 'precache is missing index.html')
  for (const icon of ['pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png']) {
    check(urls.includes(`icons/${icon}`), `precache is missing icons/${icon}`)
  }
  check(!urls.some((u) => u.startsWith('dsa/')), 'precache must not contain dsa/')
  check(!urls.some((u) => u.includes('puzzles.json')), 'precache must not contain puzzles.json')

  // Navigation fallback denylist: the SW builds RegExps from the configured patterns.
  const deny = /denylist:\s*\[([^\]]*)\]/.exec(sw)
  check(Boolean(deny), 'navigate denylist not found in sw.js')
  if (deny) {
    check(/\\\/api\\\//.test(deny[1]), 'navigate denylist does not cover /api/')
    check(/\\\/dsa\\\//.test(deny[1]), 'navigate denylist does not cover /dsa/')
  }
  check(/createHandlerBoundToURL\("\/index\.html"\)/.test(sw), 'navigateFallback is not /index.html')

  // Runtime caching: every NetworkOnly route must be registered with the NetworkOnly strategy.
  check(/\.NetworkOnly\b/.test(sw), 'no NetworkOnly strategy in sw.js')
  const routes = [...sw.matchAll(/registerRoute\(((?:(?!registerRoute\().)*?),new \w+\.(\w+)[(,]/gs)].map((m) => ({
    matcher: m[1],
    strategy: m[2],
  }))
  const networkOnly = routes.filter((r) => r.strategy === 'NetworkOnly').map((r) => r.matcher)
  check(networkOnly.some((m) => m.includes('/api/')), '/api/ is not NetworkOnly')
  check(networkOnly.some((m) => m.includes('.supabase.co')), '*.supabase.co is not NetworkOnly')
}

const manifestPath = join(dist, 'manifest.json')
check(existsSync(manifestPath), 'dist/manifest.json is missing')
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'))
  check(Boolean(m.id), 'manifest.json has no id')
  check(Boolean(m.scope), 'manifest.json has no scope')
  const icons = m.icons ?? []
  const has = (src, sizes, purpose) =>
    icons.some(
      (i) =>
        i.src === src &&
        i.sizes === sizes &&
        i.type === 'image/png' &&
        (i.purpose ?? 'any').split(/\s+/).includes(purpose),
    )
  check(has('/icons/pwa-192x192.png', '192x192', 'any'), 'manifest is missing the 192 PNG icon')
  check(has('/icons/pwa-512x512.png', '512x512', 'any'), 'manifest is missing the 512 PNG icon')
  check(
    has('/icons/maskable-icon-512x512.png', '512x512', 'maskable'),
    'manifest is missing the maskable PNG icon',
  )
}

if (failures.length) {
  console.error(`check-sw: ${failures.length} problem(s)`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('check-sw: ok')
