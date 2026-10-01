import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPlan, sanitizeBase, isReservedName, splitName } from '../src/planner.js';
import { applyRenames, buildLog, checkUndo, renameNoOverwrite } from '../src/renamer.js';

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'fr-test-')); }
function mk(dir, names) { for (const n of names) fs.writeFileSync(path.join(dir, n), n); return names.map((n) => path.join(dir, n)); }
const files = (paths, sel = true) => paths.map((p) => ({ path: p, selected: sel }));
const opts = (pattern, extra = {}) => ({ pattern, seqStart: 1, seqStep: 1, seed: 1, now: new Date(2026, 8, 21, 6, 57, 9), env: { X: 'ab' }, ...extra });

test('splitName', () => {
  assert.deepEqual(splitName('a.b.wav'), { base: 'a.b', ext: '.wav' });
  assert.deepEqual(splitName('.hidden'), { base: '.hidden', ext: '' });
  assert.deepEqual(splitName('noext'), { base: 'noext', ext: '' });
});

test('sanitize and reserved names (Windows rules)', () => {
  assert.deepEqual(sanitizeBase('a:b*c?'), { value: 'a_b_c_', changed: true });
  assert.equal(sanitizeBase('name. ').value, 'name');
  assert.equal(isReservedName('NUL.txt'), true);
  assert.equal(isReservedName('com1.wav'), true);
  assert.equal(isReservedName('COM¹.wav'), true);
  assert.equal(isReservedName('console.wav'), false);
});

test('plan: seq in list order, extension kept, unselected skipped', async () => {
  const d = tmp();
  const p = mk(d, ['b.wav', 'a.mp3', 'c.wav']);
  const rows = await buildPlan([{ path: p[0], selected: true }, { path: p[1], selected: false }, { path: p[2], selected: true }], opts('{date:yyyyMMdd}_{seq:3}'));
  assert.deepEqual(rows.map((r) => r.newName), ['20260921_001.wav', 'a.mp3', '20260921_002.wav']);
  assert.deepEqual(rows.map((r) => r.status), ['ok', 'skipped', 'ok']);
});

test('plan: duplicate inside batch, case variants and existing file', async () => {
  const d = tmp();
  const p = mk(d, ['a.wav', 'b.wav', 'keep.wav']);
  let rows = await buildPlan(files(p.slice(0, 2)), opts('same'));
  assert.deepEqual(rows.map((r) => r.reasons), [['duplicate'], ['duplicate']]);
  rows = await buildPlan(files(p.slice(0, 2)), opts('{orig}')); // both unchanged
  assert.deepEqual(rows.map((r) => r.status), ['unchanged', 'unchanged']);
  rows = await buildPlan(files([p[0]]), opts('keep'));
  assert.deepEqual(rows[0].reasons, ['exists']);
  rows = await buildPlan([{ path: p[0], selected: true }, { path: p[1], selected: true }], opts('{seq}', { seqStart: 1 }));
  assert.equal(rows[0].status, 'ok');
});

test('plan: sanitized note, empty and reserved', async () => {
  const d = tmp();
  const p = mk(d, ['a.wav']);
  assert.deepEqual((await buildPlan(files(p), opts('x:y')))[0].notes, ['sanitized']);
  assert.deepEqual((await buildPlan(files(p), opts('')))[0].reasons, ['empty']);
  assert.deepEqual((await buildPlan(files(p), opts('nul')))[0].reasons, ['reserved']);
  assert.equal((await buildPlan(files(p), opts('x:y')))[0].newName, 'x_y.wav');
});

test('plan: swap/chain inside the batch is allowed', async () => {
  const d = tmp();
  const p = mk(d, ['1.wav', '2.wav']);
  // seq starts at 2 step -1: 1.wav -> 2.wav, 2.wav -> 1.wav
  const rows = await buildPlan(files(p), opts('{seq}', { seqStart: 2, seqStep: -1 }));
  assert.deepEqual(rows.map((r) => r.status), ['ok', 'ok']);
  assert.ok(rows.every((r) => r.notes.includes('chain')));
});

