# Ember device checklist (owner, real iPhone and iPad)

Task E4-14 (owner task E4-U1 in `docs/plan/ember/DECISIONS.md`, D8). Nothing here has been run on a device. The Playwright projects are Chromium emulations, not WebKit, so these checks are the only evidence for real iOS behaviour. Every box is unticked.

## How to use this file

- Test the deployed build (Vercel production or preview), not the dev server. Write the build id (commit sha or deployment id) in the sign-off at the end.
- Tick a box only after you saw the expected result. If it does not match, leave it unticked and write what you saw beside it.
- Devices: one iPhone (390px wide is the reference, for example iPhone 14) and one iPad. Run the iPhone sections on the iPhone and the iPad section on the iPad. Safari first, then repeat the Home Screen section installed.
- Ember is the default for new installs only. If your saved theme is another one, pick Ember in Settings (gear in the top bar) before section 1.
- Related, wider checklist: `docs/qa/definition-of-done.md`.

## 1. Safe areas (iPhone, portrait then landscape)

- [ ] In Safari, the top bar and page title are not under the status bar or Dynamic Island. Expected: all text fully visible.
- [ ] Installed from the Home Screen, the top bar is not under the status bar. Expected: all text fully visible.
- [ ] The tab bar sits above the home indicator, with the labels not covered by it. Expected: clear gap, tabs tappable.
- [ ] Landscape, no content is hidden behind the notch or the rounded corners. Expected: left and right content is inset.
- [ ] The last item at the bottom of Today can be scrolled fully above the tab bar. Expected: nothing stays hidden behind the bar.

## 2. Six tabs at 390px (iPhone, portrait)

- [ ] Exactly six tabs show: Today, Life, Logic, Money, Invest, Agents. Expected: none missing, none extra.
- [ ] Every tab label is fully readable (no clipping or ellipsis) and the tab icons are line icons. Expected: all six labels in full.
- [ ] The page does not scroll sideways on any of the six tabs. Expected: only vertical scrolling.
- [ ] The active tab is marked by the flame colour and not by colour alone (label or icon weight also differs from the others). Expected: active tab clearly identifiable.
- [ ] Each tab opens on a single tap with no sticky pressed or hover look afterwards. Expected: normal state after the finger lifts.

## 3. Plus button above the tab bar (iPhone)

- [ ] A round flame plus button is visible bottom-right on each of the six tabs. Expected: same position on every tab.
- [ ] It sits fully above the tab bar and the home indicator and covers no tab. Expected: visible gap between the plus and the tab bar.
- [ ] It does not hide the last row or button of the screen when you scroll to the end. Expected: the last item can be scrolled clear of it.
- [ ] A toast (for example after saving) appears above the tab bar and is not covered by the plus. Expected: toast text and Undo fully visible.

## 4. Capture sheet with the keyboard open (iPhone)

- [ ] Tapping the plus opens the capture sheet as a bottom sheet with type chips (Expense, Note, Reminder, Task, Habit, Solve, Mood) that scroll sideways. Expected: all seven reachable.
- [ ] With the keyboard open, the text field, the parsed chips and the primary button ("Add expense" and so on) are all visible, not hidden behind the keyboard. Expected: you can see what you type and tap the button.
- [ ] Typing "450 coffee with raj" in Expense shows chips for 450 rupees, Coffee, Today and With Raj. Expected: four chips matching the text.
- [ ] Tapping a chip opens its editor and you can change it, then return to the sheet. Expected: the change shows in the chip.
- [ ] Saving closes the sheet and shows a toast with Undo. Undo removes the entry. Expected: entry added, then gone after Undo.
- [ ] Typing with no category (for example "450") leaves the button disabled and the category chip reads "Pick category". Expected: no save until a category is picked.
- [ ] Closing the sheet (swipe, Esc on an external keyboard, or the close button) leaves the page where it was and the plus is usable again. Expected: no stuck overlay or frozen scrolling.
- [ ] The sheet does not zoom the page when you focus the text field. Expected: page stays at the same zoom.

## 5. Dark (Ember) and cream themes (iPhone and iPad)

- [ ] In Ember, text, borders, the next-up card and the dailies strip are legible, and the flame colour appears only on the next item, the active tab and the primary actions. Expected: no unreadable text.
- [ ] Done dailies show a check mark and not just a green tint; overdue shows in red with text. Expected: state is clear without colour.
- [ ] Switch to Cream in Settings: text, borders, plus button, tab bar and capture sheet are all legible. Expected: no invisible control.
- [ ] The Safari address bar colour follows the theme (dark for Ember, cream for Cream). Expected: no white or black strip that clashes.
- [ ] Space Grotesk headings, Inter body text and JetBrains Mono times and amounts render, with no flash of a wrong font that stays. Expected: the three fonts visible.

## 6. Reduced motion (iPhone, Settings > Accessibility > Motion > Reduce Motion on)

- [ ] Opening and closing the capture sheet does not slide (it appears or fades without a long motion). Expected: no slide animation.
- [ ] Completing all five dailies shows no confetti. Expected: nothing animates (a day with no confetti is fine). Turn Reduce Motion off and check that one burst happens once per day.

## 7. Offline start (iPhone, installed app)

- [ ] Open the app online once and let it finish loading, then force quit and turn on Airplane mode. Expected: the app opens to the Today screen, not a blank page or a browser offline page.
- [ ] Still offline, add an expense and a reminder with the plus button, then force quit and reopen (still offline). Expected: both are still there.
- [ ] Fonts and icons still render offline. Expected: no missing glyph boxes, no fallback-only look.
- [ ] Back online, a reload keeps the entries made offline. Expected: nothing lost or duplicated.

## 8. Add to Home Screen (iPhone and iPad)

- [ ] Share, then Add to Home Screen, shows the app icon (not a blank tile or a page screenshot). Expected: the real Forge icon.
- [ ] It opens standalone, with no Safari address bar. Expected: full-screen app.
- [ ] Sections 1 to 3 give the same results installed as in Safari. Expected: same safe-area and plus-button results.

## 9. iPad (portrait, landscape, Split View)

- [ ] Portrait shows the 72px icon rail and no bottom tab bar; every control is easy to tap (44px). Expected: rail only.
- [ ] Landscape shows the labelled sidebar; the plus button is visible and opens the capture sheet as a centred or side panel, not a bottom sheet. Expected: sheet fits the screen.
- [ ] Split View one third (or Slide Over) shows the phone layout with six bottom tabs and no sideways scroll. Expected: layout follows the window width.
- [ ] With a hardware keyboard, N opens the capture sheet (not while typing in a field), and Cmd+K opens the command palette. Expected: both work.
- [ ] Rotating with an item selected keeps the same tab and selection. Expected: no reset.

## Sign-off

Leave blank until true.

- Build id (commit sha or deployment id):
- Deployed URL:
- Date:
- iPhone model and iOS version:
- iPad model and iPadOS version:
- Items that did not match, with notes:
