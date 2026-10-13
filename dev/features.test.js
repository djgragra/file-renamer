// 26.10.2: find & replace, clean up, {parent}, presets and settings, backup, logs, texts, icons, changelog.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareTransform, applyClean, applyFind, compileFind, hasTransforms, sanitizeFind, sanitizeClean } from '../src/text-tools.js';
import { resolveTemplate } from '../src/pattern.js';
import { buildPlan } from '../src/planner.js';
import { sanitizeSettings, sanitizePreset, sanitizePresets, createStore, MAX_PRESETS } from '../src/settings.js';
import { buildExport, prepareImport, missingSecrets, backupFileName } from '../src/backup.js';
import { createLogger, LOG_FILE_RE } from '../src/logger.js';
import '../renderer/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fr-f-'));
const mk = (dir, names) => names.map((n) => { fs.writeFileSync(path.join(dir, n), n); return path.join(dir, n); });
const files = (paths) => paths.map((p) => ({ path: p, selected: true }));
const opts = (pattern, extra = {}) => ({ pattern, seqStart: 1, seqStep: 1, seed: 1, now: new Date(2026, 9, 13, 8, 0, 0), env: {}, ...extra });

// ---- find and replace ---------------------------------------------------------------------------------

test('find and replace: plain text (case-insensitive by default), removal, literal $ in the replacement', () => {
  const run = (find, v) => prepareTransform({ find }).run(v);
  assert.equal(run({ text: 'copy', replace: '' }, 'Take 1 Copy copy'), 'Take 1  ');
  assert.equal(run({ text: 'copy', replace: '', caseSensitive: true }, 'Take Copy copy'), 'Take Copy ');
  assert.equal(run({ text: 'a.b', replace: 'X' }, 'a.b axb'), 'X axb'); // "." is not a wildcard in plain mode
  assert.equal(run({ text: 'a', replace: '$&$1' }, 'cat'), 'c$&$1t'); // no special meaning of $ in plain mode
  assert.equal(run({ text: '', replace: 'X' }, 'abc'), 'abc'); // nothing to find = nothing to do
});

test('find and replace: regular expressions with groups, and a bad expression is reported', () => {
  assert.equal(prepareTransform({ find: { text: '\\s*\\(\\d+\\)$', replace: '', regex: true } }).run('clip (12)'), 'clip');
  assert.equal(prepareTransform({ find: { text: '(\\d{4})-(\\d{2})', replace: '$2/$1', regex: true } }).run('2026-10 take'), '10/2026 take');
  const bad = prepareTransform({ find: { text: '([', regex: true } });
  assert.deepEqual([bad.ok, bad.error], [false, 'bad-regex']);
  assert.equal(compileFind({ text: '(', regex: false }).ok, true); // plain mode escapes it
  assert.equal(sanitizeFind({ text: 'x'.repeat(500) }).text.length, 200);
});

// ---- clean up -----------------------------------------------------------------------------------------

test('clean up: accents, special characters, case, spaces', () => {
  assert.equal(applyClean('Caffè  è Più', { accents: true }), 'Caffe  e Piu');
  assert.equal(applyClean('a/b?c (1) [x]!', { special: true }), 'abc 1 x');
  assert.equal(applyClean('ciao MONDO', { case: 'lower' }), 'ciao mondo');
  assert.equal(applyClean('ciao mondo', { case: 'upper' }), 'CIAO MONDO');
  assert.equal(applyClean('ciao mondo-nuovo_x', { case: 'title' }), 'Ciao Mondo-Nuovo_X');
  assert.equal(applyClean('  a   b  c ', { spaces: 'underscore' }), 'a_b_c');
  assert.equal(applyClean('a b  c', { spaces: 'hyphen' }), 'a-b-c');
  assert.equal(applyClean('Intervista Città — 1', { accents: true, special: true, case: 'lower', spaces: 'underscore' }), 'intervista_citta_1');
  assert.equal(applyClean('Tab\there', { spaces: 'underscore' }), 'Tab_here');
  assert.equal(applyClean('keep', {}), 'keep');
  assert.deepEqual(sanitizeClean({ case: 'weird', spaces: 3 }), { case: 'none', spaces: 'none', accents: false, special: false });
  assert.equal(hasTransforms({ text: '' }, {}), false);
  assert.equal(hasTransforms({ text: 'x' }, {}), true);
  assert.equal(hasTransforms({}, { accents: true }), true);
});

// ---- {parent} and the plan ----------------------------------------------------------------------------

