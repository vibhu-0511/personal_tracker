# E4 gate report: screens

Base: `claude/sweet-lamport-ftfktp` after E4 waves 1 to 6 (23 tasks, merged one at a time through the runner).

## Checks (final tree)

| Check | Result |
|---|---|
| `npm test` | pass, 1289 / 0 fail (run twice) |
| `npm run lint` | pass, 0 errors (25 warnings) |
| `npm run build` | pass |
| `npm run size` | pass: entry JS 130.16 / 135 kB, total JS 322.52 / 325 kB |
| `npm run test:e2e -- --trace off` | pass, 899 passed, 0 failed, 630 skipped (per-project skips), 7.1 min |

## What E4 delivered

Life frame (header, chips with counts), Reminders (sections, overdue chip, snooze presets, repeat with a weekday picker), Notes (tag chips, Pinned and Recent, title and excerpt rows), Tasks, Habits and Growth restyled (task due time added), Money Spend (month card, logging strip with the real per-day pattern, nothing-spent button, day groups), Budgets, Goals and Loans, Logic (solved-today ring, daily puzzle status, code streak, problem rows with badges), Exams and the DSA frame, Invest, Agents, Settings as its own lazy panel (dailies, code goal), README and a device checklist, the legacy stylesheet moved to tokens with a test that blocks colour literals.

## Found by the e2e matrix and fixed during the phase

The matrix runs 19 screens at four widths under ember and cream with contrast, touch-target, console and scroll checks. First run: about 105 failures from eight real bugs, all fixed (E4-18 to E4-23): external Google Fonts on the DSA page (page and its CSP tightened), ember placeholder, primary-button and form-field contrast, cream accent and border contrast, Tutor tile and wellbeing toggle contrast, five touch targets under 44px, Agents composer border, and the cream warn colour.

## Still open: owner task E4-U1

`E4-U1` (run `docs/qa/ember-device-checklist.md` on your iPhone and iPad and write `docs/plan/ember/reports/E4-device-check.md`) is yours. Nothing in this plan has been run on a real device; all checks above are emulated browsers (Chromium). The web app is shippable after E4 per the plan, but treat device behaviour (safe areas, keyboard, home-screen install, fonts offline) as unverified until E4-U1.

## Notes and risks

1. Total JS is 322.5 of 325 kB: the next feature needs a decision (D21).
2. The two `h1` "Today" (shell topbar and header) and the wrapping timeline time labels remain (D10, D11).
3. Reminders week strip was not built (D19); Money stats grid was removed (D18); task due time added (D20).
4. One merge gate went red once and passed on retry (D12).
5. `selectedId` is still not in the route (needs `routes.js`).
6. Changes to existing assertions, each with your approval or noted in DECISIONS.md: appPaletteData (lazy import), shellCss (plus stays mounted), legacyColours (ember button text dark), csp (fonts hosts absent), ipad-portrait hover (selection uses --accent-dim, D24).
