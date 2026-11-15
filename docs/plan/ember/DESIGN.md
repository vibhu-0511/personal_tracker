# Ember design spec

Direction A from `docs/designs/app-directions.html` (open it and choose "A · Ember"), chosen by the owner on 2026-11-15.
The mockup is the visual reference. Its CSS under the `.A` class and the shared mock classes hold the exact values.
Where this spec and the mockup disagree, this spec wins. Where both are silent, follow the existing app.

## 1. What changes and what stays

| Stays | Changes |
|---|---|
| Six tabs in the same order: Today, Life, Logic, Money, Invest, Agents | Tab icons become line icons |
| Routes, sub-views, inspector, command palette, shortcuts | A plus button on every tab opens one capture sheet |
| Bottom tabs below 600px, rail from 600px, sidebar from 1024px | Today becomes: header, five dailies, next up, timeline |
| All data keys and sync v1 | New key `dailyLog`; reminders gain `repeat`; puzzle progress gains a date |
| The seven existing themes | Ember is added and becomes the default for new installs |
| Pets, streak, wallet, level | Tasks, Code, Spend and Mood tiles leave Today (their data moves into the dailies and timeline) |

The idea: the day is one time rail, and the app answers "what is next?" and "did I do my dailies?" at a glance.
Colour is rationed. The flame accent marks only the next thing and the primary action. Green marks done. Red marks overdue.

## 2. Tokens

Defined under `:root[data-accent="ember"]` in `src/styles/ember.css`. Use the existing token names so every component keeps working in the other themes.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0c10` | page |
| `--surface` | `#13161d` | cards, sheets |
| `--surface-raised` | `#1d212c` | chips, inputs, secondary buttons |
| `--border` | `#262b37` | 1px borders, timeline rail |
| `--text` | `#eaecf1` | primary text |
| `--text-secondary` | `#909aad` | meta text, inactive tabs |
| `--accent` | `#ff8a3d` | next up, active tab, plus, primary button fill |
| `--accent-solid` | `#ff8a3d` | button fill |
| `--accent-fg` (new) | `#1d0d02` | text on accent fills |
| `--accent-dim` | accent at 12% | selected row fill |
| `--note` (new) | `#6ea8fe` | note and expense markers on the timeline |
| `--success` | `#4ade80` | done |
| `--success-fg` (new) | `#062611` | check glyph on success |
| `--danger` | `#ff8080` | overdue |
| `--warn` | `#fbbf24` | budget warnings |

Scales, defined on `:root` for all themes:

- **Type:** display `Space Grotesk` 500 and 700; body `Inter` 400 to 700; data `JetBrains Mono` 500. Fallbacks: the current system stack, and `ui-monospace`.
  Sizes in px: 28 (page title on phone 24), 20, 17, 15 (body), 13, 12, 11 (labels, uppercase, 0.08em tracking), 10 (tab labels).
- **Mono is for data only:** times, dates, counts, amounts in meta lines. Never for sentences.
- **Space:** 4, 8, 12, 16, 24, 32. Page padding 16 on phone, 24 from 600px.
- **Radius:** 16 cards and sheets top, 10 buttons and inputs, 999 chips, 50% checks and the plus.
- **Motion:** 150ms for presses and chips, 250ms ease-out for sheets. Honour `prefers-reduced-motion`.
- **Numbers:** `font-variant-numeric: tabular-nums` wherever digits line up.
- **Money:** `formatRupees` (₹ with en-IN grouping), unchanged.
- **Time:** device locale decides 12h or 24h, unchanged.

Rules: no colour literals in component CSS. Hover styles only under `(hover: hover) and (pointer: fine)`. Touch targets at least 44px under `(pointer: coarse)`. Visible `:focus-visible` on every control.

## 3. Components

