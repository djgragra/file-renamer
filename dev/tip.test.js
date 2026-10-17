import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../renderer/i18n.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

test('tip line: text and button in all three languages, link to the site page in the app language', () => {
  const { STRINGS: S, tipUrl } = globalThis.I18N;
  for (const l of ['en', 'it', 'es']) {
    assert.ok(S[l]['ab.tipText'].trim() && S[l]['ab.tipBtn'].trim(), l);
  }
  assert.equal(S.en['ab.tipBtn'], 'Tip jar');
  assert.equal(S.it['ab.tipBtn'], 'Salvadanaio');
  assert.equal(S.es['ab.tipBtn'], 'Hucha');
  assert.equal(tipUrl('en'), 'https://onairgarage.com/support/');
  assert.equal(tipUrl('it'), 'https://onairgarage.com/it/support/');
  assert.equal(tipUrl('es'), 'https://onairgarage.com/es/support/');
  assert.equal(tipUrl('fr'), 'https://onairgarage.com/support/'); // unknown language: English
});

test('tip line: the browser opens those pages, nothing else from the outside; the jar image ships with the app', () => {
  const ok = new RegExp(/const EXTERNAL_OK = \/(.+)\/;/.exec(read('main.js'))[1]);
  for (const l of ['en', 'it', 'es']) assert.ok(ok.test(globalThis.I18N.tipUrl(l)), l);
  for (const bad of ['https://evil.example/support/', 'http://onairgarage.com/support/', 'https://onairgarage.com.evil.example/']) assert.ok(!ok.test(bad), bad);
  assert.ok(fs.statSync(path.join(root, 'renderer', 'img', 'tip-jar.png')).size > 1000);
  assert.ok(JSON.parse(read('package.json')).build.files.includes('renderer/**/*'));
  const html = read('renderer/index.html');
  assert.match(html, /<img class="tip__jar" src="img\/tip-jar\.png" alt=""/); // decorative
  assert.doesNotMatch(read('renderer/app.js'), /setTimeout\([^)]*abTip/); // no pop-up, no reminder: a link the user clicks
});
