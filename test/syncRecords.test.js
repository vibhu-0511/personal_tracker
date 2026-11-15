import test from 'node:test'
import assert from 'node:assert/strict'
import { serialize } from '../src/sync/hlc.js'
import {
  HLC_FORMAT_RE, isHlcFormat, hlcPhysicalMs, isDrifted, isTombstone, isLive,
  tombstone, shouldApply, merge, DEFAULT_MAX_DRIFT_MS,
} from '../src/sync/records.js'

const T0 = 1_700_000_000_000
const HOUR = 60 * 60 * 1000

const stamp = (ms, counter = 0, node = 'dev-a') => serialize({ ms, counter, node })
const rec = (hlc, body = { t: 'Gym 6pm' }, extra = {}) => ({
  collection: 'tasks', id: '2', body, pos: 1, hlc, deviceId: 'dev-a', deletedAt: null, ...extra,
})

test('hlc string is <15-digit ms>-<4-hex counter>-<node> (records_hlc_chk)', () => {
  const s = stamp(T0, 255, 'phone01')
  assert.equal(s, '001700000000000-00ff-phone01')
  assert.match(s, /^[0-9]{15}-[0-9a-f]{4}-.{1,32}$/)
  assert.equal(HLC_FORMAT_RE.source, '^[0-9]{15}-[0-9a-f]{4}-.{1,32}$')
  assert.equal(s.length, 15 + 1 + 4 + 1 + 'phone01'.length)
  assert.equal(isHlcFormat(s), true)
  for (const bad of [
    '1700000000000-0000-a', // 13-digit ms
    '001700000000000-00FF-a', // uppercase hex
    '001700000000000-0-a', // short counter
    '001700000000000-0000-', // empty node
    `001700000000000-0000-${'x'.repeat(33)}`, // node too long
    '', null, undefined, 42,
  ]) assert.equal(isHlcFormat(bad), false, String(bad))
})

test('physical part equals substr(hlc,1,15)', () => {
  assert.equal(hlcPhysicalMs(stamp(T0, 9, 'z')), T0)
  assert.equal(hlcPhysicalMs('000000000000001-0000-a'), 1)
  assert.throws(() => hlcPhysicalMs('nope'), TypeError)
})

test('higher hlc wins: by ms, then counter, then node', () => {
  const local = rec(stamp(T0, 0, 'a'))
  assert.equal(shouldApply(local, rec(stamp(T0 + 1, 0, 'a'))), true)
  assert.equal(shouldApply(local, rec(stamp(T0, 1, 'a'))), true)
  assert.equal(shouldApply(local, rec(stamp(T0, 0, 'b'))), true)
  assert.equal(shouldApply(rec(stamp(T0 + 1)), rec(stamp(T0))), false)
  assert.equal(shouldApply(rec(stamp(T0, 1)), rec(stamp(T0, 0))), false)
  assert.equal(shouldApply(rec(stamp(T0, 0, 'b')), rec(stamp(T0, 0, 'a'))), false)
  // counter compares numerically (0x0010 > 0x0009), not by arrival order
  assert.equal(shouldApply(rec(stamp(T0, 9)), rec(stamp(T0, 16))), true)
})

test('equal hlc is a no-op, so an own echo changes nothing', () => {
  const h = stamp(T0, 3)
  const local = rec(h, { t: 'mine' })
  const echo = rec(h, { t: 'different body, same stamp' })
  assert.equal(shouldApply(local, echo), false)
  assert.equal(merge(local, echo), local)
})

test('no local record: apply', () => {
  assert.equal(shouldApply(undefined, rec(stamp(T0))), true)
  assert.equal(shouldApply(null, tombstone(rec(stamp(T0)), stamp(T0 + 1))), true)
})

test('tombstone shape matches records_tombstone_chk', () => {
  const t = tombstone(rec(stamp(T0)), stamp(T0 + 5, 0, 'dev-b'), 'dev-b')
  assert.equal(t.body, null)
  assert.equal(t.deletedAt, new Date(T0 + 5).toISOString())
  assert.equal(t.deviceId, 'dev-b')
  assert.equal(isTombstone(t), true)
  assert.equal(isLive(t), false)
  assert.equal(isLive(rec(stamp(T0))), true)
  assert.equal(isLive(null), false)
  assert.throws(() => tombstone(rec(stamp(T0)), 'bad'), TypeError)
})

test('Lab 1 per record + tombstone: delete newer than edit -> record stays deleted', () => {
  const edit = rec(stamp(T0 + 10, 0, 'laptop'), { t: 'Gym 7pm' })
  const del = tombstone(rec(stamp(T0)), stamp(T0 + 20, 0, 'phone'))
  assert.equal(shouldApply(edit, del), true)
  assert.equal(isLive(merge(edit, del)), false)
})

test('Lab 1 per record + tombstone: edit newer than delete -> record survives', () => {
  const edit = rec(stamp(T0 + 20, 0, 'laptop'), { t: 'Gym 7pm' })
  const del = tombstone(rec(stamp(T0)), stamp(T0 + 10, 0, 'phone'))
  assert.equal(shouldApply(del, edit), true)
  assert.equal(merge(del, edit).body.t, 'Gym 7pm')
  // and the other arrival order: the stale tombstone is refused by the edit
  assert.equal(shouldApply(edit, del), false)
  assert.equal(merge(edit, del), edit)
})

test('Lab 1 per record + tombstone: an older edit arriving late does not resurrect (no zombie)', () => {
  const del = tombstone(rec(stamp(T0)), stamp(T0 + 20, 0, 'phone'))
  const lateEdit = rec(stamp(T0 + 10, 0, 'laptop'), { t: 'Gym 7pm' })
  assert.equal(shouldApply(del, lateEdit), false)
  assert.equal(isLive(merge(del, lateEdit)), false)
})

test('remote hlc more than 24h ahead of wall time is rejected', () => {
  const wall = T0
  const local = rec(stamp(T0 - HOUR))
  const ok = rec(stamp(T0 + DEFAULT_MAX_DRIFT_MS, 0, 'a')) // exactly 24h: allowed
  const bad = rec(stamp(T0 + DEFAULT_MAX_DRIFT_MS + 1, 0, 'a'))
  assert.equal(DEFAULT_MAX_DRIFT_MS, 24 * HOUR)
  assert.equal(shouldApply(local, ok, { wallMs: wall }), true)
  assert.equal(shouldApply(local, bad, { wallMs: wall }), false)
  assert.equal(shouldApply(null, bad, { wallMs: wall }), false)
  assert.equal(merge(local, bad, { wallMs: wall }), local)
  // a rejected tombstone is rejected too
  assert.equal(shouldApply(local, tombstone(local, stamp(T0 + 25 * HOUR)), { wallMs: wall }), false)
  // without wallMs the check is skipped; maxDriftMs is overridable
  assert.equal(shouldApply(local, bad), true)
  assert.equal(shouldApply(local, bad, { wallMs: wall, maxDriftMs: Infinity }), true)
  assert.equal(isDrifted(bad.hlc, wall), true)
  assert.equal(isDrifted(ok.hlc, wall), false)
})

test('malformed incoming stamp is rejected, never applied', () => {
  assert.equal(shouldApply(null, rec('garbage')), false)
  assert.equal(shouldApply(null, rec(undefined)), false)
  assert.equal(shouldApply(null, null), false)
  assert.equal(isDrifted('garbage', T0), true)
})
