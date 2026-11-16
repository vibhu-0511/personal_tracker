# Decisions log (owner decisions, with the default taken so work never waits)

Standing rule from the owner (2026-11-15): note each decision here, do not wait, keep building; where a newer task depends on an older one, go with the recommendation. Change any row and the affected tasks can be redone.

| # | Decision | Recommendation / default taken | Status | Affects |
|---|---|---|---|---|
| D1 | Phase gate sign-offs E0, E1 | Proceed through gates without stopping; gate reports are still written to `reports/` | Taken (owner said continue) | all gates |
| D2 | Entry JS over budget at E1 (136.4 vs 135 kB) | Lazy-load Life provider and palette (E2-09), budget unchanged. Raising the limit was blocked by the permission system and not pursued | Owner approved the one test edit | E2-09 |
| D3 | `public/dsa/mastery-map.html` still references fonts.googleapis.com | Leave as is (static pre-existing page, not app code); revisit if offline use of the map matters | Open, default taken | E0-04 acceptance |
| D4 | Fab visible on desktop | Keep visible (DESIGN.md: one Fab on every tab) | Open, default taken | E0-10, E3 |
| D5 | ADR README row for 0005 | Add it in a later docs task | Open, default taken | docs/adr |
| D6 | Mood daily links to Life growth until capture sheet exists | Repoint in E3 | Open, default taken | E1-07, E3 |
| D7 | `dailyLog` write race (`markNoSpend` read-then-write) | Add `mutateDailyLog` to the store in E2/E3 if two writers overlap | Open, default taken | E1-11, E1-12 |
| D8 | Owner-only tasks: E4-U1 (device checklist), E5-U1 (Mac, Apple account, shell), E5-U2 (device test) | Prepare everything, skip these, continue other tasks; E5 native tasks stay queued behind E5-U1 | Waiting on owner | E4 gate, E5 |
| D9 | E2-06 e2e merged with 11 known failing tests (two real Today bugs, fixed in E2-10 and E2-11 next wave); the merge gate only runs npm test and build | Merge the specs, fix next wave, gate requires e2e green | Taken | E2-06, E2-10, E2-11 |
| D10 | Page has two h1 "Today" (shell topbar and TodayHeader) | Address in E4 (shell restyle); specs use .today-header-title | Open, default taken | E2-04, E4 |
| D11 | Timeline time labels wrap to two lines in the 50px column | Widen to ~64px or drop the AM/PM line break in a later polish task (E4 restyle) | Open, default taken | E0-09, E2-03 |
| D12 | One merge gate (E2-10) went red once and passed on retry | Treat as a flaky test; look for it if it recurs | Open, default taken | tooling |
| D13 | Solve panel "Solved a problem" writes a synthetic `quick-<ts>` id into the Code `progress` map | Accept for now (counts toward the Code daily); revisit if the Logic screens list unknown ids | Open, default taken | E3-09, E1-07 |
| D14 | Money provider mounted at the shell (like Life in E1-17) so global capture can write expenses and dailyLog safely; MoneyApp reuses it | Option 1 from the E3-07 report; E3-07 moved to wave 4, E3-10 wave 5, gate wave 6 | Taken | E3-07 |
| D15 | Total JS budget 310 -> 325 kB after global capture | Raised; owner approved explicitly (2026-11-16) | Done | E3-07 |
| D16 | E3-10 e2e merged with 15 known failing tests (two real app bugs: focus not returned to the Fab, Life ignores the route sub-view); fixes are E3-12 and E3-13 | Merge specs, fix next wave, gate requires e2e green | Taken | E3-10, E3-12, E3-13 |
