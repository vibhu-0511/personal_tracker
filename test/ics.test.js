import test from 'node:test'
import assert from 'node:assert/strict'
import { toICS, validateICSInput } from '../api/_lib/ics.js'

test('toICS produces a VCALENDAR with the event title, start time and an alarm', () => {
  const out = toICS({ title: 'Call mom', start: new Date('2026-09-15T17:00:00Z') })
  assert.match(out, /BEGIN:VCALENDAR/)
  assert.match(out, /BEGIN:VEVENT/)
  assert.match(out, /SUMMARY:Call mom/)
  assert.match(out, /DTSTART:20260915T170000Z/)
  assert.match(out, /BEGIN:VALARM/)
  assert.match(out, /END:VCALENDAR/)
})

test('toICS escapes commas, semicolons and backslashes in the title', () => {
  const out = toICS({ title: 'Buy: milk, eggs; bread\\stuff', start: new Date('2026-09-15T17:00:00Z') })
  assert.match(out, /SUMMARY:Buy: milk\\, eggs\\; bread\\\\stuff/)
})

test('validateICSInput accepts a title and a valid ISO start date', () => {
  const out = validateICSInput({ title: 'Gym', start: '2026-09-15T17:00:00+05:30' })
  assert.equal(out.error, null)
  assert.equal(out.title, 'Gym')
  assert.ok(out.start instanceof Date)
})

test('validateICSInput rejects a missing title', () => {
  const out = validateICSInput({ title: '', start: '2026-09-15T17:00:00Z' })
  assert.equal(out.error, 'title is required')
})

test('validateICSInput rejects a title over 200 characters', () => {
  const out = validateICSInput({ title: 'x'.repeat(201), start: '2026-09-15T17:00:00Z' })
  assert.equal(out.error, 'title is too long')
})

test('validateICSInput rejects an unparseable start date', () => {
  const out = validateICSInput({ title: 'Gym', start: 'not-a-date' })
  assert.equal(out.error, 'start is not a valid date')
})

test('validateICSInput rejects a missing start date', () => {
  const out = validateICSInput({ title: 'Gym' })
  assert.equal(out.error, 'start is not a valid date')
})
