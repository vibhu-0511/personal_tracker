import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { apiDevPlugin } from './vite-plugins/apiDev.js'
import { cspMetaPlugin } from './vite-plugins/cspMeta.js'

// generateSW; manifest stays the hand-edited public/manifest.json, registration is
// done by src/pwa (injectRegister false), and the dev server never gets a SW.
const pwa = VitePWA({
  registerType: 'prompt',
  injectRegister: false,
  manifest: false,
  devOptions: { enabled: false },
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
    globIgnores: ['dsa/**', 'puzzles.json'],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/^\/api\//, /^\/dsa\//],
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
      { urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: 'NetworkOnly' },
      {
        urlPattern: ({ url }) => url.pathname === '/puzzles.json',
        handler: 'StaleWhileRevalidate',
        options: { cacheName: 'puzzles', expiration: { maxEntries: 4 } },
      },
    ],
  },
})

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  // The CSP meta is for the native (Capacitor) build only; the plugin is a no-op
  // in every other mode, so the web build output is unchanged.
  const csp = cspMetaPlugin({ mode, apiBase: process.env.VITE_API_BASE })
  return { plugins: [react(), pwa, apiDevPlugin(), csp] }
})