### 3.1 Icons
`src/ui/icons.js` exports 24x24 stroke paths (1.8 stroke, round caps and joins) for these 20 names:
`today, life, logic, money, invest, agents, plus, bell, note, check, clock, pin, calendar, repeat, search, mic, list, up, face, close`.
Copy path data from the mockup's `<symbol>` elements (`sun, leaf, code, wallet, chart, spark, plus, bell, note, tick, clock, pin, cal, up, face`). `repeat, search, mic, list` are in `docs/designs/capture-directions.html`. Draw `close` as an X.
Category emoji and pet emoji remain emoji: they are content, not controls.

### 3.2 New primitives
| Primitive | Looks like | Notes |
|---|---|---|
| `DailyCell` | Small bordered cell: label on top, value in mono under it | Done: green tint, no border, a check glyph. State must not rely on colour alone. |
| `SegDots` | A row of equal squares, filled or empty | Used for "days logged this month". Needs an `aria-label` such as "13 of 15 days logged". |
| `TimelineRow` | Time (mono, right-aligned, 50px) · rail with marker · content · optional check or amount | Kinds: reminder (round marker), note and expense (square marker in `--note`), now (filled accent marker, accent text), done (struck through). |
| `NextUpCard` | Surface card: mono eyebrow in accent, title in display 17, buttons Done and Snooze 1h, time at right | The only card on Today with accent text. |
| `Fab` | 56px accent circle with a plus | Bottom-right, above the tab bar and safe area. |
| `SubNav` count | Chip text "Reminders 3" | Selected chip uses accent fill with `--accent-fg`. |

Reused as they are: `Row`, `Check`, `Chip`, `Pill`, `Ring`, `Bar`, `Sheet`, `EmptyState`, `Toast`.

## 4. The plus button and capture sheet

- One `Fab` on every tab. Tap opens the capture sheet. Keyboard: `N`. Palette: "New expense", "New note", and so on.
- **Sheet layout, top to bottom:** type chips (Expense, Note, Reminder, Task, Habit, Solve, Mood; scroll sideways) · one text field · parsed chips · hint "Tap a chip to change it" and the primary button named after the type ("Add expense").
- **Default type:** Expense on Money, Reminder on Life/Reminders, Note on Life/Notes, Task on Life/Tasks, Solve on Logic. Elsewhere, the last type used; first time, Expense.
- **Typing:** "450 coffee with raj" becomes chips ₹450 · ☕ Coffee · Today · With Raj. "call mom tomorrow 6pm" becomes Mon 16 Nov · 6:00 PM · Never. A chosen type chip overrides what the parser infers.
- **Chips are editable:** tapping one opens its editor (amount, category grid of 12, when with presets, repeat, person).
- **Habit, Solve and Mood** show a small panel instead of the text field: habits not yet checked in today; "Solved a problem" and "Daily puzzle done"; the five moods.
- **Rules:** an expense needs an amount and a category; if the parser found no category, the category chip reads "Pick category" and the button is disabled. Saving closes the sheet and shows a toast with Undo. A failed save keeps the sheet and the text. Focus returns to the plus on close.
- The sheet is the existing `Sheet`: bottom sheet below 600px, centred from 600px, right panel from 1024px.
- Editing an existing transaction keeps the existing edit sheet.

## 5. Screens

### 5.1 Today
Order: header · dailies · overdue chip (only if any) · next up · timeline · kept tiles.

- **Header:** mono line "SUN 15 NOV · 12-DAY STREAK" in accent, title "Today", ring at the right with "3/5".
- **Dailies:** five `DailyCell`s in one row: Habits (3/3), Spend (₹640), Mood (Good), Code (1/3), Puzzle (Open). Each links to its screen; Mood opens capture on Mood.
- **Overdue chip:** "1 overdue · Renew car insurance" in red, with a one-tap "Today 7 PM".
- **Next up:** the earliest open reminder or timed task after now. Empty: "Nothing left on the clock."
- **Timeline:** today's reminders, timed tasks, expenses and notes in time order, one "Now" row. Done reminders stay, struck through.
- **Kept tiles:** Streak, Wallet, Pets, Watch, Tutor in the existing grid. From 900px container width they form a second column beside the timeline.
- All dailies done: one confetti burst per day, none under reduced motion.

