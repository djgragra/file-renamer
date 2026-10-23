// 26.10.4: extension, CSV log, undo history (several batches), and the files they touch.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sanitizeExt, applyExt, cleanExtValue, hasTransforms } from '../src/text-tools.js';
import { buildPlan } from '../src/planner.js';
import { applyRenames, buildLog, checkUndo } from '../src/renamer.js';
import { sanitizeSettings, sanitizePreset, createStore } from '../src/settings.js';
import { buildExport, prepareImport } from '../src/backup.js';
import { batchCsv, csvCell, csvFileName, CSV_HEADER } from '../src/csv.js';
import { createUndoHistory, trimHistory, MAX_BATCHES } from '../src/undo-history.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fr-b-'));
const mk = (dir, names) => names.map((n) => { fs.writeFileSync(path.join(dir, n), n); return path.join(dir, n); });
const opts = (pattern, extra = {}) => ({ pattern, seqStart: 1, seqStep: 1, seed: 1, now: new Date(2026, 9, 23, 8, 0, 0), env: {}, ...extra });
const sel = (paths) => paths.map((p) => ({ path: p, selected: true }));

// ---- extension ------------------------------------------------------------------------------------

test('extension: the options are cleaned, "replace" without a value falls back to "keep"', () => {
  assert.deepEqual(sanitizeExt(undefined), { mode: 'keep', value: '' });
  assert.deepEqual(sanitizeExt({ mode: 'upper' }), { mode: 'upper', value: '' });
  assert.deepEqual(sanitizeExt({ mode: 'set', value: '.WAV ' }), { mode: 'set', value: 'WAV' });
  assert.deepEqual(sanitizeExt({ mode: 'set', value: '' }), { mode: 'keep', value: '' });
  assert.deepEqual(sanitizeExt({ mode: 'bogus', value: 'x' }), { mode: 'keep', value: 'x' });
  assert.equal(cleanExtValue('a/b\\c:d*e?"f<g>h|i j'), 'abcdefghij');
  assert.equal(cleanExtValue('x'.repeat(40)).length, 16);
  assert.equal(cleanExtValue('..mp3'), 'mp3');
  assert.equal(hasTransforms(undefined, undefined, { mode: 'lower' }), true);
  assert.equal(hasTransforms(undefined, undefined, undefined), false);
});

test('extension: lowercase, UPPERCASE, replace; a name without extension changes only with "replace"', () => {
  assert.equal(applyExt('.WAV', { mode: 'keep' }), '.WAV');
  assert.equal(applyExt('.WAV', { mode: 'lower' }), '.wav');
  assert.equal(applyExt('.wav', { mode: 'upper' }), '.WAV');
  assert.equal(applyExt('.wav', { mode: 'set', value: 'mp3' }), '.mp3');
  assert.equal(applyExt('', { mode: 'lower' }), '');
  assert.equal(applyExt('', { mode: 'set', value: 'wav' }), '.wav');
});

test('extension in the plan: the name is built first, then the extension; the safety rules see the final name', async () => {
  const d = tmp();
  const p = mk(d, ['Clip.WAV', 'Take.Mp3', 'noext']);
  let rows = await buildPlan(sel(p), opts('{orig}', { ext: { mode: 'lower' } }));
  assert.deepEqual(rows.map((r) => r.newName), ['Clip.wav', 'Take.mp3', 'noext']);
  assert.deepEqual(rows.map((r) => r.status), ['ok', 'ok', 'unchanged']);
  rows = await buildPlan(sel(p), opts('{orig}_{seq}', { ext: { mode: 'set', value: 'bwf' } }));
  assert.deepEqual(rows.map((r) => r.newName), ['Clip_1.bwf', 'Take_2.bwf', 'noext_3.bwf']);
  rows = await buildPlan(sel(p.slice(0, 1)), opts('{orig}', { ext: { mode: 'upper' } }));
  assert.equal(rows[0].status, 'unchanged');
});

