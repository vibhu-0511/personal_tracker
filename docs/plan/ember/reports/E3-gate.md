# E3 gate report: plus button and capture

Base: `claude/sweet-lamport-ftfktp` after E3 waves 1 to 7 (14 tasks, merged one at a time through the runner).

## Checks (final tree)

| Check | Result |
|---|---|
| `npm test` | pass, 1244 / 0 fail (run twice) |
| `npm run lint` | pass, 0 errors (19 warnings) |
| `npm run build` | pass |
| `npm run size` | pass: entry JS 131.92 / 135 kB, total JS 318.09 / 325 kB (limit raised 310 to 325 on owner approval, D15) |
| `npm run test:e2e -- --trace off` | pass, 272 passed, 0 failed, 117 skipped (per-project skips) |

## What E3 delivered

One plus button on every tab (aria-label "New entry"), lazy-loaded capture sheet with seven type chips, live parsed chips ("450 coffee with raj" gives ₹450, Coffee, Today, With Raj), editable chips (amount, category grid, when presets, repeat, person), non-text panels (habit check-in, solve, mood), save with Undo toast, failed save keeps the text, Esc closes and focus returns to the plus, `N` shortcut, seven palette commands, default type per screen, the old Money-only add button replaced (Money Add Expense and Income and Today's Mood cell open capture through the `forge:open-capture` event), Money provider hoisted to the shell so capture writes expenses and dailyLog safely. Screenshot: `E3-capture-phone.png`.

## Found by the e2e run and fixed during the phase

- Focus did not return to the plus (it unmounted while the sheet was open): E3-12, with one approved stale-assertion swap in `test/shellCss.test.js`.
- Life ignored the sub-view in the route (deep link and default type): E3-13.
- Phone matrix FAB-offset test targeted the removed Add transaction button: E3-14 (locator only).
- Money provider was not available at the shell: E3-07 hoisted it (as E1-17 did for Life).

## Notes and risks

1. `selectedId` is still not in the route for Life (needs `routes.js`/`router.js`, not in any task); screens keep their own selection.
2. `puzzleDone` in the capture host reads `dailyLog` only, not `puzzleProgress`.
3. The listener and income preselect are covered by e2e and source checks, not by a rendered unit test.
4. Quick-solve writes a synthetic `capture:<uuid>` id into `progress` (D13).
5. Total JS budget raised on your explicit approval (D15); entry JS stays under 135 kB.
