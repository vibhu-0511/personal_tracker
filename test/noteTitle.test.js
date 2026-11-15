import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveNoteTitle } from '../src/life/noteTitle.js'

test('title is the first non-empty line, trimmed', () => {
  assert.equal(deriveNoteTitle('\n  \n  Hello world  \nrest').title, 'Hello world')
})

test('title is capped at 80 chars', () => {
  const { title } = deriveNoteTitle('x'.repeat(200))
  assert.equal(title.length, 80)
})

test('excerpt is the rest collapsed to one line', () => {
  const { title, excerpt } = deriveNoteTitle('Title\n\nline  one\r\n  line two\n\n')
  assert.equal(title, 'Title')
  assert.equal(excerpt, 'line one line two')
})

test('a one-line note has an empty excerpt', () => {
  assert.equal(deriveNoteTitle('Just a title').excerpt, '')
})

test('empty, blank and nullish input give empty title and excerpt', () => {
  for (const v of ['', '  \n ', null, undefined]) {
    assert.deepEqual(deriveNoteTitle(v), { title: '', excerpt: '' })
  }
})
