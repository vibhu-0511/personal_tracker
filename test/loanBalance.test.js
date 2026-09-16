import test from 'node:test'
import assert from 'node:assert/strict'
import { computeLoanBalances } from '../src/money/logic.js'

const entry = (person, amount, direction) => ({ id: Math.random(), person, amount, direction })

test('lending increases their balance (they owe you)', () => {
  const balances = computeLoanBalances([entry('Raj', 500, 'lent')])
  assert.equal(balances.Raj, 500)
})

test('them repaying decreases their balance', () => {
  const balances = computeLoanBalances([entry('Raj', 500, 'lent'), entry('Raj', 200, 'theyRepaid')])
  assert.equal(balances.Raj, 300)
})

test('borrowing makes the balance negative (you owe them)', () => {
  const balances = computeLoanBalances([entry('Priya', 300, 'borrowed')])
  assert.equal(balances.Priya, -300)
})

test('you repaying moves the balance back toward zero', () => {
  const balances = computeLoanBalances([entry('Priya', 300, 'borrowed'), entry('Priya', 300, 'iRepaid')])
  assert.equal(balances.Priya, 0)
})

test('tracks balances per person independently', () => {
  const balances = computeLoanBalances([entry('Raj', 500, 'lent'), entry('Priya', 300, 'borrowed')])
  assert.equal(balances.Raj, 500)
  assert.equal(balances.Priya, -300)
})

test('empty ledger gives no balances', () => {
  assert.deepEqual(computeLoanBalances([]), {})
})

test('person names are merged case/whitespace-insensitively, keeping first-seen casing', () => {
  const balances = computeLoanBalances([
    entry('Raj', 500, 'lent'),
    entry('raj ', 200, 'theyRepaid'),
    entry(' RAJ', 100, 'lent'),
  ])
  assert.deepEqual(Object.keys(balances), ['Raj'])
  assert.equal(balances.Raj, 400)
})
