# E0 gate report: foundations

Base: `claude/sweet-lamport-ftfktp` after waves E0-W1..W3 (12 tasks merged one at a time, tests and build green after each).

## Checks

| Check | Result |
|---|---|
| `npm test` | pass, 1025 / 0 fail |
| `npm run lint` | pass, 0 errors (9 pre-existing warnings) |
| `npm run build` | pass |
| `npm run size` | pass, total JS 300.48 / 310 kB, entry CSS 8.63 / 12 kB |
| `npm run test:e2e -- --trace off` | pass, 34 passed, 75 skipped (projects excluded by spec config) |
| plan lint | 0 errors, 0 warnings |

## Exit criteria

| Criterion | Result |
|---|---|
| npm test, lint, build, size, e2e green | pass |
| Ember default for new install; saved theme untouched | pass (`test/emberTheme.test.js`: default ember, saved ocean unchanged) |
| gallery.html shows every new primitive under ember and cream | pass with 1 finding (below) |
| six labelled tabs with line icons fit at 390px | pass (`e2e/matrix/phone.spec.js`, iphone-14 and ipad projects) |
| `tools/live/wave.mjs` runs against the Ember plan | pass (`prep`, `brief`, `status` used for waves 2 to 4) |

Screenshots: `E0-gallery-ember.png`, `E0-gallery-cream.png` (same folder).

## Findings for the owner

1. **Cream: DailyCell done glyph is invisible.** The check mark in the done circle does not show under `cream` (done and open then differ by colour only). Cause is likely `--success-fg` defined only in `ember.css`. Fix is in `src/ui/ember-ui.css` (E0-08 file); not in this gate's write list, so left alone. Suggest a fallback `var(--success-fg, var(--on-accent))` in a small follow-up task.
2. **Cream: empty SegDots squares are faint.** Low contrast vs the cream background; same follow-up.
3. **Fonts not precached by default**: fixed in E0-07 (`woff2` added to workbox globPatterns).
4. **`public/dsa/mastery-map.html` references fonts.googleapis.com.** Pre-existing static file; the E0-04 acceptance ("no request anywhere in dist") is met for app code only. Needs your call.
5. **`docs/adr/README.md` has no row for ADR 0005** (outside E0-02 writes).
6. **Fab is visible on desktop** (no 1024px hide). Per DESIGN.md "one Fab on every tab"; change if you want it mobile-only.
7. `Nav.jsx` keeps the brand emoji in `.nav-brand` (tab icons only were in scope).

## Plan edits

- `E0-07` now also writes `vite.config.js` and imports `fonts.css` and `ember.css`.