test('{parent}: the folder that contains the file', () => {
  assert.equal(resolveTemplate('{parent}_{orig}', { parent: 'Giro 2026', orig: 'clip' }), 'Giro 2026_clip');
  assert.equal(resolveTemplate('{parent}', {}), '');
});

test('plan: {parent} comes from each file, find / clean run after the pattern, extension kept', async () => {
  const root1 = tmp();
  fs.mkdirSync(path.join(root1, 'Giorno 1'));
  fs.mkdirSync(path.join(root1, 'Giorno 2'));
  const a = mk(path.join(root1, 'Giorno 1'), ['Intervista (1).WAV']);
  const b = mk(path.join(root1, 'Giorno 2'), ['Città copy.wav']);
  const rows = await buildPlan(files([...a, ...b]), opts('{parent}_{orig}', {
    find: { text: ' copy', replace: '' },
    clean: { accents: true, special: true, case: 'lower', spaces: 'underscore' }
  }));
  assert.deepEqual(rows.map((r) => r.newName), ['giorno_1_intervista_1.WAV', 'giorno_2_citta.wav']);
  assert.deepEqual(rows.map((r) => r.status), ['ok', 'ok']);
});

test('plan: a bad regular expression blocks every selected row and renames nothing', async () => {
  const d = tmp();
  const p = mk(d, ['a.wav', 'b.wav']);
  const rows = await buildPlan(files(p), opts('{orig}x', { find: { text: '(', regex: true } }));
  assert.deepEqual(rows.map((r) => r.status), ['error', 'error']);
  assert.deepEqual(rows[0].reasons, ['bad-regex']);
  // nothing selected: no error, just skipped
  const skipped = await buildPlan(p.map((x) => ({ path: x, selected: false })), opts('{orig}x', { find: { text: '(', regex: true } }));
  assert.deepEqual(skipped.map((r) => r.status), ['skipped', 'skipped']);
});

test('plan: the result of find & replace still goes through the safety rules', async () => {
  const d = tmp();
  const p = mk(d, ['a.wav', 'b.wav', 'c.wav']);
  const dup = await buildPlan(files(p), opts('{orig}', { find: { text: '[abc]', replace: 'same', regex: true } }));
  assert.ok(dup.every((r) => r.status === 'error' && r.reasons.includes('duplicate')));
  const empty = await buildPlan(files(p.slice(0, 1)), opts('{orig}', { find: { text: 'a', replace: '' } }));
  assert.deepEqual(empty[0].reasons, ['empty']);
  const bad = await buildPlan(files(p.slice(0, 1)), opts('{orig}', { find: { text: 'a', replace: 'x:y' } }));
  assert.equal(bad[0].newName, 'x_y.wav');
  assert.deepEqual(bad[0].notes, ['sanitized']);
});

// ---- settings and presets -----------------------------------------------------------------------------

test('settings: defaults, bad values are replaced, the interface language stays English until chosen', () => {
  const s = sanitizeSettings({});
  assert.equal(s.language, 'en');
  assert.equal(s.theme, 'auto');
  assert.equal(s.pattern, '{date:yyyyMMdd}_{seq:3}_{orig}');
  assert.equal(s.checkUpdates, true);
  assert.equal(s.avOnly, true);
  const bad = sanitizeSettings({ language: 'fr', theme: 'pink', seqStart: 'x', seqStep: 0, pattern: 7, recent: ['a', '', 5], presets: 'no' });
  assert.deepEqual([bad.language, bad.theme, bad.seqStart, bad.seqStep, bad.recent, bad.presets], ['en', 'auto', 1, 1, ['a'], []]);
  assert.equal(sanitizeSettings({ recent: Array.from({ length: 20 }, (_v, i) => `p${i}`) }).recent.length, 8);
});

test('presets: sanitized, unique ids, at most 50, a preset needs a name and a pattern', () => {
  const p = sanitizePreset({ id: 'abc', name: '  Giro  ', pattern: '{orig}', seqStart: 5, seqStep: 0, find: { text: 'x' }, clean: { case: 'lower' } });
  assert.deepEqual([p.id, p.name, p.seqStart, p.seqStep, p.find.text, p.clean.case], ['abc', 'Giro', 5, 1, 'x', 'lower']);
  assert.equal(sanitizePreset({ name: '', pattern: 'x' }), null);
  assert.equal(sanitizePreset({ name: 'n', pattern: '' }), null);
  assert.equal(sanitizePreset({ name: 'n', pattern: 'x', id: 'bad id!' }).id.startsWith('p'), true);
  const many = Array.from({ length: 80 }, (_v, i) => ({ id: `id${i}`, name: `n${i}`, pattern: 'x' }));
  assert.equal(sanitizePresets(many).length, MAX_PRESETS);
  assert.equal(sanitizePresets([{ id: 'a', name: 'x', pattern: 'p' }, { id: 'a', name: 'y', pattern: 'p' }]).length, 1);
});

