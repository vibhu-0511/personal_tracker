// Generates the PWA icon set from assets/icon-source.svg: `npm run icons`.
// Output is written to public/icons/. Run twice and the bytes are identical.
import { copyFileSync, mkdirSync } from 'node:fs'
import { defineConfig } from '@vite-pwa/assets-generator/config'

const SOURCE = 'assets/icon-source.svg'
const OUT_DIR = 'public/icons'
const BACKGROUND = '#0a0c10'

// The generator writes each asset to resolve(dirname(source), name), so names are
// relative to assets/. The CLI never writes favicon.svg, so it is copied from the source.
mkdirSync(OUT_DIR, { recursive: true })
copyFileSync(SOURCE, `${OUT_DIR}/favicon.svg`)

export default defineConfig({
  // The head-link and manifest snippets the CLI prints are advisory only; hrefs for PNG/ICO come out
  // with a leftover "../public" because of the output-folder trick above. Use /icons/<file> by hand.
  headLinkOptions: { preset: '2023', basePath: '/icons/', resolveSvgName: () => 'favicon.svg' },
  preset: {
    transparent: {
      sizes: [192, 512],
      favicons: [[48, '../public/icons/favicon.ico']],
      resizeOptions: { background: BACKGROUND },
    },
    // Flame fits in the central 60 percent of the source; padding 0.1 keeps it well inside the 80 percent safe zone.
    maskable: { sizes: [512], padding: 0.1, resizeOptions: { background: BACKGROUND } },
    // Opaque, no transparency: iOS fills transparent areas with black.
    apple: { sizes: [180], padding: 0, resizeOptions: { background: BACKGROUND } },
    assetName: (type, size) => {
      const names = {
        transparent: `pwa-${size.width}x${size.height}.png`,
        maskable: `maskable-icon-${size.width}x${size.height}.png`,
        apple: `apple-touch-icon-${size.width}x${size.height}.png`,
      }
      return `../${OUT_DIR}/${names[type]}`
    },
  },
  images: [SOURCE],
})