test('apply: swap and cycle', async () => {
  const d = tmp();
  const [a, b, c] = mk(d, ['a.wav', 'b.wav', 'c.wav']);
  const res = await applyRenames([{ from: a, to: b }, { from: b, to: c }, { from: c, to: a }]);
  assert.ok(res.every((r) => r.ok), JSON.stringify(res));
  assert.equal(fs.readFileSync(b, 'utf8'), 'a.wav');
  assert.equal(fs.readFileSync(c, 'utf8'), 'b.wav');
  assert.equal(fs.readFileSync(a, 'utf8'), 'c.wav');
  assert.deepEqual(fs.readdirSync(d).sort(), ['a.wav', 'b.wav', 'c.wav']);
});

test('apply: chain keeps every file', async () => {
  const d = tmp();
  const [a, b] = mk(d, ['a.wav', 'b.wav']);
  const c = path.join(d, 'c.wav');
  const res = await applyRenames([{ from: a, to: b }, { from: b, to: c }]);
  assert.ok(res.every((r) => r.ok));
  assert.equal(fs.readFileSync(b, 'utf8'), 'a.wav');
  assert.equal(fs.readFileSync(c, 'utf8'), 'b.wav');
});

test('apply: never overwrites an unrelated file', async () => {
  const d = tmp();
  const [a, b] = mk(d, ['a.wav', 'b.wav']);
  const res = await applyRenames([{ from: a, to: b }]);
  assert.equal(res[0].ok, false);
  assert.equal(res[0].error, 'exists');
  assert.equal(fs.readFileSync(a, 'utf8'), 'a.wav');
  assert.equal(fs.readFileSync(b, 'utf8'), 'b.wav');
  await assert.rejects(renameNoOverwrite(a, b), { code: 'EEXIST' });
});

test('apply: case-only rename', async () => {
  const d = tmp();
  const [a] = mk(d, ['Clip.wav']);
  const to = path.join(d, 'clip.wav');
  const res = await applyRenames([{ from: a, to }]);
  assert.ok(res[0].ok, JSON.stringify(res));
  assert.deepEqual(fs.readdirSync(d), ['clip.wav']);
});

test('apply: missing source is reported', async () => {
  const d = tmp();
  const res = await applyRenames([{ from: path.join(d, 'nope.wav'), to: path.join(d, 'x.wav') }]);
  assert.equal(res[0].error, 'missing');
});

test('undo: restores names, skips files changed since', async () => {
  const d = tmp();
  const [a, b] = mk(d, ['a.wav', 'b.wav']);
  const a2 = path.join(d, 'a2.wav'), b2 = path.join(d, 'b2.wav');
  const res = await applyRenames([{ from: a, to: a2 }, { from: b, to: b2 }]);
  const log = await buildLog(res);
  fs.appendFileSync(b2, 'edited'); // changed after the rename
  const chk = await checkUndo(log);
  assert.equal(chk.runnable.length, 1);
  assert.deepEqual(chk.problems.map((p) => p.error), ['changed']);
  const back = await applyRenames(chk.runnable);
  assert.ok(back.every((r) => r.ok));
  assert.deepEqual(fs.readdirSync(d).sort(), ['a.wav', 'b2.wav']);
});

test('undo: refuses when the old name is taken by another file', async () => {
  const d = tmp();
  const [a] = mk(d, ['a.wav']);
  const a2 = path.join(d, 'a2.wav');
  const log = await buildLog(await applyRenames([{ from: a, to: a2 }]));
  fs.writeFileSync(a, 'new file');
  const chk = await checkUndo(log);
  assert.deepEqual(chk.problems.map((p) => p.error), ['occupied']);
  assert.equal(chk.runnable.length, 0);
});

test('plan: {mdate}/{mtime} come from each file', async () => {
  const d = tmp();
  const p = mk(d, ['a.wav', 'b.wav']);
  fs.utimesSync(p[0], new Date(2024, 2, 9, 8, 7, 6), new Date(2024, 2, 9, 8, 7, 6));
  fs.utimesSync(p[1], new Date(2025, 11, 31, 23, 59, 58), new Date(2025, 11, 31, 23, 59, 58));
  const rows = await buildPlan(files(p), opts('{mdate:yyyyMMdd}_{mtime:HHmmss}'));
  assert.deepEqual(rows.map((r) => r.newName), ['20240309_080706.wav', '20251231_235958.wav']);
});