test('store: written atomically, read back, a corrupt file is kept aside', () => {
  const dir = tmp();
  const file = path.join(dir, 'settings.json');
  const store = createStore({ file });
  assert.equal(store.hadFile(), false);
  store.update({ pattern: '{orig}_x', language: 'it', presets: [{ id: 'a', name: 'A', pattern: '{orig}' }] });
  const again = createStore({ file });
  assert.equal(again.hadFile(), true);
  assert.equal(again.get().pattern, '{orig}_x');
  assert.equal(again.get().language, 'it');
  assert.equal(again.get().presets.length, 1);
  assert.ok(!fs.existsSync(`${file}.tmp`));
  fs.writeFileSync(file, '{not json');
  const broken = createStore({ file, now: () => 7 });
  assert.equal(broken.get().language, 'en');
  assert.ok(fs.existsSync(`${file}.corrupt-7`));
});

// ---- backup -------------------------------------------------------------------------------------------

function sample() {
  return sanitizeSettings({
    language: 'it', theme: 'dark', pattern: '{parent}_{seq:3}', lastSeenVersion: '26.10.1',
    updateState: { skipVersion: '26.10.9', remindUntil: 5, lastCheck: null }, migrated: true,
    presets: [{ id: 'p1', name: 'Giro', pattern: '{mdate}_{orig}' }, { id: 'p2', name: 'Jingle', pattern: 'J_{seq:2}' }]
  });
}

test('backup: the file, its name, what stays on this computer', () => {
  const file = buildExport(sample(), { now: Date.UTC(2026, 9, 13) });
  assert.equal(file.app, 'file-renamer');
  assert.equal(file.version, 1);
  assert.equal(file.exportedAt, '2026-10-13T00:00:00.000Z');
  assert.equal(file.includesSecrets, false);
  assert.equal(file.emptiedSecrets, undefined);
  assert.equal(file.presets.length, 2);
  for (const k of ['lastSeenVersion', 'updateState', 'migrated', 'presets']) assert.ok(!(k in file.settings), k);
  assert.equal(file.settings.pattern, '{parent}_{seq:3}');
  assert.equal(backupFileName(Date.UTC(2026, 9, 13)), 'file-renamer-backup-2026-10-13.json');
  assert.deepEqual(missingSecrets(), []);
});

