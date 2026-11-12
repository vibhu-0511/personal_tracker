# R2 report: Life tab (tasks, reminders, notes, habits, growth)

## Summary
- Life.jsx (1078 lines) is one file holding a shell plus 4 sub-views; Notes.jsx (438 lines) is a child of it, not a separate tab. The 5 sub-views map 1:1 to blueprint `life.*` keys.
- Today tiles can be fed almost entirely by existing pure exports of `src/life/logic.js` (`earnings`, `streaks`, `petState`, `emotionSummary`, `parseQuick`). Task/reminder counts, wallet total and the stat strip are computed inline in Life.jsx and must be extracted. Level/XP does not exist; a derivation from `earnings().total` is proposed.
- Biggest build risk: Life state lives inside the mounted Life component (Life.jsx:80-92). As soon as Today tiles and Life screens are mounted together, two components hold separate copies of whole-key arrays and can clobber each other on save (whole-key LWW, no per-record merge).
- Drag-and-drop works with touch/mouse/pen only through a 28px handle and one `DndContext` per list. It breaks in multi-pane layouts (no cross-pane drag, no DragOverlay, clipped by scroll panes).
- Repo-facts correction: node_modules IS installed in this checkout (49 entries, react/vite/motion/@dnd-kit present). The 49 Life-related tests pass.
- 19 tasks proposed in `R2.tasks.json`; the 7 dependency-free ones (R2-01..05, 08, 09) are write-disjoint.

## Facts
Components and store keys (Life.jsx)
- Imports 1-33; `VIEWS` (2 groups, 5 views) 35-45; `URGENCY_FILTERS`/`quadrantLabel`/`matchesUrgency` 49-70; `SPECIES` 72; `fireConfetti` (dynamic import of canvas-confetti) 74-77. src/tabs/Life.jsx:1-77
- `Life` shell 79-234. Reads+writes keys tasks, reminders, habits, moodLog (hydrate 87-92, updaters 143-158); reads then clears `checklists` (legacy merge 112-127). src/tabs/Life.jsx:79-234
- Shell also owns: 30s `now` ticker (129-132), app badge via `navigator.setAppBadge` (134-141, runs only while Life is mounted), wallet total `Σ earnings(h).total` (160-163), due counts (164-165), stat strip (184-197), two pill rows (199-222). src/tabs/Life.jsx:129-222
- `TasksView` 236-425 (quick add via `parseQuick`, urgency filters, text filter, section bucketing 340-346, `DndArea` 409-414). `TaskSection` 427-581 (row UI, inline edit, subtask list 532-572, nested DropList 534). `DoneTaskSection` 583-618. src/tabs/Life.jsx:236-618
- `RemindersView` 620-752: add/toggle/delete/ICS link only. There is no edit of title or time. src/tabs/Life.jsx:620-752
- `HabitsView` 754-983: pet card per habit (stage emoji, mood class, health bar, earnings, traits, check-in 800-816, `DndArea` 820-924, add form 933-980). Edit form changes name/category/domain only, not species (793-798). src/tabs/Life.jsx:754-983
- `GrowthView` 985-1078: `computeStats` bars, `TITLES`, manual mood picker, 30-day mood strip. No list; pure blocks. src/tabs/Life.jsx:985-1078
- Store keys: tasks/reminders/habits/moodLog/checklists/notes all in `SYNCED_KEYS` (src/store.js:59-63); getters/savers src/store.js:76-192. Only `reminders` has a `mutate` wrapper (src/store.js:162); `engine.mutate` serialises read-modify-write per key (src/sync/engine.js:85-95).
- Cross-tab writer: Expenses appends a reminder through `mutateReminders` (src/tabs/Expenses.jsx:275).
- Remote change routing: `KEY_TO_TAB` maps tasks/reminders/habits/moodLog/notes/checklists to `'Life'` (src/App.jsx:40); Life is mounted only when `tab === 'Life'` (src/App.jsx:280); a tick re-runs `useHydrate`, which sets `ready:false` and unmounts the sub-view (src/useHydrate.js:13-19, Life.jsx:175-177).
- Data shapes: task `{id,title,due,dueAt,done,doneAt,createdAt,urgent,important,subtasks[{id,text,checked,createdAt}]}` (Life.jsx:252-262, 440); reminder `{id,title,at,done,createdAt}` (633-639); habit `{id,name,category,species,domain,createdAt,checkins[dateKey]}` (770); note `{id,createdAt,body,tags[],pinned,color,parentId}` (Notes.jsx:243-250); mood `{date,valence,source}` (logic.js:222,227). None carries `updatedAt`.

