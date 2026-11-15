# E2 gate report: Today

Base: `claude/sweet-lamport-ftfktp` after E2 waves 1 to 4, merged through the runner (tests and build after each merge).

## Checks (final tree)

| Check | Result |
|---|---|
| `npm test` | pass, 1177 / 0 fail (run twice) |
| `npm run lint` | pass, 0 errors (16 warnings) |
| `npm run build` | pass |
| `npm run size` | pass: entry JS 130.44 / 135 kB, total JS 306.78 / 310 kB |
| `npm run test:e2e -- --trace off` | pass, 112 passed, 117 skipped (per-project skips) |

## What E2 delivered

Header with streak and 3/5 ring, five dailies in one row, overdue chip with one-tap "Today 7 PM", next-up card (Done, Snooze 1h), time-ordered timeline with the Now row, kept tiles (Streak, Wallet, Pets, Watch, Tutor) in a second column from 900px, once-a-day confetti (none under reduced motion). Screenshots: `E2-today-phone.png` (390px) and `E2-today-ipad-landscape.png` (1194px).

## What the e2e run found and fixed during the phase

- Second column never applied (container queried itself): fixed in E2-10.
- Timeline note rows all read "Note" (notes store text in `body`): fixed in E2-11.
- E2-09 (not in the original plan): entry JS had gone over budget at the E1 gate; fixed by lazy-loading the Life provider and palette, budget unchanged.

## Notes and risks

1. **Flaky merge gate once:** E2-10's first merge attempt was reverted by a red gate; the same merge passed on retry and the full suite passed twice afterwards. Cause not identified (suspect a timing-dependent test).
2. Timeline time labels wrap to two lines ("9:00 / AM") in the 50px column; cosmetic, logged as D11.
3. Two `h1` "Today" on the page (shell topbar and header), logged as D10.
4. The Lazy Life provider adds a brief boot placeholder; the e2e boot tests pass.
5. Mood daily still links to Life growth until the capture sheet exists (E3).
