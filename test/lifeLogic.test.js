import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dateKey,
  streaks,
  multiplier,
  earnings,
  petState,
  parseQuick,
  crossedMilestone,
  CATEGORIES,
  TRAITS,
} from '../src/life/logic.js'

test('dateKey formats a local date as zero-padded YYYY-MM-DD', () => {
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(dateKey(new Date(2026, 8, 14)), '2026-09-14')
})

test('streaks: consecutive check-ins through today', () => {
  const out = streaks(['2026-09-12', '2026-09-13', '2026-09-14'], new Date(2026, 8, 14))
  assert.equal(out.current, 3)
  assert.equal(out.best, 3)
})

test('streaks: a gap before the run does not extend current or best beyond the run', () => {
  const out = streaks(['2026-09-10', '2026-09-12', '2026-09-13', '2026-09-14'], new Date(2026, 8, 14))
  assert.equal(out.current, 3)
  assert.equal(out.best, 3)
})

test('streaks: yesterday checked in but not today still counts as a live streak (grace day)', () => {
  const out = streaks(['2026-09-13'], new Date(2026, 8, 14))
  assert.equal(out.current, 1)
})

test('streaks: a 2-day gap breaks the current streak to zero', () => {
  const out = streaks(['2026-09-11'], new Date(2026, 8, 14))
  assert.equal(out.current, 0)
})

test('streaks: best tracks the longest run even after it is broken', () => {
  const out = streaks(
    ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10', '2026-09-11'],
    new Date(2026, 8, 11)
  )
  assert.equal(out.current, 2)
  assert.equal(out.best, 3)
})

test('multiplier: tiers by streak length', () => {
  assert.equal(multiplier(1), 1)
  assert.equal(multiplier(2), 1)
  assert.equal(multiplier(3), 1.25)
  assert.equal(multiplier(6), 1.25)
  assert.equal(multiplier(7), 1.5)
  assert.equal(multiplier(13), 1.5)
  assert.equal(multiplier(14), 2)
  assert.equal(multiplier(29), 2)
  assert.equal(multiplier(30), 3)
  assert.equal(multiplier(100), 3)
})

test('earnings: replays check-ins, applying the multiplier for that day\'s running streak', () => {
  const habit = { category: 'exercise', checkins: ['2026-09-12', '2026-09-13', '2026-09-14'] }
  const out = earnings(habit, new Date(2026, 8, 14))
  // day1: 100*1=100, day2: 100*1=100, day3: 100*1.25=125
  assert.equal(out.total, 325)
  assert.equal(out.today, 125)
  assert.equal(out.nextMultiplierIn, 4) // current streak 3, next tier at 7
})

test('earnings: a gap resets the running multiplier but not the accumulated total', () => {
  const habit = {
    category: 'reading',
    checkins: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-10'],
  }
  const out = earnings(habit, new Date(2026, 8, 10))
  // 50 + 50 + 62.5 + 50 (streak reset to 1 after the gap)
  assert.equal(out.total, 212.5)
  assert.equal(out.today, 50)
  assert.equal(out.nextMultiplierIn, 2) // current streak 1, next tier at 3
})

test('earnings: an unknown category falls back to the custom value', () => {
  const habit = { category: 'nope', checkins: ['2026-09-14'] }
  const out = earnings(habit, new Date(2026, 8, 14))
  assert.equal(out.total, CATEGORIES.custom)
})

test('petState: no check-ins yet is an egg with zero health', () => {
  const state = petState({ checkins: [] }, new Date(2026, 8, 14))
  assert.equal(state.stage, 'egg')
  assert.equal(state.health, 0)
  assert.deepEqual(state.traits.filter((t) => t.unlocked), [])
})

test('petState: stage advances with total check-ins', () => {
  const many = Array.from({ length: 21 }, (_, i) => `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, '0')}`)
  const state = petState({ checkins: many }, new Date(2026, 8, 14))
  assert.equal(state.stage, 'adult')
})

test('petState: health is the share of the last 7 days checked in', () => {
  const state = petState(
    { checkins: ['2026-09-14', '2026-09-13', '2026-09-12', '2026-09-11'] },
    new Date(2026, 8, 14)
  )
  assert.equal(state.health, Math.round((4 / 7) * 100))
})

test('petState: mood turns sick after 3+ days without a check-in', () => {
  const state = petState({ checkins: ['2026-09-10'] }, new Date(2026, 8, 14))
  assert.equal(state.mood, 'sick')
})

test('petState: mood is happy the same day as a check-in', () => {
  const state = petState({ checkins: ['2026-09-14'] }, new Date(2026, 8, 14))
  assert.equal(state.mood, 'happy')
})

test('petState: traits unlock at their streak milestone', () => {
  const checkins = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14']
  const state = petState({ checkins }, new Date(2026, 8, 14))
  const unlocked = state.traits.filter((t) => t.unlocked).map((t) => t.days)
  assert.deepEqual(unlocked, [3, 7])
})

test('crossedMilestone: returns the milestone when the streak just reached it', () => {
  assert.equal(crossedMilestone(2, 3), 3)
  assert.equal(crossedMilestone(6, 7), 7)
})

test('crossedMilestone: returns null when no milestone was crossed', () => {
  assert.equal(crossedMilestone(5, 6), null)
  assert.equal(crossedMilestone(7, 7), null)
})

test('crossedMilestone: returns the highest milestone when several are skipped at once', () => {
  assert.equal(crossedMilestone(0, 30), 30)
})

test('parseQuick: plain text with no date has no due date', () => {
  const out = parseQuick('just a plain task', new Date(2026, 8, 14, 9, 0))
  assert.equal(out.title, 'just a plain task')
  assert.equal(out.date, null)
  assert.equal(out.at, null)
})

test('parseQuick: "tomorrow 5pm" sets both date and time', () => {
  const out = parseQuick('gym tomorrow 5pm', new Date(2026, 8, 14, 10, 0))
  assert.equal(out.title, 'gym')
  assert.equal(dateKey(out.date), '2026-09-15')
  assert.equal(out.at.getHours(), 17)
  assert.equal(out.at.getMinutes(), 0)
})

test('parseQuick: "today" sets the date with no time', () => {
  const out = parseQuick('water plants today', new Date(2026, 8, 14, 9, 0))
  assert.equal(out.title, 'water plants')
  assert.equal(dateKey(out.date), '2026-09-14')
  assert.equal(out.at, null)
})

test('parseQuick: "in 30m" sets an exact time relative to now', () => {
  const now = new Date(2026, 8, 14, 9, 0)
  const out = parseQuick('call mom in 30m', now)
  assert.equal(out.title, 'call mom')
  assert.equal(out.at.getTime(), now.getTime() + 30 * 60 * 1000)
})

test('parseQuick: a weekday name resolves to that date', () => {
  // Jan 1 2024 is a known Monday, so "wednesday" from there is Jan 3 2024.
  const out = parseQuick('standup wednesday 9am', new Date(2024, 0, 1, 8, 0))
  assert.equal(out.title, 'standup')
  assert.equal(dateKey(out.date), '2024-01-03')
  assert.equal(out.at.getHours(), 9)
})
