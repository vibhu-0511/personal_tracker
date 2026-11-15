# ADR-0005: Ember design direction and defaults E1 to E10

- Status: Accepted for the direction (Ember, approved by the owner). Default assumed for each open decision E1 to E10; none is confirmed yet.
- Date: 2026-11-15
- Task: E0-02
- Related: `docs/plan/ember/DESIGN.md`, `docs/plan/ember/PLAN.md`, `docs/designs/app-directions.html`, ADR-0001 (hybrid shell and Today)

## Context

The owner reviewed the design directions in `docs/designs/app-directions.html` and chose direction A, Ember. It is a dark timeline Today, five dailies, one floating plus button that opens a typed capture sheet, and six labelled tabs kept. The build plan lives in `docs/plan/ember/plan.json`. Ten smaller questions were left open. So that nothing blocks, each has a default that the plan assumes. This ADR records the direction and those defaults in one place.

## Decision

Build Ember as specified in `docs/plan/ember/DESIGN.md`. It builds on the hybrid shell from ADR-0001 and does not replace it. Work proceeds with the defaults below. If the owner changes one, update the tasks in its "Affects" column before running them.

## Open decisions

| # | Decision | Default assumed | Status | Affects |
|---|---|---|---|---|
| E1 | Which five things count as dailies? | Habits (all checked in), expenses logged, mood logged, code solved (goal 3), daily puzzle. Reminders and tasks do not count. Changeable in Settings. | Default assumed | E1-07, E4-11 |
| E2 | What does a tap on plus open? | The capture sheet on the type that fits the screen (Expense on Money, Reminder on Reminders, Note on Notes, Solve on Logic), otherwise the last type used. All types are one chip away. | Default assumed | E3-04 |
| E3 | What happens to the nine Today tiles? | Tasks, Code, Spend and Mood tiles are replaced by the dailies and timeline. Streak, Wallet, Pets, Watch and Tutor stay below the timeline. | Default assumed | E2-05 |
| E4 | Does Ember replace the current themes? | No. Ember becomes the default for new installs; the seven existing themes stay selectable and the saved theme is kept. | Default assumed | E0-07 |
| E5 | Fonts: load Space Grotesk, Inter and JetBrains Mono, or stay on system fonts? | Self-host the three families (latin subset, under 160 kB) so the app works offline and matches the mockup. | Default assumed | E0-04 |
| E6 | Icons: keep emoji in the tab bar? | Tabs and controls use line icons. Category emoji and pets stay emoji. | Default assumed | E0-05, E0-12 |
| E7 | Which new reminder features are in scope? | Snooze (1 hour, tonight 8 PM, tomorrow 9 AM), repeat (daily, weekly on chosen days, monthly) and one-tap reschedule for overdue items. Real alerts (push) stay in the main plan. | Default assumed | E1-03, E4-02 |
| E8 | Does a day with no spending count as logged? | Yes, if the user taps "Nothing spent today". Otherwise a day counts only when it has at least one entry. | Default assumed | E1-02, E4-04 |
| E9 | What counts as the daily puzzle? | Any puzzle from the bank solved today, or the Lichess daily marked solved. | Default assumed | E1-01, E1-09 |
| E10 | Widgets: build them now or after the web app ships? | After. Phase E5 starts only when the owner confirms a Mac with Xcode, an Apple Developer account and the iPhone shell from the main plan. | Default assumed | E5 |

## Consequences

- Phases E0 to E4 can run without waiting on the owner; E5 is gated by E10 and task `E5-U1`.
- A changed default means editing `plan.json`, re-rendering `PLAN.md`, and updating the affected tasks before they run.
- Until the owner confirms them, treat E1 to E10 as assumptions, not commitments. To confirm one, change its Status to Confirmed with the date.
