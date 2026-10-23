// 26.10.4: ad-hoc signature, link to the site page, the texts, and that the window, the preload and the main process agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { pageUrl, SLUG } from '../src/updater.js';
import '../renderer/i18n.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const S = () => globalThis.I18N.STRINGS;

test('macOS: the ad-hoc signature hook is wired into the build and only acts on a Mac app', async () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.build.afterPack, 'dev/sign-adhoc.cjs');
  assert.ok(fs.existsSync(path.join(root, pkg.build.afterPack)));
  const hook = createRequire(import.meta.url)('./sign-adhoc.cjs').default;
  assert.equal(await hook({ electronPlatformName: 'win32' }), undefined); // nothing on Windows
  assert.equal(await hook({ electronPlatformName: 'linux' }), undefined);
  await assert.rejects(() => hook({ electronPlatformName: 'darwin', appOutDir: '/x', packager: { appInfo: { productFilename: 'File Renamer' } } }), process.platform === 'darwin' ? /codesign|No such|ENOENT/ : /must be built on a Mac/);
  const wf = read('.github/workflows/build-installers.yml');
  assert.match(wf, /codesign --verify --deep --strict/, 'the workflow checks the apps inside the disk images');
  assert.match(wf, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/);
  assert.doesNotMatch(wf, /node-version: 20/, 'music-metadata needs Node 22');
});

test('macOS texts: the first start says "Open Anyway", the Terminal command for an old version, in the three languages', () => {
  const want = { en: /Open Anyway/, it: /Apri comunque/, es: /Abrir de todos modos/ };
  for (const l of ['en', 'it', 'es']) {
    for (const k of ['ab.unsigned', 'help.pInst']) {
      assert.match(S()[l][k], want[l], `${l} ${k}`);
      assert.match(S()[l][k], /xattr -cr "\/Applications\/File Renamer\.app" && codesign --force --deep -s - "\/Applications\/File Renamer\.app"/, `${l} ${k}`);
      assert.doesNotMatch(S()[l][k], /right-click|clic destro|clic derecho/i, `${l} ${k}`);
    }
  }
});

test('release notes: the banner and "What\'s new" open the page of the app on the site, in the language of the app, never GitHub', () => {
  assert.equal(SLUG, 'file-renamer');
  assert.equal(pageUrl(undefined, 'en'), 'https://onairgarage.com/tools/file-renamer/');
  assert.equal(pageUrl(undefined, 'it'), 'https://onairgarage.com/it/tools/file-renamer/');
  assert.equal(pageUrl(undefined, 'es'), 'https://onairgarage.com/es/tools/file-renamer/');
  assert.equal(pageUrl('other', 'fr'), 'https://onairgarage.com/tools/other/');
  const ok = new RegExp(/const EXTERNAL_OK = \/(.+)\/;/.exec(read('main.js'))[1]);
  for (const l of ['en', 'it', 'es']) assert.ok(ok.test(pageUrl(undefined, l)), l);
  const app = read('renderer/app.js');
  assert.doesNotMatch(app, /api\.openExternal\((info\.url|RELEASES)/);
  assert.doesNotMatch(app, /RELEASES/);
  assert.equal((app.match(/api\.openPage\(\)/g) || []).length, 2); // banner / settings panel, and the What's new window
  assert.match(read('main.js'), /ipcMain\.handle\('open-page', \(\) => \{\s*shell\.openExternal\(pageUrl\(undefined, settings\(\)\.language\)\);/);
});

test('texts: English, Italian and Spanish have the same keys and none is empty', () => {
  const keys = (l) => Object.keys(S()[l]).sort();
  assert.deepEqual(keys('it'), keys('en'));
  assert.deepEqual(keys('es'), keys('en'));
  for (const l of ['en', 'it', 'es']) for (const [k, v] of Object.entries(S()[l])) assert.ok(String(v).trim(), `${l} ${k}`);
  for (const k of ['ph.artist', 'ph.title', 'ph.duration', 'ph.bitrate', 'ph.samplerate', 'note.no-tags', 'sort.sizeAsc', 'sort.sizeDesc', 'ext.title', 'btn.copyPreview', 'btn.saveLog', 'undo.forget', 'undo.older', 'undo.older.one', 'copy.done', 'copy.done.one']) {
    for (const l of ['en', 'it', 'es']) assert.ok(S()[l][k], `${l} ${k}`);
  }
  for (const l of ['en', 'it', 'es']) {
    const t = globalThis.I18N.make(l);
    assert.match(t('undo.older', { n: 3 }), /3/);
    assert.notEqual(t('undo.older', { n: 1 }), t('undo.older', { n: 2 }));
    assert.match(t('copy.done', { n: 5 }), /5/);
  }
});

test('window: every element the script looks for exists, the new controls are there', () => {
  const html = read('renderer/index.html');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const app = read('renderer/app.js');
  const used = new Set([...app.matchAll(/\$\("([A-Za-z0-9_]+)"\)/g)].map((m) => m[1]));
  const missing = [...used].filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
  for (const v of ['sizeAsc', 'sizeDesc']) assert.match(html, new RegExp(`<option value="${v}" data-i18n="sort\\.${v}"`));
  for (const ph of ['artist', 'title', 'duration', 'bitrate', 'samplerate']) {
    assert.match(html, new RegExp(`data-ins="\\{${ph}\\}"`));
    assert.match(html, new RegExp(`<code>\\{${ph}\\}</code>`)); // in the help
  }
  for (const id of ['extMode', 'extValue', 'copyBtn', 'logBtn', 'resultLog', 'undoForget']) assert.ok(ids.has(id), id);
  for (const m of html.matchAll(/data-i18n(?:-title|-aria)?="([^"]+)"/g)) assert.ok(S().en[m[1]], `missing text ${m[1]}`);
});

test('window: the placeholders the script treats as known are the ones the engine knows', async () => {
  const { META_KEYS, unknownPlaceholders } = await import('../src/pattern.js');
  const known = /var KNOWN = \[([^\]]+)\]/.exec(read('renderer/app.js'))[1].split(',').map((x) => x.trim().replace(/"/g, ''));
  for (const k of known) assert.deepEqual(unknownPlaceholders(`{${k}}`), [], k);
  for (const k of META_KEYS) assert.ok(known.includes(k), k);
});

test('preload and main process agree on every channel; the new calls are exposed', () => {
  const pre = read('preload.cjs');
  const main = read('main.js');
  const invoked = new Set([...pre.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((m) => m[1]));
  const handled = new Set([...main.matchAll(/ipcMain\.handle\('([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...invoked].filter((c) => !handled.has(c)), []);
  for (const c of ['undo:forget', 'batchlog:save', 'clipboard:copy', 'open-page']) assert.ok(invoked.has(c), c);
  assert.match(pre, /openPage:/);
  assert.match(pre, /batchLog:/);
  assert.match(pre, /copyText:/);
});

test('music-metadata is a dependency of the app and ships with it', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.dependencies['music-metadata'], /^\^?12\./);
  assert.ok(fs.existsSync(path.join(root, 'node_modules', 'music-metadata', 'package.json')));
  assert.ok(read('src/metadata.js').includes("from 'music-metadata'"));
});

test('the changelog has the entry of the version in package.json and does not mention the tip jar or the update link', () => {
  const pkg = JSON.parse(read('package.json'));
  const log = read('CHANGELOG.md');
  assert.match(log, new RegExp(`^## ${pkg.version.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}$`, 'm'));
  const entry = log.split(/^## /m)[1];
  assert.doesNotMatch(entry, /tip|jar|vasetto|release notes link/i);
});
