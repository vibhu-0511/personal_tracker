# B3 appendix: hybrid design spec (A shell + B Today)

Detail behind `B3-report.md`. Section numbers match the questions in the charter. "Proto" = blueprint prototype CSS in `docs/forge-blueprint.html` (A: lines 555-604, B: 605-650, shared 520-554, data 1367-1461). "Std" = `src/styles.css`.
Contrast ratios are WCAG 2.x, computed with a script (sRGB luminance); see scratchpad `cr.mjs`, results quoted inline.

## 1. Tokens

### 1.1 Mapping (existing name wins; proto names are aliases)

| Hybrid token (existing name kept) | Std today | A proto | B proto | Dark (ocean/forest/sunset/grape/rose) | Light: sky | Light: cream (NEW, 7th) |
|---|---|---|---|---|---|---|
| `--bg` | #0a0c10 | --bg #0e1015 | #fff6e9 | keep | keep #eaf4ff | #fff6e9 |
| `--surface` | #13161d | --sf #151821 | --sf #fff | keep | keep rgba(255,255,255,.72) | #ffffff |
| `--surface-raised` | #1a1e28 | --sf2 #1b1f2b | --sf2 #fff0dc | keep | keep rgba(255,255,255,.88) | #fff0dc |
| `--border` | #252a36 | --bd #262b38 | --bd #f0e3d0 | keep | keep | #f0e3d0 |
| `--border-light` | #2d3344 | - | - | keep | keep | #e4d2b8 |
| `--text` | #eaecf1 | --tx #e6e9f0 | --tx #2b2438 | keep (15.3 on surface) | keep #1c2333 (14.1) | #2b2438 (13.9 on bg) |
| `--text-secondary` | #8b95a8 | --mu #8a93a6 | --mu #82788f | keep (6.00) | keep #5b6478 (5.34) | **#5f5670** (6.43 bg, 6.88 white). B's #82788f is 3.90 on bg, 3.29-3.69 on pastels: FAIL |
| `--text-tertiary` | #5d6577 (3.10 on surface: FAIL) | - | - | **#7d8799** (5.00 surface, 5.40 bg) | **#5d687d** (5.05 bg, 4.60 peach, 4.42 lilac). Std #8791a3 = 2.86 FAIL | #7a7088 (4.36 bg, 4.67 white; use for non-essential only) |
| `--accent` | #6ea8fe (per theme) | --ac #7c8cff | --ac #ff6b57 | per theme (unchanged) | #2563eb | #c2412d (4.80 bg, 5.14 white, 4.21 on peach) |
| `--accent-solid` (button fill) | #2563eb | --ac | --ac | per theme | #111827 | #d6402b (white text 4.54). B's #ff6b57 + white = 2.80 FAIL; keep #ff6b57 only as decorative `--accent-bright` (flame, ring tip) |
| `--accent-hover` / `--accent-dim` | per theme | - | - | per theme | per theme | #b8341f / rgba(214,64,43,.12) |
| `--success` | #4ade80 | --up #4ade80 | --up #1f9d62 | keep | **#16794a** (4.88 on #eaf4ff; Std #4ade80 on white = 1.74 FAIL) | #16794a (5.07 bg, 4.28-4.80 on pastels) |
| `--danger` | #f87171 | --dn #f87171 | --dn #d6453a | keep | **#b4281d** (5.79) | #b4281d (6.01 bg, 5.07-5.69 on pastels) |
| `--warn` | #fbbf24 | - | - | keep | **#8a5a00** (5.5) | #8a5a00 (5.53) |
| `--*-dim` (success/warn/danger) | rgba(.12) | --hotbg | --hotbg #ffd9d2 | keep | rgba of new colours at .14 | same |
| `--radius / -sm / -xs` | 14 / 10 / 8 | --r 8 | --r 24 | keep | 22 / 16 / 14 (Std sky) | 22 / 16 / 14 (reuse sky radii) |

New tokens (all themes unless stated):

