# E1 gate report: data and logic

Base: `claude/sweet-lamport-ftfktp` after E1 waves 1 to 4 (17 tasks incl. E1-15 to E1-17 added during the phase), merged one at a time through the runner, tests and build green after each.

## Checks

| Check | Result |
|---|---|
| `npm test` | pass, 1164 / 0 fail |
| `npm run lint` | pass, 0 errors (16 warnings, 9 pre-existing) |
| `npm run build` | pass |
| `npm run size` | **FAIL: entry JS 136.42 kB vs 135.00 kB limit** (total JS 302.74 / 310 kB ok, entry CSS 8.63 / 12 kB ok) |
| `npm run test:e2e -- --trace off` | pass, 34 passed, 75 skipped |
| plan lint | 0 errors, 1 warning (wave E1#2 is 7 wide because E1-15 and E1-16 were added) |

## Size failure (needs your decision)

- Entry JS is 1.4 kB over the 135 kB budget set deliberately in an earlier CI change ("entry JS stays under 135 kB").
- It was already 136.43 kB before E1-17, so the overage came in during waves 1 to 3 (data and context modules now reachable from the shell: LifeData reminder actions, MoneyContext dailyLog, searchIndex, and the shell-level Life provider path). Not bisected per task.
- Options: (A) raise the entry limit to 140 kB in `scripts/ci/bundle-budget.mjs` / CI (one-line, honest about growth); (B) a task to lazy-load the reminder-action and capture code so entry returns under 135 kB. I recommend B only if the budget matters to you; otherwise A.
- Not changed by me: weakening a budget is your call.

## Exit criteria in `plan.json` for E1

See PLAN.md. Pure-logic modules all have node tests: puzzleProgress, moneyDayLog, reminderLogic (DST and month-end), captureParse (40 cases), noteTitle, dailies, timeline, useDailiesLoad, lifeReminderActions, moneyNoSpend, dailyLogStore, appPaletteData, commandPaletteReminders, emberUiCream.

## Cream fix check (E1-15)

Screenshot `E1-gallery-cream-dailies.png`: the done check glyph and empty SegDots are visible under cream. The fix adds one `#fff` fallback literal in `ember-ui.css` (the only colour literal in that file).

## Deviations and plan edits

- Added E1-15 (cream fixes from the E0 gate), E1-16 (palette gets reminders), E1-17 (Life provider at the shell so the palette has data); the gate moved to wave 5.
- Write lists widened by one file each, never weakening a test: E1-06 (four stale key-list tests, 17 to 18 keys), E1-11 (`src/store.js`, `test/syncRouter.test.js`).
- E1-07 amended after review: puzzle daily counts a dated bank solve OR the Lichess mark (decision E9).
- Fixed in tooling: graph runner only recognised `P<n>` phase ids, so Ember tasks always showed queued; artifact test leaked caller env.

## Risks to carry into E2

1. `markNoSpend` in `useDailies` does an unserialised read then write of `dailyLog`; add `mutateDailyLog` to the store if two writers can overlap (E1-09 and E1-11 also write it).
2. E1-09 (Puzzles) has no test of the dated solve or the Lichess mark, only code review. E2 e2e should cover both.
3. Mood daily links to the Life growth page until the capture sheet exists (E3).
4. Shell-level `LifeDataProvider` now runs mood derivation, checklist migration and the app badge on every tab, not only Life.
5. `public/dsa/mastery-map.html` still references fonts.googleapis.com (owner decision from E0, unanswered).
6. `docs/adr/README.md` has no ADR 0005 row (outside any task's writes so far).