test('extension: two files that differ only by the extension become the same name and are blocked; an existing file is not replaced', async () => {
  const d = tmp();
  const p = mk(d, ['a.wav', 'a.mp3', 'b.wav', 'b.mp3.keep', 'c.mp3']);
  let rows = await buildPlan(sel(p.slice(0, 2)), opts('{orig}', { ext: { mode: 'set', value: 'wav' } }));
  assert.deepEqual(rows.map((r) => [r.status, r.reasons.join()]), [['error', 'duplicate'], ['error', 'duplicate']]);
  fs.writeFileSync(path.join(d, 'c.wav'), 'taken');
  rows = await buildPlan(sel(p.slice(4)), opts('{orig}', { ext: { mode: 'set', value: 'wav' } }));
  assert.deepEqual([rows[0].status, rows[0].reasons.join()], ['error', 'exists']);
});

test('extension on disk: a case-only change of the extension is applied and undone', async () => {
  const d = tmp();
  const [f] = mk(d, ['Clip.WAV']);
  const [row] = await buildPlan(sel([f]), opts('{orig}', { ext: { mode: 'lower' } }));
  assert.equal(row.newName, 'Clip.wav');
  const res = await applyRenames([{ from: f, to: path.join(d, row.newName) }]);
  assert.equal(res[0].ok, true);
  assert.deepEqual(fs.readdirSync(d), ['Clip.wav']);
});

test('extension is kept in presets, in settings and in the backup; old files without it get the default', () => {
  const preset = sanitizePreset({ name: 'x', pattern: '{orig}', ext: { mode: 'set', value: '.mp3' } });
  assert.deepEqual(preset.ext, { mode: 'set', value: 'mp3' });
  assert.deepEqual(sanitizePreset({ name: 'old', pattern: '{orig}' }).ext, { mode: 'keep', value: '' });
  const s = sanitizeSettings({ ext: { mode: 'lower' }, presets: [preset] });
  assert.equal(s.ext.mode, 'lower');
  assert.deepEqual(sanitizeSettings({}).ext, { mode: 'keep', value: '' });
  const file = buildExport(s);
  assert.equal(file.settings.ext.mode, 'lower');
  assert.deepEqual(file.presets[0].ext, { mode: 'set', value: 'mp3' });
  const back = prepareImport(JSON.stringify(file), sanitizeSettings({}));
  assert.equal(back.ok, true);
  assert.equal(back.settings.ext.mode, 'lower');
  assert.deepEqual(back.settings.presets[0].ext, { mode: 'set', value: 'mp3' });
  const dir = tmp();
  const store = createStore({ file: path.join(dir, 's.json') });
  store.update({ ext: { mode: 'upper' } });
  assert.equal(createStore({ file: path.join(dir, 's.json') }).get().ext.mode, 'upper');
});

// ---- CSV log --------------------------------------------------------------------------------------

test('CSV: header, one line per file, renamed and failed, folder, time; BOM and CRLF for spreadsheets', () => {
  const csv = batchCsv([
    { from: '/music/in/old one.wav', to: '/music/in/new, one.wav', ok: true },
    { from: '/music/in/bad.wav', to: '/music/in/x.wav', ok: false, error: 'exists' }
  ], '2026-10-23T08:00:00.000Z');
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], CSV_HEADER.join(','));
  assert.equal(lines[1], 'old one.wav,"new, one.wav",/music/in,renamed,,2026-10-23T08:00:00.000Z');
  assert.equal(lines[2], 'bad.wav,x.wav,/music/in,failed,exists,2026-10-23T08:00:00.000Z');
  assert.equal(lines[3], '');
});

