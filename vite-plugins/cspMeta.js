import { buildMainPolicy } from '../config/csp.js'

export const NATIVE_MODE = 'native'

// Capacitor serves the bundle from a custom scheme, so the vercel.json headers
// (config/csp.js) never reach it; the same policy is delivered as a <meta> tag.
// Two differences from the header form:
//  - frame-ancestors is ignored in a meta element, so it is omitted.
//  - Content-Security-Policy-Report-Only is not honoured in a meta element, so
//    the native policy is enforcing. Check every tab in a native build.
//
// The API origin (VITE_API_BASE) is added to connect-src, since the native app
// calls an absolute API base rather than the same-origin /api/*.

// Reduce VITE_API_BASE to an origin. Empty means same-origin: nothing to add.
export function apiOrigin(apiBase) {
  const raw = String(apiBase ?? '').trim()
  if (!raw) return ''
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`cspMeta: VITE_API_BASE is not an absolute URL: ${raw}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`cspMeta: VITE_API_BASE must be http(s): ${raw}`)
  }
  return url.origin
}

// Main-app policy with frame-ancestors removed and the API origin in connect-src.
export function buildNativePolicy({ apiBase, supabaseHost } = {}) {
  const origin = apiOrigin(apiBase)
  const base = buildMainPolicy(supabaseHost ? { supabaseHost } : undefined)
  return base
    .split('; ')
    .filter((d) => !d.startsWith('frame-ancestors'))
    .map((d) => {
      if (!origin || !d.startsWith('connect-src ')) return d
      return d.split(' ').includes(origin) ? d : `${d} ${origin}`
    })
    .join('; ')
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

// Injects the CSP <meta> only when mode is 'native'; web builds are untouched.
export function cspMetaPlugin({ mode, apiBase, supabaseHost } = {}) {
  return {
    name: 'forge:csp-meta',
    transformIndexHtml() {
      if (mode !== NATIVE_MODE) return undefined
      const content = buildNativePolicy({ apiBase, supabaseHost })
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: escapeAttr(content) },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

export default cspMetaPlugin