### 5.2 Life frame
Title "Life", mono line at right "₹4,820 · LV 7". Chips: Tasks N, Reminders N, Notes N, Habits, Growth.

### 5.3 Reminders
Sections Overdue (red label, count), Today ("3 left"), Tomorrow, Later, Done. Row: check · title · mono meta ("5:00 PM · in 42 min") · repeat icon when repeating. Overdue rows carry a "Today 7 PM" chip. Inspector: title, when, repeat, the three snooze presets, Add to Calendar, Delete.
On the phone the reminders view ends with a "Pinned notes" preview (two rows, "See all").

### 5.4 Notes
Search field, tag chips (All first), sections Pinned and Recent. Row: colour dot · title (first line) · pin icon when pinned · two-line excerpt · mono meta "#dsa · 2 sub-notes · today". Editor and inspector behaviour unchanged.

### 5.5 Money
Chips Spend, Budgets, Goals, Loans. Spend, top to bottom:
- Card: month spend in display 22, "of ₹30,000", a bar, "₹11,550 left · 62% of budget used".
- "LOGGED 9 DAYS IN A ROW" with `SegDots`, one square per day of the month so far, and "13 of 15".
- "Nothing spent today" button, only while today has no entries.
- Day groups: "TODAY · ₹640 SPENT", then rows: emoji tile · category · mono meta "1:10 PM · with Raj" · amount.
- Below: category bars and the 3-month trend, restyled, same data.
Budgets, Goals and Loans keep their content and take the same chip row, card and row styles.

### 5.6 Logic (not drawn)
Header: ring "Solved today 1/3", a line "Daily puzzle: open" or "solved", and the code streak in mono. Chips Code, Puzzles, Exams, DSA. Problem rows: name · mono rating · up to three tag chips · solved or skipped badge. Puzzles: the Lichess card gains "Mark solved"; solved bank puzzles show the date. Exams and the DSA frame take the card and chip styles only.

### 5.7 Invest (not drawn)
The disclaimer bar stays first. Chips Learn, Research, Watchlist. Watchlist rows: name · mono symbol · price and change in tabular figures (green up, red down, plus an arrow so it is not colour-only) · sparkline. Lesson content keeps its layout; only tokens change.

### 5.8 Agents (not drawn)
Topic chips in one scrolling row, "More tools" as a chip that opens the existing menu. Chat: user bubbles on `--surface-raised`, replies on `--surface`, mono only for code. Send is the accent button.

### 5.9 Settings
A panel opened from the gear: Codeforces handle, Theme, Daily code goal (1 to 10), Dailies (which of the five count), Backup.

## 6. States every screen needs
- **Loading:** skeleton rows in `--surface-raised`, no spinners.
- **Empty:** one plain sentence and the action, for example "No reminders yet. Tap + to add one."
- **Error:** what failed and what to do, with Retry where it applies.
- **Offline or sync failed:** the existing banner; nothing here changes it.

## 7. Copy
Plain and specific. Buttons say what they do ("Add expense", "Snooze 1h", "Nothing spent today"). No exclamation marks. Times relative when under two hours ("in 42 min"), absolute otherwise.

## 8. Widgets
Specified in `docs/plan/ember/WIDGETS.md` (task E5-02). Summary from the mockup:
small = dailies bar and next up; medium = done count, two reminders with tick-off, "+ ₹" and "+ Note";
large = dailies, three reminders, month spend; lock screen = next up, done/total, "₹640 today · code 1/3".

## 9. New behaviour compared with PR #4
Dailies; `dailyLog` key; puzzle solve dates; logged-day run; reminder snooze, repeat and reschedule; global capture; note titles derived from the first line; time-of-day on tasks in the inspector; reminders in palette search; Settings as a panel.