| Token | Dark | Sky | Cream | Source / use |
|---|---|---|---|---|
| `--hover` | rgba(255,255,255,.04) | rgba(15,23,42,.05) | rgba(43,36,56,.06) | blueprint drop-in CSS uses `var(--hover)` (blueprint:241) but it is undefined in Std |
| `--track` | var(--border) | rgba(15,23,42,.10) | #f2e6d4 | proto --trk; Std already uses --border as bar track (styles.css:762, 1058) |
| `--on-accent` | #fff | #fff | #fff | text on --accent-solid |
| `--focus-ring` | var(--accent) | #2563eb (4.65) | #c2412d (4.80) | `:focus-visible` outline 2px, offset 2px |
| `--rail-w` / `--side-w` | 72px / 220px | same | same | resolves 64/216 vs 72/220 (see 2.1) |
| `--tabbar-h` | 56px + safe-area | same | same | measured Std height ~53px; 56 gives >=44 target + padding; set to 0px when rail/sidebar active |
| `--inspector-w` | 300px (1024-1279), 320px (>=1280) | same | same | proto 300 (blueprint:601) |
| `--tile-radius` / `--tile-pad` | 22px / 14px | same | same | B proto --r 24 reduced so tiles do not exceed `--radius` by >8 |
| `--tile-shadow` | none (dark uses 1px border) | 0 8px 30px rgba(15,23,42,.08) (Std sky card) | 0 2px 0 rgba(120,80,30,.08), 0 10px 24px rgba(120,80,30,.07) (B proto) | |
| `--tile-sec` (secondary text inside tiles) | #a3adc0 | #5b6478 | #5f5670 | dark: #8b95a8 on tiles is 4.28-4.73 (marginal); #a3adc0 is 5.72-6.31 |
| `--font-ui` | system stack (Std body) | same | ui-rounded, "SF Pro Rounded", "Nunito", system-ui | cream only gets the rounded stack (B proto line 605) |
| `--chart-1..6` | #7c8cff #3dd6c6 #ffb86b #ff7a90 #a78bfa #6b7488 (A palette; 3.86-10.6 vs surface) | #d6402b #16805a #b07400 #6d4fe0 #2b72c9 #857565 | same as sky | B palette (#ff6b57 #2fbf84 #ffb703 ...) is 1.75-3.69 vs white: FAIL for slices; donut also needs 2px surface-coloured gaps + text legend |

### 1.2 Pastel tile tokens (both modes)

