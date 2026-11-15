# ADR-0004: Level/XP derivation for the Today header

- Status: Proposed. The formula is NOT yet user-approved (see "Approval" below).
- Date: 2026-11-13
- Task: B1-05. Implemented later by R2-02 (`src/life/progress.js`), shown by B3-13 (header pills).
- Related: blueprint-errata E-15, OPEN-DECISIONS D2 (Level rule) and D14 (wallet meaning).

## Approval

- Formula user-approved: **NO. Pending.** The acceptance for B1-05 asks for this ADR to be marked user-approved. That cannot be said truthfully yet, because the user has not answered the Level/XP question in `docs/plan/research/B1-report.md` ("Needs from the user"). D2 in `docs/plan/OPEN-DECISIONS.md` is `default assumed`.
- What is assumed in the meantime: the default of D2 (derived from wallet earnings plus completed tasks, never decreases) and the constant 30 from R2-02.
- To approve: set D2 to `confirmed` (or write a replacement formula) and change the two lines above to `Status: Accepted` and `Formula user-approved: YES (date)`.

## Context

The Today mock shows a header pill "Lv 7" next to a wallet of 1240. The blueprint gives no formula (errata E-15). The repo has no Level/XP code. The wallet is a virtual rupee total earned from habit check-ins (`earnings()` in `src/life/logic.js`), not money spent. The B1 report suggested `floor(sqrt(totalEarned/25))`; E-15 supersedes it with the R2-02 constant of 30, which reads the mock's 1240 as Level 7.

## Decision

Level is a pure function of data that already exists. It is derived on read and is never stored as its own value.

### Inputs

| Input | Source | Notes |
|---|---|---|
| `earned` | sum of `earnings(habit, now).total` over all habits | `src/life/logic.js`. Already includes the streak multiplier (1, 1.25, 1.5, 2, 3 at streak 1, 3, 7, 14, 30). |
| `doneTasks` | count of tasks with `done === true` | Existing `tasks` synced key. |
| `highWater` | optional integer, the highest XP ever shown | See "Never decreases". |

No new synced key is added. Habit check-ins and tasks are already synced; the streak enters only through `earnings()`.

### Formula

```
xp = earned + 10 * doneTasks

Level n starts at   30 * (n - 1)^2   XP        (Level 1 starts at 0)
level  = floor(sqrt(xp / 30)) + 1
start  = 30 * (level - 1)^2
needed = 30 * (2*level - 1)                    (XP from this level's start to the next)
into   = xp - start
pct    = floor(100 * into / needed)

levelFromXp(xp) -> { level, into, needed, pct }
```

Display uses `levelFromXp(max(xp, highWater))`. `xp` is always an integer or is rounded down before use (multipliers such as 1.25 produce fractions).

### Worked examples

1. Total 0 (new user, nothing checked in, no tasks done): `xp = 0`. Level 1, `into 0`, `needed 30`, `pct 0`.
2. Total 1240, the blueprint mock (earned 1240, 0 done tasks): `xp = 1240`. `sqrt(1240/30) = 6.43`, so Level 7. `start = 30*36 = 1080`, `into = 160`, `needed = 30*13 = 390`, `pct = 41`. Header reads "Lv 7".
3. One Exercise habit (100 per day) checked in 10 days in a row, plus 3 done tasks. Streak multipliers per day: days 1-2 x1, days 3-6 x1.25, days 7-10 x1.5. `earned = 2*100 + 4*125 + 4*150 = 1300`. `xp = 1300 + 30 = 1330`. Level 7, `into 250`, `needed 390`, `pct 64`.

### Never decreases (D2)

Level and XP are recomputed from current data, so deleting check-ins or tasks lowers `xp`. To keep the displayed Level from going down:

- `highWater` is the largest `xp` ever computed on a device. It is kept as one integer field inside the existing `settings` document (an existing synced key, not a new key) and merged across devices with `max`.
- Whenever `xp > highWater`, `highWater` is raised to `xp`. It is never lowered.
- Level is shown from `max(xp, highWater)`.

Behaviour when check-ins are deleted:

- Deleting a check-in lowers `earned`, and also lowers the streak multiplier of later days in that run, so `xp` can drop by more than one day's value. `xp` shown in any "XP to next level" detail follows the recomputed value, but the Level number and bar use `max(xp, highWater)`, so Level does not fall.
- Example 3 after deleting all 10 check-ins: `earned = 0`, `xp = 30`, `highWater = 1330`, so the header still reads Level 7 at 64 percent.
- Consequence: earning again does not raise Level until `xp` passes `highWater`. This is accepted as the cost of "never decreases". If the user prefers that Level can fall, drop `highWater` and use `xp` directly (a one-line change in R2-02).
- Deleting a whole habit removes its earnings the same way and is covered by `highWater` too.

## Consequences

- Pure and unit-testable with no storage; R2-02 tests cover the three examples above, `highWater >= xp`, and an empty habit list.
- Only one field is added, inside the existing `settings` key. It needs no migration: absent means 0. If the settings schema must not change at all, the alternative is to let Level fall (see above).
- The header wallet pill means habit currency only (D14); money spend stays in Money.
- Level 7 is reached at 1080 XP and Level 8 at 1470 XP, so the curve slows as it climbs. The constant 30 is to be tuned against real data.

## Alternatives considered

- `floor(sqrt(totalEarned/25))` from the B1 report: superseded by E-15 (constant 30, plus tasks).
- Level from streak milestones (`MILESTONES` 3, 7, 14, 30, 60, 100): rejected as the default because it jumps rarely and ignores tasks.
- A stored XP counter: rejected, it would be a new synced key and could drift from the check-ins.
