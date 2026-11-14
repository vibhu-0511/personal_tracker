// Shared Content-Security-Policy config (R5-15).
//
// Single source of truth for the CSP strings. vercel.json carries the same
// values as static JSON (test/csp.test.js fails if they drift), and the native
// build plugin (R5-16) can import buildMainPolicy() to emit a <meta> tag.
//
// Ships as Content-Security-Policy-Report-Only. To enforce, change
// CSP_HEADER_KEY to 'Content-Security-Policy' (and the matching key in
// vercel.json) after a manual pass through every tab.

export const CSP_HEADER_KEY = 'Content-Security-Policy-Report-Only'

// Supabase project host. Same project the DSA page hardcodes
// (public/dsa/mastery-map.html). The main app reads it from
// VITE_SUPABASE_URL at build time; update both if the project changes.
export const SUPABASE_HOST = 'pcqumjhiwalqkncnxguh.supabase.co'

const MFAPI = 'https://api.mfapi.in'

function render(directives) {
  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(' ')}` : name))
    .join('; ')
}

// Main app: one external module script, no inline script. style-src needs
// 'unsafe-inline' for the hand-written course HTML (src/invest/course.js).
// worker-src blob: is for canvas-confetti's worker.
export function buildMainPolicy({ supabaseHost = SUPABASE_HOST } = {}) {
  return render({
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", `https://${supabaseHost}`, `wss://${supabaseHost}`, MFAPI],
    'worker-src': ["'self'", 'blob:'],
    // The DSA map is embedded as a same-origin iframe (src/tabs/DsaView.jsx).
    'frame-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  })
}

// /dsa/*: standalone page with inline scripts, inline style= attributes, the
// supabase-js UMD bundle from jsDelivr and Google Fonts. frame-ancestors is
// 'self' (not 'none') because the main app embeds it.
export function buildDsaPolicy({ supabaseHost = SUPABASE_HOST } = {}) {
  return render({
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
    'connect-src': ["'self'", `https://${supabaseHost}`, `wss://${supabaseHost}`],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'self'"],
  })
}

// Headers for every path. No X-Frame-Options: it cannot express the DSA
// page's 'self' while the app forbids framing; frame-ancestors covers both.
export const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
]

// Vercel path-to-regexp sources. The main rule excludes /dsa so the two CSP
// headers never stack (stacked policies would both apply).
export const SOURCES = {
  all: '/(.*)',
  main: '/((?!dsa(?:/|$)).*)',
  dsa: '/dsa/(.*)',
}

// The vercel.json "headers" entries owned by this module.
export function buildHeaderRules(opts) {
  return [
    { source: SOURCES.all, headers: SECURITY_HEADERS },
    {
      source: SOURCES.main,
      headers: [{ key: CSP_HEADER_KEY, value: buildMainPolicy(opts) }],
    },
    {
      source: SOURCES.dsa,
      headers: [{ key: CSP_HEADER_KEY, value: buildDsaPolicy(opts) }],
    },
  ]
}
