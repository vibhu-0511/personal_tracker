import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCapture, TYPES } from '../src/capture/parse.js'

// Sunday 15 Nov 2026, 12:00 local.
const NOW = new Date(2026, 10, 15, 12, 0)
const kinds = (d) => d.tokens.map((t) => t.kind)
const texts = (d) => d.tokens.map((t) => t.text)

test('expense: "450 coffee with raj"', () => {
  const d = parseCapture('450 coffee with raj', NOW)
  assert.equal(d.type, 'expense')
  assert.equal(d.inferred, true)
  assert.equal(d.amount, 450)
  assert.equal(d.category, 'coffee')
  assert.equal(d.person, 'Raj')
  assert.equal(d.date, '2026-11-15')
  assert.equal(d.title, 'coffee')
})

test('expense: tokens list what was used', () => {
  const d = parseCapture('450 coffee with raj', NOW)
  assert.deepEqual(d.tokens, [
    { kind: 'amount', text: '450' },
    { kind: 'category', text: 'coffee' },
    { kind: 'person', text: 'with raj' },
  ])
})

test('reminder: "call mom tomorrow 6pm"', () => {
  const d = parseCapture('call mom tomorrow 6pm', NOW)
  assert.equal(d.type, 'reminder')
  assert.equal(d.title, 'call mom')
  assert.equal(d.date, '2026-11-16')
  assert.equal(d.at.getHours(), 18)
  assert.equal(d.at.getMinutes(), 0)
  assert.equal(d.repeat, 'never')
  assert.deepEqual(texts(d), ['tomorrow', '6pm'])
  assert.deepEqual(kinds(d), ['date', 'time'])
})

test('task: "gym tomorrow 5pm" with forced type task', () => {
  const d = parseCapture('gym tomorrow 5pm', NOW, { type: 'task' })
  assert.equal(d.type, 'task')
  assert.equal(d.inferred, false)
  assert.equal(d.title, 'gym')
  assert.equal(d.date, '2026-11-16')
  assert.equal(d.at.getHours(), 17)
  assert.equal(d.repeat, null)
})

test('"gym tomorrow 5pm" with no forced type infers a reminder', () => {
  assert.equal(parseCapture('gym tomorrow 5pm', NOW).type, 'reminder')
})

test('solve: "solved cf 1328E"', () => {
  const d = parseCapture('solved cf 1328E', NOW)
  assert.equal(d.type, 'solve')
  assert.deepEqual(d.problem, { platform: 'codeforces', id: '1328E' })
  assert.ok(d.tokens.length >= 2)
  assert.ok(texts(d).some((t) => /1328E/.test(t)))
})

test('solve: leetcode shorthand with number', () => {
  const d = parseCapture('lc 146', NOW)
  assert.equal(d.type, 'solve')
  assert.deepEqual(d.problem, { platform: 'leetcode', id: '146' })
})

test('solve: "solved a graph problem" has no platform', () => {
  const d = parseCapture('solved a graph problem', NOW)
  assert.equal(d.type, 'solve')
  assert.deepEqual(d.problem, { platform: null, id: null })
})

test('note: plain text', () => {
  const d = parseCapture('buy a gift idea: wooden desk lamp', NOW)
  assert.equal(d.type, 'note')
  assert.equal(d.title, 'buy a gift idea: wooden desk lamp')
  assert.deepEqual(d.tokens, [])
  assert.equal(d.amount, null)
  assert.equal(d.date, null)
})

test('note: empty and whitespace input', () => {
  assert.equal(parseCapture('', NOW).type, 'note')
  assert.equal(parseCapture('   ', NOW).title, '')
  assert.equal(parseCapture(undefined, NOW).type, 'note')
})

test('note: forced note keeps the sentence untouched', () => {
  const d = parseCapture('call mom tomorrow 6pm', NOW, { type: 'note' })
  assert.equal(d.type, 'note')
  assert.equal(d.title, 'call mom tomorrow 6pm')
  assert.equal(d.date, null)
  assert.equal(d.at, null)
  assert.deepEqual(d.tokens, [])
})

test('category: no keyword means no category', () => {
  const d = parseCapture('450 raj', NOW)
  assert.equal(d.type, 'expense')
  assert.equal(d.amount, 450)
  assert.equal(d.category, null)
})

test('category: unknown word is never guessed', () => {
  assert.equal(parseCapture('300 gadget', NOW).category, null)
})

test('category: a range of keywords', () => {
  assert.equal(parseCapture('250 lunch', NOW).category, 'food')
  assert.equal(parseCapture('180 uber', NOW).category, 'transport')
  assert.equal(parseCapture('900 groceries', NOW).category, 'groceries')
  assert.equal(parseCapture('199 netflix', NOW).category, 'subscriptions')
  assert.equal(parseCapture('5000 flight', NOW).category, 'travel')
  assert.equal(parseCapture('350 doctor', NOW).category, 'health')
  assert.equal(parseCapture('1200 electricity', NOW).category, 'bills')
})

test('category: keyword must be a whole word', () => {
  assert.equal(parseCapture('100 busy', NOW).category, null)
})

test('amount: rupee symbol', () => {
  const d = parseCapture('₹1,200 dinner', NOW)
  assert.equal(d.type, 'expense')
  assert.equal(d.amount, 1200)
  assert.equal(d.category, 'food')
})

test('amount: rs prefix and suffix', () => {
  assert.equal(parseCapture('rs 80 chai', NOW).amount, 80)
  assert.equal(parseCapture('chai 80 rs', NOW).amount, 80)
})

test('amount: trailing number', () => {
  const d = parseCapture('coffee 120', NOW)
  assert.equal(d.type, 'expense')
  assert.equal(d.amount, 120)
  assert.equal(d.category, 'coffee')
})

