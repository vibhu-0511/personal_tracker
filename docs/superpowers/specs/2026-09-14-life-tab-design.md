# Forge "Life" tab: tasks, reminders, habits (pets + wallet), notes, themes

## Context
Forge (`C:\Users\vibha\Downloads\data\forge`) is a React + Vite personal PWA, used mostly on iPhone from the home screen. All data lives in IndexedDB via localforage.

The user wants one new tab for tasks, notes, reminders and habit tracking, with good animations and themes. Ideas were collected from open-source and polished apps:
- **Loop/uHabits:** streak math
- **Finch:** a pet-care loop
- **Streaks:** milestone celebrations
- **Memos:** pinned notes
- **Todoist/Things:** quick-add date parsing

### Decisions the user made
- **Reminders:** in-app banner, app-icon badge and "Add to Calendar" (.ics) so iOS Calendar sends the real alert. No push server.
- **Tab bar:** 7th tab placed first, with a horizontally scrollable bar.
- **Animations:** Motion (framer) plus canvas-confetti plus CSS.
  - Also picked: auto-animate. **Plan skips it** because Motion's `AnimatePresence`/`layout` already animates list add, remove and reorder. Add it back if wanted.
- **Habits are shown two ways:**
  1. A **virtual ₹ reward wallet**. Claude picks a value per habit category, and a streak multiplier raises it.
  2. **One pet per habit**, with health, mood and learned "good habits" (traits) driven by the streak.
- **Themes:** app-wide accent colour themes.
- **Skipped:** forest view, time-of-day header, heatmap.

### Existing things to reuse
- `src/tabs/Notes.jsx` is a working notes screen (body plus tags, `notes` key) that nothing imports. The Life tab embeds it.
- Store pattern in `src/store.js`: `getX()` returns a default; `saveX(v)` writes the whole value.
- Tab pattern (see `src/tabs/Invest.jsx`):
  - a `VIEWS` array drawn as `.agent-bar` / `.agent-pill` sub-view pills
  - load once in `useEffect`
  - optimistic `update(next){ set(next); await save(next) }`
  - `Date.now()` ids and a `fade-in` root
- Tests use `node --test test/` on pure modules with `node:assert/strict` (see `test/parseYahooChart.test.js`).
- Vite already serves `api/*` in dev, so `api/_lib/` holds pure, testable helpers.

## Design

### Data (new store keys in `src/store.js`)
| Key | Shape |
|---|---|
| `tasks` | `[{ id, title, due: 'YYYY-MM-DD'\|null, done, doneAt, createdAt }]` |
| `reminders` | `[{ id, title, at: epochMs, done, createdAt }]` |
| `habits` | `[{ id, name, category, species, createdAt, checkins: ['YYYY-MM-DD', ...] }]` |
| `notes` | Existing key. Add optional `pinned` and `color`; old notes still work. |
| `settings` | Add `theme` (default `'ocean'`). |

Wallet totals, streaks and pet state are **derived** from `checkins`, never stored, so they can't drift out of sync.

### Pure logic: `src/life/logic.js` (tested test-first)
- **`dateKey(date)`:** local `YYYY-MM-DD`.
- **`streaks(checkins, today)`:** returns `{ current, best }`.
  - `current` counts back from today, or from yesterday if today isn't done yet.
