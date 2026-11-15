import test from 'node:test'
import assert from 'node:assert/strict'
import { toICS } from '../api/_lib/ics.js'
import { buildReminderICS, reminderICSDataUrl, downloadReminderICS } from '../src/life/icsClient.js'

// UID and DTSTAMP are per-call (random / now); everything else must match the server output.
const stable = (ics) => ics.split('\r\n').filter((l) => !/^(UID|DTSTAMP):/.test(l))
const CRLF = String.fromCharCode(13, 10)
const BS = String.fromCharCode(92)
const AT = Date.parse('2026-09-15T17:00:00Z')

test('client output matches the server generator for a fixture', () => {
  const title = 'Buy: milk, eggs; bread\\stuff'
  const client = buildReminderICS({ title, at: AT })
  const server = toICS({ title, start: new Date(AT) })
  assert.deepEqual(stable(client), stable(server))
  assert.ok(client.split(CRLF).includes('SUMMARY:Buy: milk' + BS + ', eggs' + BS + '; bread' + BS + BS + 'stuff'))
  assert.match(client, /DTSTART:20260915T170000Z\r\n/)
  assert.ok(client.startsWith('BEGIN:VCALENDAR\r\n') && client.endsWith('END:VCALENDAR'))
})

test('a title containing CRLF cannot inject ICS properties', () => {
  const ics = buildReminderICS({ title: 'Hi\r\nATTENDEE:mailto:evil@x.test', at: AT })
  assert.ok(!ics.split('\r\n').some((l) => l.startsWith('ATTENDEE')))
  assert.match(ics, /SUMMARY:Hi ATTENDEE:mailto:evil@x\.test\r\n/)
})

test('a URL-decoded %0D%0A title cannot inject properties either', () => {
  const title = decodeURIComponent('Call%0D%0AATTENDEE:mailto:evil@x.test%0D%0ABEGIN:VALARM')
  const ics = buildReminderICS({ title, at: AT })
  const lines = ics.split('\r\n')
  assert.ok(!lines.some((l) => l.startsWith('ATTENDEE')))
  assert.equal(lines.filter((l) => l === 'BEGIN:VALARM').length, 1)
  assert.equal(lines.filter((l) => l.startsWith('SUMMARY:')).length, 1)
})

test('NUL, other controls and Unicode line breaks become spaces', () => {
  const ch = (...codes) => String.fromCharCode(...codes)
  const title = ['a', 0, 'b', 0x85, 'c', 0x2028, 'd', 0x2029, 'e', 0x7f, 'f', 9, 'g']
    .map((x) => (typeof x === 'string' ? x : ch(x))).join('')
  const ics = buildReminderICS({ title, at: AT })
  assert.match(ics, /SUMMARY:a b c d e f g\r\n/)
  const body = ics.replace(/\r\n/g, '')
  for (const ch of body) {
    const c = ch.charCodeAt(0)
    assert.ok(c >= 0x20 && !(c >= 0x7f && c <= 0x9f) && c !== 0x2028 && c !== 0x2029, `control char ${c}`)
  }
})

test('an over-long title is truncated and unusable input returns null', () => {
  const ics = buildReminderICS({ title: 'x'.repeat(500), at: AT })
  assert.match(ics, new RegExp(`SUMMARY:x{200}\r\n`))
  assert.equal(buildReminderICS({ title: '   ', at: AT }), null)
  assert.equal(buildReminderICS({ title: 'ok', at: 'nope' }), null)
  assert.equal(buildReminderICS({ title: 'ok' }), null)
  assert.equal(buildReminderICS(null), null)
})

test('the data URL round-trips to the same ICS text', () => {
  const url = reminderICSDataUrl({ title: 'Gym, now', at: AT })
  assert.ok(url.startsWith('data:text/calendar;charset=utf-8,'))
  const body = decodeURIComponent(url.slice(url.indexOf(',') + 1))
  assert.deepEqual(stable(body), stable(toICS({ title: 'Gym, now', start: new Date(AT) })))
  assert.equal(reminderICSDataUrl({ title: '', at: AT }), '#')
})

test('downloadReminderICS makes a local blob download and never uses the network', async (t) => {
  const origFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('network used') }
  t.after(() => { globalThis.fetch = origFetch })
  const clicked = []
  const doc = {
    body: { appendChild() {} },
    createElement: () => ({ style: {}, click() { clicked.push(this) }, remove() {} }),
  }
  assert.equal(downloadReminderICS({ title: 'Call mom', at: AT }, doc), true)
  assert.equal(clicked.length, 1)
  assert.equal(clicked[0].download, 'reminder.ics')
  assert.match(clicked[0].href, /^blob:/)
  assert.equal(downloadReminderICS({ title: '', at: AT }, doc), false)
  assert.equal(clicked.length, 1)
})