test('amount: decimals and k suffix', () => {
  assert.equal(parseCapture('99.50 snack', NOW).amount, 99.5)
  assert.equal(parseCapture('2k shoes', NOW).amount, 2000)
})

test('amount: over the cap is not an amount', () => {
  const d = parseCapture('99999999999 coffee', NOW)
  assert.equal(d.amount, null)
  assert.equal(d.type, 'note')
})

test('amount: a clock time is not an amount', () => {
  const d = parseCapture('call mom 6pm', NOW)
  assert.equal(d.type, 'reminder')
  assert.equal(d.amount, null)
})

test('expense: date word moves the date', () => {
  const d = parseCapture('450 coffee tomorrow', NOW)
  assert.equal(d.type, 'expense')
  assert.equal(d.date, '2026-11-16')
  assert.equal(d.title, 'coffee')
  assert.deepEqual(kinds(d), ['amount', 'category', 'date'])
})

test('expense: person names are capitalised, "with" required', () => {
  assert.equal(parseCapture('lunch 300 with priya', NOW).person, 'Priya')
  assert.equal(parseCapture('lunch 300', NOW).person, null)
})

test('forced expense without an amount leaves amount empty', () => {
  const d = parseCapture('coffee with raj', NOW, { type: 'expense' })
  assert.equal(d.type, 'expense')
  assert.equal(d.amount, null)
  assert.equal(d.category, 'coffee')
  assert.equal(d.person, 'Raj')
})

test('forced type overrides inference (expense text forced to reminder)', () => {
  const d = parseCapture('450 coffee tomorrow 6pm', NOW, { type: 'reminder' })
  assert.equal(d.type, 'reminder')
  assert.equal(d.amount, null)
  assert.equal(d.date, '2026-11-16')
})

test('forced type overrides inference (reminder text forced to note)', () => {
  assert.equal(parseCapture('remind me to stretch', NOW, { type: 'note' }).type, 'note')
})

test('invalid forced type is ignored', () => {
  const d = parseCapture('450 coffee', NOW, { type: 'bogus' })
  assert.equal(d.type, 'expense')
  assert.equal(d.inferred, true)
})

test('reminder: "remind me to" prefix is stripped', () => {
  const d = parseCapture('remind me to pay rent in 30m', NOW)
  assert.equal(d.type, 'reminder')
  assert.equal(d.title, 'pay rent')
  assert.equal(d.at.getTime(), NOW.getTime() + 30 * 60000)
  assert.ok(kinds(d).includes('remind'))
})

test('reminder: "remind me" wins over an amount', () => {
  const d = parseCapture('remind me to pay 500 rent', NOW)
  assert.equal(d.type, 'reminder')
  assert.equal(d.amount, null)
})

test('reminder: repeat daily', () => {
  const d = parseCapture('take vitamins daily 9am', NOW)
  assert.equal(d.type, 'reminder')
  assert.equal(d.repeat, 'daily')
  assert.equal(d.title, 'take vitamins')
  assert.equal(d.at.getHours(), 9)
  assert.ok(kinds(d).includes('repeat'))
})

test('reminder: every monday repeats weekly on that weekday', () => {
  const d = parseCapture('standup every monday 9:30am', NOW)
  assert.equal(d.repeat, 'weekly')
  assert.equal(d.date, '2026-11-16')
  assert.equal(d.at.getMinutes(), 30)
  assert.equal(d.title, 'standup')
})

test('reminder: monthly repeat', () => {
  assert.equal(parseCapture('pay rent every month', NOW).repeat, 'monthly')
})

test('reminder: weekday name resolves to a date', () => {
  const d = parseCapture('dentist wednesday 4pm', NOW)
  assert.equal(d.type, 'reminder')
  assert.equal(d.date, '2026-11-18')
})

test('task: forced task without a date has null date', () => {
  const d = parseCapture('write report', NOW, { type: 'task' })
  assert.equal(d.title, 'write report')
  assert.equal(d.date, null)
  assert.equal(d.at, null)
})

test('mood: "feeling great"', () => {
  const d = parseCapture('feeling great', NOW)
  assert.equal(d.type, 'mood')
  assert.equal(d.mood, 100)
  assert.deepEqual(texts(d), ['feeling', 'great'])
})

test('mood: no mood word leaves mood empty', () => {
  const d = parseCapture('my mood today', NOW)
  assert.equal(d.type, 'mood')
  assert.equal(d.mood, null)
})

test('habit: "habit read 20 pages" and forced habit', () => {
  const d = parseCapture('habit read 20 pages', NOW)
  assert.equal(d.type, 'habit')
  assert.equal(d.title, 'read 20 pages')
  const f = parseCapture('meditate', NOW, { type: 'habit' })
  assert.equal(f.type, 'habit')
  assert.equal(f.title, 'meditate')
})

test('forced solve extracts the problem even without a verb', () => {
  const d = parseCapture('codeforces 1000A', NOW, { type: 'solve' })
  assert.deepEqual(d.problem, { platform: 'codeforces', id: '1000A' })
})

test('draft shape: every type returns the same keys', () => {
  const keys = Object.keys(parseCapture('x', NOW)).sort()
  for (const type of TYPES) {
    assert.deepEqual(Object.keys(parseCapture('x', NOW, { type })).sort(), keys)
  }
})

test('tokens are always {kind, text} and appear in the source', () => {
  for (const s of ['450 coffee with raj', 'call mom tomorrow 6pm', 'solved cf 1328E', 'feeling good', 'pay rent monthly']) {
    const d = parseCapture(s, NOW)
    for (const t of d.tokens) {
      assert.equal(typeof t.kind, 'string')
      assert.ok(s.toLowerCase().includes(t.text.toLowerCase()), `${t.text} in ${s}`)
    }
  }
})