test('backup import: replace keeps this computer\'s own memory; add-only adds the missing presets', () => {
  const cur = sample();
  const file = buildExport(cur);
  file.settings.language = 'es';
  file.presets = [{ id: 'p1', name: 'Giro', pattern: 'changed' }, { id: 'p3', name: 'New', pattern: 'N_{seq}' }, { id: 'p9', name: 'jingle', pattern: 'same name as p2' }];
  const rep = prepareImport(JSON.stringify(file), cur);
  assert.equal(rep.ok, true);
  assert.equal(rep.settings.language, 'es');
  assert.deepEqual(rep.settings.presets.map((p) => p.id), ['p1', 'p3', 'p9']);
  assert.equal(rep.settings.lastSeenVersion, '26.10.1');
  assert.equal(rep.settings.updateState.skipVersion, '26.10.9');
  assert.deepEqual(rep.missing, []);
  const add = prepareImport(file, cur, { mode: 'add' });
  assert.equal(add.added, 1); // p3 only: p1 has the same id, p9 the same name as p2
  assert.deepEqual(add.settings.presets.map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.equal(add.settings.presets[0].pattern, '{mdate}_{orig}'); // existing presets untouched
  assert.equal(add.settings.language, 'it'); // settings untouched
  assert.equal(prepareImport(file, add.settings, { mode: 'add' }).added, 0);
});

test('backup import: wrong app, broken or huge files are refused', () => {
  const cur = sample();
  assert.equal(prepareImport({ app: 'g-clock', settings: {} }, cur).error, 'wrong-app');
  assert.equal(prepareImport('{nope', cur).error, 'invalid');
  assert.equal(prepareImport({ app: 'file-renamer' }, cur).error, 'invalid');
  assert.equal(prepareImport('x'.repeat(2_100_000), cur).error, 'too-big');
  // a file written by another program with odd values is cleaned the same way as saved settings
  const odd = prepareImport({ app: 'file-renamer', settings: { language: 'xx', seqStep: 0, presets: [{ name: '', pattern: '' }] } }, cur);
  assert.equal(odd.ok, true);
  assert.deepEqual([odd.settings.language, odd.settings.seqStep, odd.settings.presets], ['en', 1, []]);
});

// ---- logs ---------------------------------------------------------------------------------------------

test('logs: one file per day, a file that reaches the limit is closed and a new one starts, old days are removed', async () => {
  const dir = tmp();
  let day = new Date(2026, 9, 13, 12, 0, 0);
  const log = createLogger({ dir, retentionDays: 7, maxBytes: 200, now: () => day });
  for (let i = 0; i < 12; i++) log.log('info', `line number ${i} ${'x'.repeat(40)}`);
  await log.flush();
  const names = fs.readdirSync(dir).sort();
  assert.ok(names.every((n) => LOG_FILE_RE.test(n)), names.join());
  assert.ok(names.includes('file-renamer_13-10-2026.log'));
  assert.ok(names.length >= 2 && names.length <= 4, `${names.length} files for one day`);
  day = new Date(2026, 9, 25, 12, 0, 0);
  assert.ok(log.prune() >= 1);
  assert.deepEqual(fs.readdirSync(dir), []);
});

// ---- texts, icons, packaging --------------------------------------------------------------------------

test('texts: English, Italian and Spanish have the same keys, none empty; every key used by the page exists', () => {
  const S = globalThis.I18N.STRINGS;
  const en = Object.keys(S.en).sort();
  for (const l of ['it', 'es']) {
    assert.deepEqual(Object.keys(S[l]).sort(), en, `keys of ${l} differ from en`);
  }
  for (const l of ['en', 'it', 'es']) for (const [k, v] of Object.entries(S[l])) assert.ok(String(v).trim(), `${l}.${k} is empty`);
  // data-i18n keys in the page and t("...") keys in the script
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
  const used = new Set([...html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)].map((m) => m[1]));
  for (const m of js.matchAll(/\bt\("([\w.-]+)"/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !k.endsWith('.') && !(k in S.en)); // "note.", "reason.", "err.": the key is built from a code
  for (const code of ['sanitized', 'case-only', 'chain']) assert.ok(`note.${code}` in S.en, code);
  for (const code of ['empty', 'reserved', 'too-long', 'duplicate', 'exists', 'missing', 'bad-regex']) assert.ok(`reason.${code}` in S.en, code);
  for (const code of ['invalid', 'wrong-app', 'too-big']) assert.ok(`bk.err.${code}` in S.en, code);
  assert.deepEqual(missing, []);
});

test('texts: the same placeholders ({n}, {v}…) in every language', () => {
  const S = globalThis.I18N.STRINGS;
  const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  for (const l of ['it', 'es']) {
    for (const k of Object.keys(S.en)) {
      if (/^help\.(ph\.|phIntro)|^ph\./.test(k)) continue; // examples with braces
      assert.equal(vars(S[l][k]), vars(S.en[k]), `${l}.${k}`);
    }
  }
});

test('icons: the logo and every generated icon exist, and the page uses the same logo', () => {
  const a = (f) => path.join(root, 'assets', f);
  for (const f of ['logo.svg', 'icon.png', 'icon-mac.png', 'icon.ico', 'icon.icns', ...[16, 32, 48, 64, 128, 256, 512].map((s) => `linux-icons/${s}x${s}.png`)]) {
    assert.ok(fs.statSync(a(f)).size > 100, f);
  }
  assert.equal(fs.readFileSync(a('logo.svg'), 'utf8'), fs.readFileSync(path.join(root, 'renderer', 'logo.svg'), 'utf8'));
  assert.equal(fs.readFileSync(a('icon.png')).subarray(1, 4).toString(), 'PNG');
  assert.equal(fs.readFileSync(a('icon.icns')).subarray(0, 4).toString(), 'icns');
});

test('the page has no inline script or style and loads nothing from outside', () => {
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));
  assert.ok(!/\sstyle=/i.test(html));
  assert.ok(!/(src|href)="https?:/i.test(html.replace(/<a [^>]*data-ext[^>]*>/g, '')));
});

test('CLAUDE.md points to the hub and is not ignored by git', () => {
  const text = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.match(text, /djgragra\/garage-hub/);
  assert.ok(!/^CLAUDE\.md$/m.test(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')));
});
