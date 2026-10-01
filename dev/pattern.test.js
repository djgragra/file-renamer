import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemplate, formatDate, makeRng, unknownPlaceholders } from '../src/pattern.js';

const now = new Date(2026, 8, 21, 6, 57, 9, 45); // 2026-09-21 06:57:09.045 local

test('date and time defaults', () => {
  assert.equal(resolveTemplate('{date}', { now }), '2026-09-21');
  assert.equal(resolveTemplate('{time}', { now }), '065709');
});

test('date and time formats', () => {
  assert.equal(resolveTemplate('{date:yyyyMMdd}', { now }), '20260921');
  assert.equal(resolveTemplate('{date:dd-MM-yy}', { now }), '21-09-26');
  assert.equal(resolveTemplate('{time:HHmm}', { now }), '0657');
  assert.equal(resolveTemplate('{time:hh.mm a}', { now }), '06.57 AM');
  assert.equal(resolveTemplate('{time:HH.mm.ss.SSS}', { now }), '06.57.09.045');
  assert.equal(formatDate(now, "yyyy-MM-dd'T'HH:mm"), '2026-09-21T06:57');
});

test('offsets', () => {
  assert.equal(resolveTemplate('{date+1h:H}', { now }), '7');
  assert.equal(resolveTemplate('{date-1d:yyyyMMdd}', { now }), '20260920');
  assert.equal(resolveTemplate('{time+90m:HHmm}', { now }), '0827');
  assert.equal(resolveTemplate('{date+10d:yyyyMMdd}', { now }), '20261001');
});

test('seq', () => {
  assert.equal(resolveTemplate('{seq}', { seq: 7 }), '7');
  assert.equal(resolveTemplate('{seq:4}', { seq: 7 }), '0007');
  assert.equal(resolveTemplate('{seq:2}', { seq: 123 }), '123');
});

test('rand is deterministic with a seeded generator', () => {
  const a = resolveTemplate('{rand}-{rand:10}', { rng: makeRng(5) });
  const b = resolveTemplate('{rand}-{rand:10}', { rng: makeRng(5) });
  assert.equal(a, b);
  assert.match(a, /^[a-z0-9]{6}-[a-z0-9]{10}$/);
  assert.notEqual(a, resolveTemplate('{rand}-{rand:10}', { rng: makeRng(6) }));
});

test('env and orig', () => {
  assert.equal(resolveTemplate('{env:STATION}_{orig}', { env: { STATION: 'RTL' }, orig: 'clip' }), 'RTL_clip');
  assert.equal(resolveTemplate('{env:MISSING}x', { env: {} }), 'x');
  assert.equal(resolveTemplate('{env:toString}x', { env: {} }), 'x');
});

test('unknown placeholders stay as typed and are reported', () => {
  assert.equal(resolveTemplate('{foo}_{date:yyyy}', { now }), '{foo}_2026');
  assert.deepEqual(unknownPlaceholders('{foo}_{seq}_{bar:1}'), ['{foo}', '{bar:1}']);
});

test('mdate and mtime use the file time, with the same formats and shifts', () => {
  const m = new Date(2025, 0, 5, 23, 30, 0);
  assert.equal(resolveTemplate('{mdate}_{mtime}', { now, mtime: m }), '2025-01-05_233000');
  assert.equal(resolveTemplate('{mdate:yyyyMMdd}', { now, mtime: m }), '20250105');
  assert.equal(resolveTemplate('{mtime+1h:HH}', { now, mtime: m }), '00');
  assert.equal(resolveTemplate('{mdate+1d:dd}', { now, mtime: m }), '06');
  assert.equal(resolveTemplate('{mdate:yyyy}', { now }), '2026'); // no file time: falls back to now
});