Notes
- Notes is used by exactly one importer: `import Notes from './Notes.jsx'` at src/tabs/Life.jsx:29, rendered at :230 when `view === 'notes'`. grep over src/ and test/ finds no other import. It is reached via Life tab, pill group "Planning", pill "Notes" (Life.jsx:36-40). It is not in the bottom tab bar (App.jsx:15-21). `examNotes` is a different key owned by Exams (src/tabs/Exams.jsx:2).
- Notes has its own hydrate keyed on `syncTick` (Notes.jsx:235), a tree (parentId) with cascade delete + undo toast (317-337), its own `DndArea` (411-435), nest drop zones (210-215). Helpers `buildChildMap`/`sortSiblings`/`collectDescendantIds` are not exported, so untested (Notes.jsx:14-30). Notes has no title field, only `body`.

logic.js exports that feed Today
- `dateKey` 46, `multiplier` 60, `streaks(checkins,today)->{current,best}` 65 (accepts any checkin array, so `streaks(habits.flatMap(h=>h.checkins), now)` gives an all-habits day streak), `earnings(habit,today)->{total,today,nextMultiplierIn}` 92, `petState(habit,today)->{stage,accessory,health,mood,traits}` 125, `crossedMilestone` 153, `computeStats(habits)` (5 domains, each capped at 100) 176, `unlockedTitles` 197, `derivedValence` 211, `ensureTodayEntry` 217, `logManualMood` 225, `emotionSummary(log,today)` 230, `parseQuick` 250. src/life/logic.js
- Level/XP: grep for `level|xp` over src/ finds nothing relevant (only an Invest course string, src/invest/course.js:425). Does not exist. The blueprint says B "needs XP / level derived from existing streaks" (docs/plan/blueprint.txt:142).
- `computeStats` saturates at 100 per domain (logic.js:170,181), so it cannot drive an open-ended level.

DnD
- `DndArea` creates one `DndContext` per call with `PointerSensor {distance:4}` + `KeyboardSensor` only; no TouchSensor, no DragOverlay, no pen-specific code (grep for pointerType/TouchSensor/DragOverlay finds nothing). src/dnd/Dnd.jsx:33-70
- Rows are draggable only via a `⠿` button carrying the listeners; the row body has none. src/dnd/Dnd.jsx:103-106. `.drag-handle` has `touch-action:none`, padding `0 6px`, 16px glyph (about 28px wide), under the 44px target the blueprint demands for coarse pointers. src/styles.css:1118-1128; blueprint.txt:59
- Apple Pencil is `pointerType:'pen'` and goes through PointerSensor like a mouse; pressure unused. Inference.
- Collision: same-`type` filter, smallest pointer hit wins else closestCorners. src/dnd/Dnd.jsx:15-29. Container ids are bare strings (`overdue`,`today`,`upcoming`,`nodate`,`habits`,`root`,`n:<id>`,`sub:<id>`) (Life.jsx:410-413, 534, 821; Notes.jsx:195, 429).
- DnD consumers: Life.jsx:8, Notes.jsx:8, Expenses.jsx:12 (R4 area). Pure logic `placeItem/taskDropPatch/canNest/moveSubtask` in src/dnd/logic.js:2-45 handles one id at a time.
- `.habit-card` has `overflow:hidden` (styles.css:1041); dragged rows only get `zIndex:5` and a transform (Dnd.jsx:109-117), so an ancestor with overflow clips them. Inference for new scroll panes.

Tests (49 pass, run read-only with `node --test` on the 5 files)
- test/lifeLogic.test.js 24 tests: dateKey, streaks, multiplier, earnings, petState, crossedMilestone, parseQuick. test/growth.test.js 10: computeStats, titles, valence, mood log, emotionSummary. test/dndLogic.test.js 5. test/undo.test.js 3. test/ics.test.js 7. No test imports a .jsx file; package.json has no jsdom/testing-library/playwright (package.json:10 scripts: only `node --test "test/*.test.js"`).
- Untested: `matchesUrgency`/`quadrantLabel` (Life.jsx:57-70), task bucketing (340-346), wallet/due counts (160-165), all Notes helpers, `TRAITS`/`TITLES` tables, `parseQuick` for time-only text and "in 2 hours".

Reminders/ICS
- `/api/ics` takes `title`+`start`, validates, returns a one-event VCALENDAR with a VALARM; no recurrence. api/ics.js:1-11, api/_lib/ics.js:9-39. Nothing in src/ uses `Notification` (only `setAppBadge`, Life.jsx:135-140): reminders are passive banners.