| Token | Dark = mix(--surface #13161d, hue, 16%) | Light (sky + cream) = B proto | Contrast, text on tile (dark: --text / --tile-sec; light: --text / --tile-sec) |
|---|---|---|---|
| `--tile-peach` | #382a22 | #ffe3d6 | 11.67 / 6.11 ; sky 12.87 / 4.86 ; cream 12.19 / 5.64 |
| `--tile-mint` | #1c362d | #dcf3e8 | 11.00 / 5.76 ; 13.48 / 5.09 ; 12.77 / 5.91 |
| `--tile-butter` | #38311e | #fff1bd | 10.93 / 5.72 ; 13.88 / 5.25 ; 13.15 / 6.08 |
| `--tile-lilac` | #2f2841 | #e8e0ff | 11.84 / 6.19 ; 12.36 / 4.67 ; 11.71 / 5.42 |
| `--tile-sky` | #222d41 | #d9edff | 11.69 / 6.12 ; 13.09 / 4.95 ; 12.40 / 5.74 |
| `--tile-plain` | var(--surface) | var(--surface) | - |
| `--tile-inner` (row/pet cell inside a tile) | rgba(255,255,255,.06) | rgba(255,255,255,.65) | B proto line 614 |

Rules: tone is assigned per tile id (Streak=peach, Wallet=butter, Pets=mint, Code=sky, Tasks=plain, Spend=lilac, Mood=peach, Tutor=sky, Watch=mint), NOT by `:nth-child(5n+k)` as in B proto (line 609-610) because spans change order per breakpoint. On tiles use `--text`/`--tile-sec` only; never `--text-tertiary` (4.22-4.60 light, fails less in dark but is decorative). Status colours on dark tiles pass (danger #f87171 4.67-5.06, success 7.4-8.0, warn 7.7-8.4).

### 1.3 How cream sits with the 6 themes

- Keep ONE attribute, `data-accent` (set at `src/App.jsx:97,117,146`; persisted as `settings.theme`, `src/store.js:70`). Add `:root[data-accent="cream"]` block in `src/styles/tokens.css` next to the `sky` block pattern (`src/styles.css:50-92`). No settings migration; an older client that receives `cream` falls back to `:root` (ocean) because unknown values match no selector.
- Two families: dark (ocean, forest, sunset, grape, rose = only accent tokens differ) and light (sky, cream = full surface set). Light-only overrides (status colours, `--tile-*`, `--hover`, `color-scheme: light`) are declared once in a grouped selector `:root[data-accent="sky"], :root[data-accent="cream"]`, then cream refines.
- Add `{ id: 'cream', label: 'Cream', color: '#ff6b57' }` to `THEMES` (`src/App.jsx:23-30`); the swatch button is a 28px circle (`styles.css:988`): raise to 44px hit area (see 6).
- Sky keeps its background image + backdrop blur rules (`styles.css:68-92`); cream is flat (no blur) so it stays cheap on low-end iPads.
- Hard-coded colours that will not follow a light theme (Inference: 27 colour literals after line 94 of Std, e.g. `.puzzle-card` gradient #1a1e28 at 373, `.send-btn:hover` #3b82f6 at 563, `.toast` shadow, 5x `#fff`; plus 8 inline hex in JSX, Exams.jsx:13,33,73): token-ise during the retrofit task.

## 2. Shell (container = `.app-root { container: app / inline-size }`; `.shell` is a CHILD grid, since a container cannot style itself)

### 2.1 Decisions

- Rail 72px, sidebar 220px (blueprint:207-208, 232, 236 and the drop-in CSS) beat the prototype's 64/216 (blueprint:591-598). 72 allows a 44px target plus 14px padding; 220 fits "Invest" + a ⌘N hint.
- Inspector from >=1024 (user decision) = proto (`.a-body` `1fr 300px`, blueprint:600) NOT the table (blueprint:208-209: 1024-1279 "list + detail", >=1280 "360 | 1fr | 300"). The separate third "detail" pane is deferred; the inspector is the detail.
- One `<nav aria-label="Primary">` DOM node restyled per breakpoint (grid areas), NOT three nav blocks toggled with display (blueprint:229-237). Keeps focus when an iPad rotates mid-session and avoids duplicate landmarks.
- 6 destinations (Today, Life, Logic, Money, Invest, Agents), so the blueprint table row "Bottom tab bar (5 tabs)" (blueprint:206) is stale; also the audit line "FAB offset is calc(64px + safe-area)" (blueprint:184) describes `.toast-stack` (styles.css:624); the only FAB, `.expense-fab`, is `bottom: 80px` (styles.css:738).

### 2.2 Per breakpoint

| | <600 | 600-1023 | 1024-1279 | >=1280 |
|---|---|---|---|---|
| Typical | iPhone, Slide Over, 1/3 Split | iPad portrait, 1/2 Split | iPad landscape, laptop | desktop, iPad Pro 13" landscape |
| Nav | bottom tabs, 6 items, `flex:1 1 0; min-width:44px` (Std `flex:1 0 64px` x6 = 384px overflows at 320, styles.css:165) | 72px rail: 22px icon + 11px label | 220px sidebar: icon, label, `⌘n` kbd (only if `(hover:hover) and (pointer:fine)`) | same as 1024 |
| Grid | `grid-template-rows: 1fr auto` | `72px 1fr` | `220px 1fr` | `220px 1fr` |
| Panes | 1 column | 1 column; blocks 2-up (`.a-col.two`); inspector = right side sheet 400px | `.page: minmax(0,1fr) 300px`; blocks 1 col | `.page: minmax(0,1fr) 320px`; blocks 2-up |
| Header | title (ellipsis), sync dot, `Lv` pill, `₹` pill, search icon, gear; subtitle hidden | + sync text, visible `+ New` button | + search field showing ⌘K | same |
| FAB | pill `+ New`, 44px, only on screens that register a `new` action; `bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom) + 16px)` | none (header `+ New`) | none | none |
| Sub-nav | horizontal scroll pills | same | same, in header band | same |
| Sheets | bottom sheet (Std) | forms: bottom sheet max 640; inspector: side sheet | forms: centred dialog 480; inspector docked | same |
| Toast | above tab bar | bottom-centre of content area | same | bottom-left of content area |
| Density | row min-height 44px (coarse) | 44px | 44px if `pointer:coarse`, 36px only if `pointer:fine` | same rule |

Density is keyed by POINTER, not width: blueprint:209 gives "dense rows 36px" to >=1280 which includes iPad Pro 13" (touch). Rule: `@media (pointer:fine)` for 36px; `@media (pointer:coarse)` 44px at every width.

Today (home) has no inspector and no sub-nav: its grid fills `.page` (full width, max 1280px, centred).

### 2.3 Command palette (⌘K / Ctrl+K), built on `<Sheet>` (native dialog)

| Group | Items | Data source |
|---|---|---|
| Go to | 6 screens + sub-views (18, see 7) | `src/shell/routes.js` |
| Actions | New task, New reminder, New note, Add expense, Add habit, Log mood, Check in <habit>, Open settings, Switch theme (7), Sync now (`flush`, `src/store.js:48`) | registered per screen via `useShellAction` |
| Tasks / Reminders / Notes / Habits / Watchlist | open items, fuzzy match on title/body/tags/name | `getTasks, getReminders, getNotes, getHabits, getWatchlist` (store.js:149,156,76,166,142), loaded on open (IndexedDB, local) |

Pattern: `input role=combobox aria-expanded aria-controls`, results `role=listbox`, `aria-activedescendant`; Up/Down/Home/End, Enter runs, Esc closes (native dialog), result group headers are non-focusable. Prefix `>` actions only, `/` navigation only (optional).

### 2.4 Shortcuts

| Key | Action | Notes |
|---|---|---|
| Mod+K | palette | `preventDefault` works for Ctrl+K in Firefox (it is not reserved) |
| Mod+1..6 | go to Today..Agents | Inference: Chrome/Safari/Firefox reserve Cmd/Ctrl+1..8 for browser tabs in a normal tab and a page cannot reliably override; works in an installed PWA window. Ship `g` then `t/l/c/m/i/a` chord and Alt+1..6 as the web fallbacks and show the one that works |
| N | run the screen's `new` action | ignored when focus is in input/textarea/select/contenteditable, when any dialog is open, or when a modifier is held |
| X | toggle complete on the focused/selected row | same guards; needs a roving-tabindex row list |
| / | focus the screen's filter input | |
| [ and ] | previous / next sub-view | |
| ? | shortcut cheat sheet (inspector card in proto, blueprint "Keyboard" block) | |
| Esc | close palette / sheet / inspector (side sheet only) | native dialog already does the first two |

WCAG 2.1.4 (Character Key Shortcuts): N, X, /, [, ] must be switchable off. Add `settings.shortcuts !== false` (settings key is synced; field is additive).

## 3. Today (B tiles)

Grid: `.today-grid` is its OWN container (`container: tg / inline-size`), columns by grid width not app width: 2 cols <600px, 4 cols 600-899px, 6 cols >=900px, gap 12px, padding 0. Reason: with app-width thresholds a 4-col grid at app width 600 with the 72px rail gives (600-72-32-36)/4 = 115px 1-col tiles, narrower than the mood/ring content. Resulting columns by app width: 390 -> 2; 600-703 -> 2; 704-1023 (834 iPad portrait: grid 730) -> 4; 1024-1169 (grid 772) -> 4; >=1170 (1194 landscape: 942) -> 6; 1440 -> 6 (max-width 1280).
DOM order (matters for 2-col reading + focus order; no `grid-auto-flow: dense`): streak, wallet, pets, code, watch, tasks, spend, mood, tutor.

| # | Tile (tone) | span 2col / 4col / 6col | Content (proto -> real) | Provider (real) | Missing / change |
|---|---|---|---|---|---|
| 1 | Streak (peach) | 1 / 2 / 3 | flame, "N days", "best M", bar to next milestone | `streaks(unionOfAllCheckins, today)` `src/life/logic.js:65`; union = `[...new Set(habits.flatMap(h=>h.checkins))]`; `MILESTONES` logic.js:27; habits via `getHabits()` store.js:166 | No global streak exists: proto "12 days" has no source. Union definition = "at least one check-in per day". Pure fn in `src/today/logic.js` |
| 2 | Wallet (butter) | 1 / 2 / 3 | ₹ total, "N check-ins left", Level + next multiplier | `habits.reduce((s,h)=>s+earnings(h,now).total,0)` (same as `src/tabs/Life.jsx:160-163`); `earnings().nextMultiplierIn` logic.js:92-114; left = habits without `dateKey(now)` in checkins | Level/XP missing (see 3.1). Wallet has no spend sink: it is lifetime earned |
| 3 | Pets (mint) | 2 / 3 / 4 | up to 4 pets: species emoji, name, streak, stage, health bar | `petState(h,now)` logic.js:125 (`stage` egg/baby/young/adult/legend, `mood`, `health`); `streaks(h.checkins)`; `h.species/h.name` (Life.jsx:770); ordering = habits order (user-sorted, DnD) | Show first 4; "+N" chip routes to /life/habits. Check-in button on tile: 44px, same `checkIn` write path (Life.jsx:800-817) must be extracted (see risk R3) |
| 4 | Code ring (sky) | 1 / 1 / 2 | ring "2/3", "solved" | `solvedToday(progress)` exported `src/tabs/Today.jsx:24`; `getProgress()` store.js:83 | Daily target "/3" does not exist (grep: no goal in Today.jsx). Add `settings.dailyGoal` (default 3, additive). CF rating needs network (`/api/cf`): omit tile subtitle offline |
| 5 | Watch (mint) | 1 / 1 / 2 | symbol, price, ▲/▼ %, spark | `getWatchlist()` store.js:142 first `type==='stock'`; `fetch('/api/quote?symbols=')` pattern `src/tabs/Invest.jsx:432-446` returns `{symbol, price, changePct}` (`api/_lib/parseYahooChart.js:8-16`) | Proto "NIFTY 50" cannot be fetched: `SYMBOL_RE = /^[A-Z0-9&-]{1,20}\.(NS\|BO)$/` (`api/quote.js:3`) rejects index symbols. Quote is range=1d,interval=1d (api/quote.js:15) so there is NO series for `Spark`. v1: no spark; show `priceAtAdd` fallback offline |
| 6 | Tasks (plain) | 2 / 3 / 4 | top 4 open tasks with check circle, quadrant chip, due | `getTasks()` store.js:149; sort: overdue, due today, urgent+important; `quadrantLabel` Life.jsx:57-62 (not exported) | Complete = same write as Life.jsx:273-285 (not exported). "Up next" focus card from proto A home is dropped |
| 7 | Spend (lilac) | 2 / 2 / 4 | donut, ₹ month total, % of budget, top 3 categories | `getExpenses()` store.js:93, `getBudgets()` :100; month filter + `type!=='income'` as `Expenses.jsx:360-372`; `totalBudget = sum(budgets)` Expenses.jsx:403 | `CATEGORIES` (Expenses.jsx:16-29), `monthRange`, `monthTotals` (:93) are not exported: copy to `src/money/categories.js` + `src/today/logic.js`. No overall monthly budget, only per-category (so "% of budget" = % of sum of category budgets; hide when 0) |
| 8 | Mood (peach) | 2 / 2 / 2 | 5 emoji buttons (44px) + "log today" | `MANUAL_MOODS` logic.js:203 (5 values 0/25/50/75/100); `logManualMood(log,today,v)` :225; `getMoodLog()/saveMoodLog()` store.js:173-178; shape `{date:'YYYY-MM-DD', valence:0-100, source:'derived'\|'logged'}` (logic.js:222,227) | Proto shows 3 emoji; real has 5 and needs 5x44 + gaps = 252px, so tile is full width on 2-col. `ensureTodayEntry` (logic.js:217) is only called from Life (Life.jsx:99-107, gated on `ready`); Today must call it with the same gating or tile shows empty on a day Life was never opened |
| 9 | Tutor (sky) | 2 / 4 / 6 | prompt chips + input "Ask" | `src/agents.json` (topic/tool agents); POST `/api/agent` with Bearer (Agents.jsx:41-47) | Tile only navigates to /agents with `?q=` prefill; `Agents()` has no prop for initial text (Agents.jsx:25). Chat state is module-scope and survives tab change (Agents.jsx:19-22) |

Header pills (global, all screens, per blueprint:1531 "always visible in the header"): `Lv N` and `₹ total`; both from habits. Needs a shared hook `useProgressSummary()` reading `habits` and refreshing on sync tick AND on local save (see store event, report task B3-10).

### 3.1 Level / XP (not in code; decision needed)

Proposal (derived, no new stored data): `xp = round(sum(earnings(h).total))`; `level = 1 + floor(sqrt(xp / 30))`; next level at `xp = 30 * level^2`. Check: xp 1240 -> level 7 (matches proto "Lv 7" with ₹1,240, blueprint:1470,1513), next at 1470 (230 to go). Alternatives rejected: `computeStats` (src/life/logic.js:176) caps each domain at 100, so total <= 500 and plateaus; best-streak based levels are non-monotonic. Caveat: un-checking a check-in lowers xp (derived), so level can drop; acceptable because wallet already behaves so. Optional bonus: +10 xp per solved CF problem (needs `progress` key).

### 3.2 Tile interaction

Each tile is `<section aria-labelledby>`; whole-tile navigation uses a real `<a href>` on the tile title (stretched via `::after`), inner controls (check circle, mood buttons, check-in) are separate focusable buttons above it (z-index). Tile entry animation uses existing `.fade-in` (styles.css:885) and respects reduced motion (already in styles.css:1112-1116, extend to new keyframes).

## 4. The 18 sub-views (blueprint says 17)

Real Money has 5 views: `overview, txns, budget, goals, loans` (`src/tabs/Expenses.jsx:427-433`); blueprint merges overview+txns into "Spend" (blueprint:1371). Logic's DSA map is a link, not a view (`src/tabs/LogicBuilding.jsx:73-80`). Life views are 2 groups x (3+2) (`Life.jsx:35-45`). Recommendation: keep 5 Money routes (no rewrite of a 1,353-line file); label the first "Overview".

Style: A = list/blocks + inspector; T = B tiles. Default A except Habits (recommend T grid inside A shell, phase after P0 because `src/dnd/Dnd.jsx` uses `verticalListSortingStrategy` and needs `rectSortingStrategy` for a grid).

| Route | Real component | Blocks (A) | Inspector (>=1024) | Phone behaviour |
|---|---|---|---|---|
| /life/tasks | `TasksView` Life.jsx:236 | quick-add (parseQuick), urgency filter pills, sections Overdue/Today/Upcoming/Extras with DnD, Done | selected task: title/due edit, quadrant toggles, subtasks list, delete (undo toast) | list; row tap = inspector as bottom sheet; FAB = new task |
| /life/reminders | `RemindersView` :620 | quick-add, due banner, list | selected: time edit, `.ics` export link (api/ics) | same |
| /life/notes | `Notes.jsx` (438 lines) | compose form, filter, tree of notes with colours | selected note full text/edit/tags/colour/subnotes | compose in sheet |
| /life/habits | `HabitsView` :754 | **T**: pet cards grid (1/2/3 cols in list column), add habit | selected pet: traits, health, earnings, multiplier, edit/delete | cards stack; check-in 44px full width |
| /life/growth | `GrowthView` :985 | domain bars, titles chips, 30-day mood strip | mood picker + summary (avg, trend) | stack |
| /logic/code | `Today.jsx` (CF) | solved/rating/weak stats, filter panel, 3-20 problem cards, mark solved/skip | selected problem: tags, link, mark | cards; filter in sheet |
| /logic/puzzles | `Puzzles.jsx` | daily puzzle card, difficulty filter, solved count | selected puzzle detail | stack |
| /logic/exams | `Exams.jsx` | per-exam progress bars, collapsible sections with topic checkboxes, notes | selected topic: note input | accordion |
| /logic/dsa | link to `/dsa/mastery-map.html` (8,320 lines, own layout) | `wf` block: ring + "Open map" (v1) or iframe route (v2; same origin shares Supabase session) | none | link opens new page |
| /money/overview | `Expenses` view overview | month stepper, income/spent/balance, category bars, 3-month trend | selected category: txns of month | stack; FAB = add expense |
| /money/txns | view txns | search, type filter, grouped-by-date list | selected txn edit | list |
| /money/budget | view budget | per-category budget rows with edit | category budget history | list |
| /money/goals | view goals | goal cards with add funds | goal detail | list |
| /money/loans | view loans | people cards, net, search, loan form (Sheet) | person ledger | list |
| /invest/learn | `Learn` Invest.jsx:92 | phases/modules list (locked/current/done), module body, quiz | module progress/resources | list -> module page |
| /invest/research | `Research` :357 | symbol input, checklist tables | none | stack |
| /invest/watch | `Watchlist` :413 | stock/MF/IPO rows with quotes, add forms | selected item: note, links, delete | list |
| /agents | `Agents.jsx` | agent pills (tool/topic), chat, input | selected agent: system prompt summary | chat full height; composer above tab bar |

Habits/Growth recommendation: Habits = tiles (pets are the product differentiator; `habit-card` is already a self-contained card with a big check-in button and animation, `styles.css:1039`), Growth = A blocks (bars + chips scan better as a list; the Today mood tile already links there).

## 5. Component inventory (all new files under `src/ui/` unless noted; component CSS is a sibling file imported by the component so `styles.css` is not edited)

| Component | Props | Reuse (grep) | New |
|---|---|---|---|
| `Tile` | `tone, title, meta, href?, onClick?, children, as` | `.card` (Std 186, 36 usages), `.stat-card` (219) | tone tokens, container-type on tile, stretched link |
| `Row` | `lead, title, sub, trail, selected, done, onSelect, dense, as='li'` | `.life-row` (1012), `.exam-topic-row` (793), `.problem-card` (351) | selected state, roving tabindex, 44px/36px density |
| `Check` | `checked, onChange, label, tone` | `.life-check` (1017, already 44px) | visual 22px + 44px hit area; `role=checkbox` |
| `Chip` | `tone: default/muted/hot/success/warn, children` | `.chip`, `.chip-muted` (243-255, 16 usages), `.status-badge` (600) | `hot` tone |
| `Pill` | `icon, label, onClick?, href?` | `.agent-pill` (467, 22 usages) | header pills (Lv, ₹) |
| `Bar` | `value 0-100, tone, label` | `.habit-health-bar` (1058), `.exam-progress-bar` (761) | `role=progressbar`, aria-valuenow, --track |
| `Ring` | `value, size, label, children` | proto `.hero-ring` conic-gradient (blueprint:550) | CSS conic ring + `role=img` + text alternative |
| `Donut` | `segments[{id,label,value}], center, legend` | proto `.donut` (540) | segments -> `conic-gradient` string (pure, tested), --chart-n, legend list as the accessible text |
| `Spark` | `points[], tone` | proto `spark()` (blueprint:1418) | SVG polyline, `aria-hidden`, value always printed beside |
| `Stat` | `label, value, tone` | `.stat-card` (219), `.life-stat` (999) (24 usages) | one component for both |
| `SubNav` | `items[{id,label,icon}], value, onChange / href` | `.agent-bar` + `.agent-pill` (9 + 22 usages in Life, Expenses, Invest, Logic) | links (routes) not state; `aria-current` |
| `EmptyState` | `icon, text, action?` | `.empty-state` (568, 24 usages) | action button |
| `Kbd` | `children` | - | hidden unless `(hover:hover) and (pointer:fine)` |
| `Sheet` (edit `src/Sheet.jsx`) | add `side` | native dialog wrapper (27 lines, 4 usages) | right-docked variant, `max-width` token |
| `Toast` (`src/Toast.jsx`, `src/toast.js`) | unchanged | aria-live, pause on hover/focus already (Toast.jsx:12-21) | only CSS offset fix |
| `Shell`, `Nav`, `Header`, `Fab`, `Inspector`, `Palette` (`src/shell/`) | see 2 | `.tab-bar` (140), `.app-header` (116), `.gear-btn` (324), `.expense-fab` (736) | all layout via container queries |
| `useLayout()` (`src/shell/useLayout.js`) | returns `'phone'\|'rail'\|'side'` | - | ResizeObserver on `.app-root` so JS can pick Inspector pane vs sheet (container queries are not readable from JS) |
| Router (`src/router.js`, `src/shell/routes.js`) | `useRoute, Link, navigate`; pure `matchRoute` | - | History API, ~80 lines, no dependency |

Existing libs: `motion` (Life.jsx:2), `canvas-confetti`, `@dnd-kit/*` stay; no new dependency needed for the hybrid.

## 6. Interaction and accessibility

| Area | Spec | Evidence in repo |
|---|---|---|
| Focus ring | global `:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px }`; remove `outline: none` reliance on border-colour change | Std has 0 `:focus-visible` rules; inputs set `outline: none` (styles.css:315) |
| Focus order | skip link -> header (title, pills, search, new, gear) -> nav -> main -> inspector (>=1024). DOM order = main before nav on phone is NOT used: nav is placed visually by grid but sits after header in DOM | |
| Roving focus | lists use arrow keys + one tab stop; `X` acts on the focused row | none today |
| Hover | every `:hover` inside `@media (hover:hover) and (pointer:fine)`; no hover-only affordance (row actions edit/delete are always visible icons; palette/kbd hints are extras) | 18 `:hover` occurrences, 0 guarded (grep) vs blueprint "20+" (blueprint:182 audit) |
| Targets | >=44x44 under `pointer:coarse`: `.btn`, `.btn-sm` (6px 12px pad), `.agent-pill`, `.theme-swatch` (28px), `.gear-btn` (36px), `.tab-btn`, checkbox `.exam-topic-row input` (18px), `.cb`-style checks (proto 18px) | `.life-check` 44 and `.life-icon-btn` 44 already comply (styles.css:1018,1029) |
| Reduced motion | extend existing block (styles.css:1112) to new keyframes, palette/sheet slide, tile fade, ring animation; `MotionConfig reducedMotion="user"` already in Life (Life.jsx:182) | |
| Touch vs pointer | input model via `@media (pointer)` and `(hover)`, never device names; drag handle keeps `touch-action:none` (styles.css:1126) | |
| Announce | toast `aria-live=polite` (exists); sync dot `role=status`; route change moves focus to `<main>` heading and sets `document.title` | |
| Contrast | see section 1; inactive tab label uses `--text-secondary` not tertiary (Std `.tab-btn` uses tertiary at 10px: 3.35 on bg, FAIL) | styles.css:174-177 |
| Colour not alone | chart slices carry text legend; ▲/▼ glyph beside green/red; overdue = border + chip text | |
| Safe area | `viewport-fit=cover` present (index.html:5); bottom tabs add `env(safe-area-inset-bottom)`; rail adds left/right insets in landscape | styles.css:113,152 |

## 7. Route table (pure data in `src/shell/routes.js`)

`/` -> `/today`. Tab id (state today, `src/App.jsx:15-21`) -> slug: home (new) -> /today; Life -> /life; LogicBuilding -> /logic; Expenses -> /money; Invest -> /invest; Agents -> /agents. Sub-views in section 4. Query: `?sel=<id>` selected item (survives rotation), `?q=` agents prefill. `KEY_TO_TAB` (`App.jsx:35-42`) maps `progress -> 'Today'` where "Today" is the Codeforces view, so the new home MUST use a different id (`home`/`Home`) to avoid colliding in `syncTicks`.