test('CSV: quotes are doubled, new lines kept inside quotes, and a cell a spreadsheet would read as a formula gets a quote', () => {
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('a\nb'), '"a\nb"');
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('-001.wav'), "'-001.wav");
  assert.equal(csvCell('+x'), "'+x");
  assert.equal(csvCell('@sum'), "'@sum");
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell(null), '');
  assert.equal(csvFileName(new Date(2026, 9, 23, 8, 5, 9)), 'file-renamer-log-2026-10-23-080509.csv');
  const csv = batchCsv([{ from: '/a/=cmd.wav', to: '/a/-x.wav', ok: true }], '');
  assert.match(csv, /'=cmd\.wav,'-x\.wav,/);
});

// ---- undo history ---------------------------------------------------------------------------------

const entry = (i) => ({ from: `/a/${i}.wav`, to: `/a/n${i}.wav`, size: 1, mtimeMs: 2 });
const batch = (n, createdAt = '2026-10-23T08:00:00.000Z') => ({ createdAt, entries: Array.from({ length: n }, (_, i) => entry(i)) });

test('undo history: batches pile up, newest on top, the oldest go when there are more than 10', async () => {
  const dir = tmp();
  const h = createUndoHistory({ file: path.join(dir, 'undo-history.json') });
  assert.equal(await h.info(), null);
  for (let i = 0; i < MAX_BATCHES + 3; i++) await h.push(batch(2, `2026-10-23T08:00:${String(i).padStart(2, '0')}.000Z`));
  const info = await h.info();
  assert.equal(info.batches, MAX_BATCHES);
  assert.equal(info.createdAt, '2026-10-23T08:00:12.000Z');
  assert.equal((await h.read())[0].createdAt, '2026-10-23T08:00:03.000Z');
});

test('undo history: a limit on the entries drops the oldest batches but always keeps the newest', () => {
  const b = [batch(60), batch(60), batch(60)];
  assert.equal(trimHistory(b, { maxBatches: 10, maxEntries: 100 }).length, 1);
  assert.equal(trimHistory([batch(500)], { maxBatches: 10, maxEntries: 100 }).length, 1);
  assert.equal(trimHistory(b, { maxBatches: 10, maxEntries: 150 }).length, 2);
});

test('undo history: what was restored leaves the batch, an empty batch goes, "forget" drops the newest without touching files', async () => {
  const dir = tmp();
  const h = createUndoHistory({ file: path.join(dir, 'h.json') });
  await h.push(batch(1, 'first'));
  await h.push(batch(3, 'second'));
  await h.settleTop(new Set(['/a/n0.wav', '/a/n1.wav']));
  let top = await h.top();
  assert.deepEqual([top.createdAt, top.entries.length], ['second', 1]);
  await h.settleTop(new Set(['/a/n2.wav']));
  assert.equal((await h.top()).createdAt, 'first');
  await h.dropTop();
  assert.equal(await h.info(), null);
  assert.equal(fs.existsSync(path.join(dir, 'h.json')), false);
  await h.dropTop(); // nothing there: no error
});

test('undo history: the single batch of 26.10.3 (last-batch.json) becomes the first one, and the old file goes at the next write', async () => {
  const dir = tmp();
  const legacy = path.join(dir, 'last-batch.json');
  fs.writeFileSync(legacy, JSON.stringify({ version: 1, createdAt: '2026-10-17T10:00:00.000Z', entries: [entry(1), entry(2)] }));
  const h = createUndoHistory({ file: path.join(dir, 'undo-history.json'), legacyFile: legacy });
  assert.deepEqual(await h.info(), { batches: 1, entries: 2, createdAt: '2026-10-17T10:00:00.000Z' });
  assert.ok(fs.existsSync(legacy), 'reading changes nothing');
  await h.push(batch(1, 'new'));
  assert.equal(fs.existsSync(legacy), false);
  const all = await h.read();
  assert.deepEqual(all.map((b) => b.createdAt), ['2026-10-17T10:00:00.000Z', 'new']);
});