Blueprint mock for life.* (docs/forge-blueprint.html:1377-1378, 1385-1387, 1427-1452)
- `life.tasks`: task list + "Priority matrix" 2x2 block. `life.reminders`: list with "Daily/Monthly" repeat chips. `life.notes`: notes with titles + a Pencil "Sketch" block. `life.habits`: pets + wallet. `life.growth`: 4 growth bars + wallet. Home B tiles show "Level 7" and "12 days / best 21" (html Home B).

## Gaps and contradictions
- Blueprint vs data model: reminders mock shows repeat (Daily/Monthly); `reminders` has no `repeat` field and ICS has no RRULE (api/_lib/ics.js:9-28). Needs schema + UI + ICS change.
- Blueprint notes mock shows titled notes; real notes have only `body` (Notes.jsx:243-250). Either derive a title from the first line (no schema change) or add `title`.
- Blueprint Growth shows 4 bars; code has 5 domains including `other` (logic.js:161-167). Mock says "derived from real activity", but `computeStats` uses habit check-ins only; nothing from Code/Money.
- Blueprint "12 days / best 21" implies a single global streak; code only has per-habit streaks (Life.jsx:825). Needs a defined `overallStreak`.
- Inspector threshold: decision text says right-hand inspector from >=1024px; blueprint table says 1024-1279 is list+detail and the inspector only appears at >=1280 (blueprint.txt:37-38). Life Tasks/Reminders/Habits have no separate "detail" (a task has no body), so a 2-pane list+inspector at >=1024 fits; Notes needs 3 panes at >=1280.
- Name collision: `src/tabs/Today.jsx` already exists and is the Code (Codeforces daily) panel inside LogicBuilding (LogicBuilding.jsx:2,82); `KEY_TO_TAB.progress` is `'Today'` (App.jsx:36). The new B "Today" home needs a different component name/route key (e.g. `Home`) or the old one renamed.
- Repo fact wrong: "node_modules not installed" is false here (react, vite, motion, @dnd-kit/core 6.3.1, localforage, canvas-confetti all present).
- IDEAS.md:118-121 refers to a "pet-runaway design built earlier today" that wipes check-ins after 3-4 missed days; no such code exists in src/ or test/ (grep). Today's `petState` only changes mood/health (logic.js:137-145). Any XP that regresses on data wipes would collide with it.
- Life.jsx:162-163 shows "Wallet" as the sum of lifetime `earnings().total`, but Today B calls it a header pill; there is no spend/withdraw concept, so it only goes up (until a habit is deleted).
- Blueprint shows "Cmd+1..6, N new, X complete" shortcuts; no Life code has focus or selection concept (no selected-row state) for "X complete" to act on.

## Risks
- Stale whole-key clobber (data loss). `updateTasks` does `setTasks(next); saveTasks(next)` from a render snapshot (Life.jsx:143-146), and `engine.save` replaces the whole key. With a Today tile completing a task while a Life screen holds an older array, the last writer erases the other. Mitigation: one `LifeData` provider owning arrays, and functional `mutate*` store wrappers (pattern of src/store.js:162) so every write is read-modify-write.
- Mood race: `ensureTodayEntry` saves on mount (Life.jsx:99-107). Two mounted consumers, or a stale array, could drop a `source:'logged'` entry. Mitigation: do it once, in the provider, gated on `ready`.
- Checklist migration (Life.jsx:112-127) must stay single-run; keep it in the provider only. Stable ids make it idempotent but it still races `tasksLatest`.
- Sync tick unmounts the screen (`ready:false`, useHydrate.js:13-19), which drops edit drafts and, in a 2-3 pane layout, any selection kept in child state. Mitigation: keep selected id in the route/provider; provider refreshes silently (no `ready:false` after first load).
- Sync v2 (R6) will go per-record LWW: no record has `updatedAt` (shapes above) and `habit.checkins` is an array inside one record, so two devices checking in on different days of the same habit lose one. Mitigation: stamp `updatedAt` centrally in the provider (tasks R2-03, R2-18) and merge `checkins` as a set union; moodLog is naturally keyed by `date`.
- XP regression: deleting a habit or task lowers derived XP/level (undo toast restores it). Mitigation: show level from derived value, ask the user (Needs) whether a high-water mark is wanted.
- Reminders never notify (no Notification/service worker). Today shows "due" but nothing fires; user may assume otherwise. Flag to PWA/native areas; badge logic must move out of Life (only runs while mounted).
- DnD in panes: clipped drag preview, no cross-pane drops, 28px handle on touch, Expenses shares Dnd.jsx. Mitigation: task R2-09 (backward-compatible props), run Expenses smoke after.
- No JSX test infrastructure: every Life UI change is verified by hand or E2E (R7). Mitigation: keep new logic pure and put it in tested modules (tasks R2-01/02/03/13/14).
- Life.jsx is the contention hot spot of this area; every screen task needs it split first (R2-05).