- **`CATEGORIES` and ₹ per check-in (Claude's pick):**
  - Exercise 100
  - Deep work/Study 80
  - No junk food 70
  - Sleep on time 60
  - Reading 50
  - Meditation 40
  - Journaling 30
  - Water 20
  - Custom 30
- **`multiplier(streakDay)`:**
  - days 1–2: ×1
  - days 3–6: ×1.25
  - days 7–13: ×1.5
  - days 14–29: ×2
  - day 30+: ×3
- **`earnings(habit)`:** replays the check-in history, adding value × the multiplier for that day's running streak.
  - A missed day resets the multiplier, not the balance.
  - Returns `{ total, today, nextMultiplierIn }`.
- **`petState(habit, today)`:**
  - **stage** by total check-ins: egg 0 → baby 1–6 → young 7–20 → adult 21–59 → legend 60+. Shown as scale plus accessory 🎀/🎓/👑.
  - **health** 0–100: share of the last 7 days checked in.
  - **mood** by days since last check-in: 0 happy 😄, 1 waiting 🙂, 2 sad 😢, 3+ sick 🤒.
  - **traits** unlocked by best streak:
    - 3 "learned to sit"
    - 7 "fetches the ball"
    - 14 "keeps its room tidy"
    - 30 "brushes its teeth"
    - 60 "mentors younger pets"
    - 100 "legendary"
- **`MILESTONES`:** [3, 7, 14, 30, 60, 100]. Reaching one fires confetti.
- **`parseQuick(text, now)`:** a hand-written parser (no chrono-node, which is 41KB).
  - Understands `today`, `tomorrow`, weekday names, `5pm`, `17:30`, `in 2h`, `in 30m`.
  - Returns `{ title, date, at }`.
  - `ponytail:` comment: English only, simple phrases; swap in chrono-node if it misparses often.

### Calendar export: `api/_lib/ics.js` plus `api/ics.js`
- `toICS({ title, start })` builds a VCALENDAR/VEVENT with a 0-minute VALARM, escaping `,;\` and newlines.
- `GET /api/ics?title=&start=ISO` validates input (title 1–200 chars, valid date) and returns 400 otherwise.
  - Responds with `Content-Type: text/calendar` and `Content-Disposition: attachment; filename=reminder.ics`, so iOS shows its "Add to Calendar" sheet.
  - Stateless, stores nothing. `ponytail:` note: the reminder title shows up in Vercel request logs.

### UI: `src/tabs/Life.jsx` (single file, same structure as Invest.jsx)
- **Top strip:** total wallet (animated counter) · tasks due today · reminders due.
- **Sub-view pills:** ✅ Tasks · ⏰ Reminders · 🐾 Habits · 📝 Notes.
- **Tasks view:**
  - quick-add input using `parseQuick`
  - sections: Overdue (undone past-due tasks carry over), Today, Upcoming, No date
  - completed tasks collapse into "Done (n)"
  - clearing everything due today fires confetti
- **Reminders view:**
  - quick-add ("call mom tomorrow 6pm") or `<input type="datetime-local">`
  - each row has 📅 Add to Calendar (`window.location = /api/ics?...`) and ✓ Done
  - a 30s interval while the tab is open shows a slide-down banner for due reminders
  - `navigator.setAppBadge?.(dueCount)`, guarded
- **Habits view:**
  - "New habit" form: name, category (sets ₹), pet species 🐶🐱🐰🦊🐼🐧🐉
  - one card per habit shows:
    - the pet with a mood animation and a speech bubble ("I learned to fetch!")
    - health bar
    - 🔥 streak with a CSS flicker
    - ×multiplier chip and ₹ earned
    - trait badges, locked or unlocked
    - a big check-in button; tap again to undo today
  - on check-in:
    - a "+₹150" coin floats up
    - the pet does a happy jump
    - confetti fires on milestones
- **Notes view:** renders the existing `<Notes />`, plus small edits in `Notes.jsx`:
  - 📌 pin (pinned notes sort first)
  - a colour swatch (5 dark-tinted card colours via `note-card[data-color]`)
- **Motion:**
  - Life wraps in `<MotionConfig reducedMotion="user">`.
  - Lists use `AnimatePresence` plus `motion.div layout` (enter/exit slide).
  - The pet uses mood variants: happy = bounce loop, sad = droop, sick = wobble, waiting = gentle breathe.
  - Spring scale on check-in.
- **Confetti:** `import('canvas-confetti')` loaded only when needed, with `disableForReducedMotion: true`.

### App shell and themes
- **`src/App.jsx`:**
  - import Life
  - add `{ id: 'Life', icon: '🌱', label: 'Life' }` as the first `TABS` entry and make it the default tab
  - add a theme picker (5 swatches) to the Settings card
  - apply the theme with `document.documentElement.dataset.accent = theme` when settings load and when the theme changes
- **Bug fix needed for themes:** `save()` currently writes `saveSettings({ cfHandle })`, which would erase `theme`. Change to `saveSettings({ ...settings, cfHandle })`.
- **`src/styles.css`:**
  - `.tab-bar-inner` gets `overflow-x:auto; scrollbar-width:none`; `.tab-btn` becomes `flex: 1 0 64px`. Seven tabs fit at 640px and scroll at 375px.
  - Themes Ocean (current blue, default), Forest, Sunset, Grape, Rose use `:root[data-accent="…"]` to override `--accent`, `--accent-dim`, `--accent-solid` and a new `--accent-hover`.
  - Swap the two hard-coded blues for these variables: `.btn-primary:hover #3b82f6` and `.expense-fab` shadow.
  - New `life-*` / `pet-*` / `wallet-*` section with keyframes `flicker`, `coinUp`, `pop`.
  - `@media (prefers-reduced-motion: reduce)` turns the CSS keyframes off.
- **`package.json`:** add `motion` and `canvas-confetti`. This consciously breaks the earlier no-deps rule because the user asked for these animations.
  - `ponytail:` note: the full `motion` import is about 34KB gz. Switch to `LazyMotion` + `m` + `domMax` if bundle size starts to matter.

### Files
- **New:**
  - `src/tabs/Life.jsx`
  - `src/life/logic.js`
  - `api/ics.js`
  - `api/_lib/ics.js`
  - `test/lifeLogic.test.js`
  - `test/ics.test.js`
  - `docs/superpowers/specs/2026-09-14-life-tab-design.md` (a copy of this design)
- **Modified:** `src/App.jsx`, `src/store.js`, `src/tabs/Notes.jsx`, `src/styles.css`, `package.json`, `README.md` (layout plus `/api/ics` smoke test)
- No commits unless the user asks.

## Implementation order
1. Write the spec doc. Run `npm i motion canvas-confetti`.
2. TDD `src/life/logic.js`: streaks, multiplier, earnings, petState, parseQuick. Watch tests fail first, then make them pass.
3. TDD `api/_lib/ics.js`, then `api/ics.js` with input validation.
4. Add store functions.
5. App shell: scrollable tab bar, Life tab, theme picker plus the settings bug fix, theme CSS.
6. Build `Life.jsx` views in this order: Habits (pet plus wallet, the core delight), Tasks, Reminders, Notes embed with pin/colour.
7. CSS polish, reduced-motion checks, README.

## Verification
- **`npm test`:** new tests must pass. `pickProblems.test.js` was already failing before this work; report it separately and don't fix it here.
- **`npm run build`:** passes; note the bundle size change.
- **In-browser check with `preview_start forge-dev` at 375×812:**
  - All 7 tabs reachable by scrolling the bar, with no horizontal page scroll.
  - Add a habit, check in, and see the coin float, pet jump and ₹ go up. Tap again to undo.
  - Seed back-dated check-ins through the console or localforage to confirm:
    - a 7-day streak gives ×1.5, the "fetches the ball" trait and confetti
    - a 3-day gap makes the pet 🤒 sick with low health
  - Tasks: "gym tomorrow 5pm" parses correctly; an overdue task shows under Overdue; clearing today fires confetti.
  - Reminders: a reminder 1 minute ahead shows the banner while the tab is open.
  - Calendar endpoint:
    - `curl "localhost:5173/api/ics?title=Test&start=2026-09-15T17:00:00+05:30"` returns `text/calendar` with a VALARM
    - a bad `start` returns 400
  - Notes: existing notes still load; pin and colour survive a reload.
  - Settings → Grape theme recolours the app, survives a reload, and the CF handle is still set.
  - No console errors.
- **On the iPhone (user checks after deploy):** the Add to Calendar sheet opens from the home-screen app.
