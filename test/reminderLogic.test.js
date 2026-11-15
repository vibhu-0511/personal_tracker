process.env.TZ = 'America/New_York' // before any Date use, so DST cases are deterministic

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  snoozeTime,
  snooze,
  reschedule,
  nextOccurrence,
  complete,
  normalizeRepeat,
  isRepeating,
} from '../src/life/reminderLogic.js'

const L = (y, m, d, h = 9, mi = 0) => new Date(y, m - 1, d, h, mi).getTime()

test('snooze presets', () => {
  const now = new Date(2026, 10, 15, 14, 30)
  assert.equal(snoozeTime('1h', now), L(2026, 11, 15, 15, 30))
  assert.equal(snoozeTime('tonight', now), L(2026, 11, 15, 20))
  assert.equal(snoozeTime('tomorrow', now), L(2026, 11, 16, 9))
  assert.throws(() => snoozeTime('soon', now))
})

test('tonight after 8 PM rolls to tomorrow 8 PM', () => {
  assert.equal(snoozeTime('tonight', new Date(2026, 10, 15, 21)), L(2026, 11, 16, 20))
  assert.equal(snoozeTime('tonight', new Date(2026, 10, 15, 20)), L(2026, 11, 16, 20))
})

test('snooze records snoozedFrom once and reschedule clears it', () => {
  const r = { id: 'a', title: 't', at: L(2026, 11, 15, 10), done: false }
  const now = new Date(2026, 10, 15, 11)
  const s1 = snooze(r, '1h', now)
  assert.equal(s1.at, L(2026, 11, 15, 12))
  assert.equal(s1.snoozedFrom, r.at)
  const s2 = snooze(s1, 'tomorrow', now)
  assert.equal(s2.snoozedFrom, r.at)
  const re = reschedule(s2, L(2026, 11, 20, 8))
  assert.equal(re.at, L(2026, 11, 20, 8))
  assert.equal('snoozedFrom' in re, false)
})

test('repeat none and old reminders stay valid', () => {
  const old = { id: 'a', title: 't', at: L(2026, 11, 15), done: false }
  assert.equal(isRepeating(old), false)
  assert.equal(nextOccurrence(old.at, undefined), null)
  assert.equal(nextOccurrence(old.at, 'none'), null)
  assert.deepEqual(complete(old, new Date(2026, 10, 15, 10)), { ...old, done: true })
  assert.deepEqual(normalizeRepeat({ type: 'bogus' }), { type: 'none' })
})

test('daily', () => {
  assert.equal(nextOccurrence(L(2026, 11, 15, 7), 'daily'), L(2026, 11, 16, 7))
})

test('weekly on chosen weekdays', () => {
  // 2026-11-15 is a Sunday. Mon(1) and Thu(4).
  const rule = { type: 'weekly', days: [4, 1] }
  const mon = nextOccurrence(L(2026, 11, 15, 18), rule)
  assert.equal(mon, L(2026, 11, 16, 18))
  assert.equal(nextOccurrence(mon, rule), L(2026, 11, 19, 18))
  assert.equal(nextOccurrence(L(2026, 11, 19, 18), rule), L(2026, 11, 23, 18))
  // no days given: same weekday next week
  assert.equal(nextOccurrence(L(2026, 11, 15, 18), 'weekly'), L(2026, 11, 22, 18))
})

test('monthly clamps at month end without drifting', () => {
  assert.equal(nextOccurrence(L(2026, 1, 31), 'monthly'), L(2026, 2, 28))
  assert.equal(nextOccurrence(L(2024, 1, 31), 'monthly'), L(2024, 2, 29)) // leap year
  assert.equal(nextOccurrence(L(2026, 2, 28), { type: 'monthly', day: 31 }), L(2026, 3, 31))
  assert.equal(nextOccurrence(L(2026, 12, 15), 'monthly'), L(2027, 1, 15))
  const done = complete(
    { id: 'a', at: L(2026, 1, 31), repeat: 'monthly', done: false },
    new Date(2026, 0, 31, 12),
  )
  assert.equal(done.at, L(2026, 2, 28))
  assert.equal(done.repeat.day, 31)
  assert.equal(complete(done, new Date(2026, 1, 28, 12)).at, L(2026, 3, 31))
})

test('daily keeps wall-clock time across DST', () => {
  // US spring forward 2026-03-08, fall back 2026-11-01
  const spring = nextOccurrence(L(2026, 3, 7, 9), 'daily')
  assert.equal(spring, L(2026, 3, 8, 9))
  assert.equal(spring - L(2026, 3, 7, 9), 23 * 3_600_000)
  const fall = nextOccurrence(L(2026, 10, 31, 9), 'daily')
  assert.equal(fall, L(2026, 11, 1, 9))
  assert.equal(fall - L(2026, 10, 31, 9), 25 * 3_600_000)
  assert.equal(new Date(spring).getHours(), 9)
})

test('weekly across DST keeps local hour', () => {
  const n = nextOccurrence(L(2026, 3, 5, 8), 'weekly') // Thu before spring forward
  assert.equal(n, L(2026, 3, 12, 8))
  assert.equal(new Date(n).getHours(), 8)
})

test('1h snooze is absolute across DST', () => {
  const now = new Date(2026, 2, 8, 1, 30) // 1:30 AM, 30 minutes before the jump
  assert.equal(snoozeTime('1h', now), now.getTime() + 3_600_000)
  assert.equal(new Date(snoozeTime('1h', now)).getHours(), 3)
})

test('completing a repeating reminder returns the next occurrence', () => {
  const r = { id: 'a', title: 't', at: L(2026, 11, 15, 9), repeat: 'daily', done: false, snoozedFrom: L(2026, 11, 15, 9) }
  const next = complete(r, new Date(2026, 10, 15, 9, 5))
  assert.equal(next.at, L(2026, 11, 16, 9))
  assert.equal(next.done, false)
  assert.equal('snoozedFrom' in next, false)
  assert.equal(next.id, 'a')
})

test('completing a long-overdue repeat skips missed occurrences', () => {
  const r = { id: 'a', at: L(2026, 11, 1, 9), repeat: 'daily', done: false }
  assert.equal(complete(r, new Date(2026, 10, 15, 12)).at, L(2026, 11, 16, 9))
})

test('completing a snoozed repeat schedules from the original time', () => {
  const r = { id: 'a', at: L(2026, 11, 16, 9), snoozedFrom: L(2026, 11, 15, 9), repeat: 'daily', done: false }
  // snoozed to tomorrow 9, completed Sunday evening: next is Monday 9 (after now), not Tuesday
  assert.equal(complete(r, new Date(2026, 10, 15, 20)).at, L(2026, 11, 16, 9))
})