## Write-set map
Existing files the build touches
- src/tabs/Life.jsx: HOT. Edited by R2-05 (split), R2-06 (Notes import), R2-07 (provider), R2-17 (route/view props). Strict chain R2-05 -> R2-06 -> R2-07 -> R2-17.
- src/tabs/Notes.jsx: moved by R2-06 (deleted from tabs, recreated under src/life/screens/).
- src/store.js: HOT across areas (R6 sync). R2-04 only adds `mutateTasks/mutateHabits/mutateMoodLog/mutateNotes` wrappers.
- src/dnd/Dnd.jsx, src/dnd/logic.js, test/dndLogic.test.js: R2-09 only; Expenses.jsx (R4) is a consumer, API stays backward compatible.
- src/styles.css (Life rules 996-1139, notes 417-454): not touched by R2; new rules go in new `src/life/life.css` (R2-08) to avoid the single-writer CSS file.
- src/App.jsx (tab/route, KEY_TO_TAB): not touched by R2; R1 owns. R2 needs it to pass `view` and mount a provider (R2-07/R2-17 notes).
- src/life/logic.js, test/lifeLogic.test.js, test/growth.test.js: left unchanged (new functions go in new modules so existing tests stay stable).
New files
- src/life/selectors.js, progress.js, records.js, habitView.js, growth.js, notesTree.js, todayTiles.js, views.js, LifeData.jsx, life.css; src/life/ui/MasterDetail.jsx; src/life/screens/{Tasks,TaskInspector,Reminders,ReminderInspector,Habits,HabitInspector,Growth,GrowthInspector,Notes,NoteInspector,Sketch}.jsx; src/life/tiles/*.jsx; matching test/life*.test.js.
Contention hot spots: Life.jsx, store.js, styles.css, App.jsx (all single-writer per wave).

## Needs from the user
- Decision: should Level ever go down? (derived XP drops when a habit/task is deleted; alternative is a stored high-water mark in `settings`).
- Decision: Habits and Growth, B tiles or A rows? Recommendation: A dense rows + inspector for Habits (pet card as inspector hero), A blocks for Growth; keep B tiles for Today only.
- Decision: reminders recurrence (Daily/Monthly) in scope for this build, or leave as mock only?
- Decision: notes get a `title` field, or derive title from first line?
- Decision (Pencil): store drawings in a new synced `drawings` key (IDEAS.md:9-14) or locally only for now? Fidelity: flat image vs stroke vectors (IDEAS.md:15-19).
- Device facts: which iPad/Pencil generation and iPadOS version (Pencil pressure and long-press behaviour need a real-device check).

## Proposed tasks
Pure logic first (all parallel, disjoint)
- R2-01 (S) Extract task/reminder/streak selectors + tests: `src/life/selectors.js`.
- R2-02 (S) Derive XP/level from existing data + tests: `src/life/progress.js`.
- R2-03 (S) `stampUpdated` and set-merge helpers for sync v2 + tests: `src/life/records.js`.
- R2-04 (S) Add `mutateTasks/Habits/MoodLog/Notes` to store.js.
- R2-05 (M) Split Life.jsx into per-screen files (no behaviour change).
- R2-08 (S) MasterDetail layout primitive + life.css.
- R2-09 (M) Make dnd safe for panes: overlay, coarse-pointer handle, multi-id move.
After R2-05
- R2-06 (S) Move Notes.jsx under src/life/screens and extract `notesTree.js` + tests.
- R2-07 (M) LifeData provider (single writer, silent refresh, badge, mood, migration).
Screens (parallel, each its own files; need R2-05 + R2-08)
- R2-10 (M) Tasks list + inspector. R2-11 (M) Reminders list + inspector with edit. R2-12 (M) Notes editor + inspector. R2-13 (M) Habits rows + pet inspector + `habitView.js`. R2-14 (M) Growth blocks + inspector + `growth.js`.
Integration
- R2-15 (S) `todayTiles.js` pure tile-data function + tests. R2-16 (M) Life Today tile components (needs tile primitive from shell/design task). R2-17 (S) Life view registry + `view` prop for router/palette. R2-18 (S, P2) Stamp `updatedAt` in provider writes. R2-19 (M, P3) Pencil sketch canvas.