test('undo history: a damaged or foreign file is treated as empty and bad entries are dropped', async () => {
  const dir = tmp();
  const file = path.join(dir, 'h.json');
  fs.writeFileSync(file, '{ not json');
  const h = createUndoHistory({ file });
  assert.equal(await h.info(), null);
  fs.writeFileSync(file, JSON.stringify({ version: 2, batches: [{ createdAt: 'x', entries: [{ from: 1, to: 2 }, entry(1), null, { from: '', to: 'b' }] }, { entries: 'no' }, null] }));
  assert.equal((await h.info()).entries, 1);
  fs.writeFileSync(file, JSON.stringify({ version: 9, batches: [batch(1)] }));
  assert.equal(await h.info(), null);
});

test('undo history, end to end: a file renamed twice goes back one step at a time', async () => {
  const dir = tmp();
  const h = createUndoHistory({ file: path.join(dir, 'h.json') });
  const [a] = mk(dir, ['a.wav']);
  const b = path.join(dir, 'b.wav');
  const c = path.join(dir, 'c.wav');
  for (const [from, to] of [[a, b], [b, c]]) {
    const results = await applyRenames([{ from, to }]);
    await h.push(await buildLog(results));
  }
  assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.wav')), ['c.wav']);
  for (const expect of ['b.wav', 'a.wav']) {
    const top = await h.top();
    const { runnable, problems } = await checkUndo(top);
    assert.equal(problems.length, 0);
    const results = await applyRenames(runnable);
    await h.settleTop(new Set(results.filter((r) => r.ok).map((r) => r.from)));
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith('.wav')), [expect]);
  }
  assert.equal(await h.info(), null);
});

test('undo history: a newest batch that cannot be undone blocks nothing once it is forgotten', async () => {
  const dir = tmp();
  const h = createUndoHistory({ file: path.join(dir, 'h.json') });
  const [a] = mk(dir, ['a.wav']);
  await h.push(await buildLog(await applyRenames([{ from: a, to: path.join(dir, 'b.wav') }])));
  await h.push(await buildLog(await applyRenames([{ from: path.join(dir, 'b.wav'), to: path.join(dir, 'c.wav') }])));
  fs.rmSync(path.join(dir, 'c.wav')); // deleted since
  const check = await checkUndo(await h.top());
  assert.deepEqual([check.runnable.length, check.problems[0].error], [0, 'missing']);
  await h.dropTop();
  assert.equal((await h.info()).batches, 1); // the earlier batch is reachable again
});

// ---- sort -----------------------------------------------------------------------------------------

test('sort: by size (smallest or largest first), a tie keeps the order of adding; the other orders are unchanged', async () => {
  await import('../renderer/sorting.js');
  const { FRSort } = globalThis;
  const f = (name, size, mtimeMs, added) => ({ name, size, mtimeMs, added });
  const list = () => [f('b.wav', 500, 30, 0), f('a.wav', 100, 20, 1), f('c.wav', 500, 10, 2), f('a10.wav', 900, 40, 3), f('a9.wav', 100, 50, 4)];
  const names = (by) => FRSort.sort(list(), by).map((x) => x.name);
  assert.deepEqual(names('sizeAsc'), ['a.wav', 'a9.wav', 'b.wav', 'c.wav', 'a10.wav']);
  assert.deepEqual(names('sizeDesc'), ['a10.wav', 'b.wav', 'c.wav', 'a.wav', 'a9.wav']);
  assert.deepEqual(names('nameAsc'), ['a.wav', 'a9.wav', 'a10.wav', 'b.wav', 'c.wav']);
  assert.deepEqual(names('modified'), ['c.wav', 'a.wav', 'b.wav', 'a10.wav', 'a9.wav']);
  assert.deepEqual(names('added'), ['b.wav', 'a.wav', 'c.wav', 'a10.wav', 'a9.wav']);
  assert.deepEqual(names('nonsense'), names('added'));
  assert.ok(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'renderer', 'index.html'), 'utf8').includes('<script src="sorting.js">'));
});
