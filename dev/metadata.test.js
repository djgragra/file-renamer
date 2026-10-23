// 26.10.4: {artist} {title} {duration} {bitrate} {samplerate} read from the files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTemplate, unknownPlaceholders, metaKeysUsed, formatDuration, META_KEYS } from '../src/pattern.js';
import { createMetaReader, pickMeta } from '../src/metadata.js';
import { buildPlan } from '../src/planner.js';
import { makeWav, makeMp3, writeFixture } from './fixtures.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fr-meta-'));
const META = { artist: 'Ada', title: 'Night Shift', duration: 187.4, bitrate: 128, samplerate: 44100 };
const opts = (pattern, extra = {}) => ({ pattern, seqStart: 1, seqStep: 1, seed: 1, now: new Date(2026, 9, 23, 8, 0, 0), env: {}, ...extra });

test('placeholders: artist, title, duration (seconds, mmss, hhmmss), bitrate, samplerate', () => {
  const r = (t, meta = META) => resolveTemplate(t, { meta });
  assert.equal(r('{artist} - {title}'), 'Ada - Night Shift');
  assert.equal(r('{duration}'), '187');
  assert.equal(r('{duration:mmss}'), '0307');
  assert.equal(r('{duration:hhmmss}'), '000307');
  assert.equal(formatDuration(3725, 'hhmmss'), '010205');
  assert.equal(formatDuration(6000, 'mmss'), '10000'); // 100 minutes: the minutes keep growing
  assert.equal(r('{bitrate}k_{samplerate}'), '128k_44100');
  assert.equal(resolveTemplate('{bitrate}', { meta: { bitrate: 705.6 } }), '706');
});

test('placeholders: a value the file does not have is empty, never "undefined" or "null"', () => {
  const none = { artist: '', title: '', duration: null, bitrate: null, samplerate: null };
  for (const meta of [none, undefined, {}]) {
    assert.equal(resolveTemplate('[{artist}][{title}][{duration}][{bitrate}][{samplerate}]', { meta }), '[][][][][]');
  }
});

test('placeholders: the new names are known (no "unknown placeholder" warning) and the plan can tell which are used', () => {
  assert.deepEqual(META_KEYS, ['artist', 'title', 'duration', 'bitrate', 'samplerate']);
  assert.deepEqual(unknownPlaceholders('{artist}{title}{duration:mmss}{bitrate}{samplerate}{nope}'), ['{nope}']);
  assert.deepEqual(metaKeysUsed('{seq:3}_{title}_{orig}_{artist}_{title}'), ['title', 'artist']);
  assert.deepEqual(metaKeysUsed('{date}_{orig}'), []);
});

test('pickMeta: what music-metadata reports becomes the five values', () => {
  const md = { common: { artist: ' Ada\u0000 ', title: 'T'.repeat(300) }, format: { duration: 12.5, bitrate: 128000, sampleRate: 48000 } };
  const m = pickMeta(md);
  assert.equal(m.artist, 'Ada');
  assert.equal(m.title.length, 200);
  assert.deepEqual([m.duration, m.bitrate, m.samplerate], [12.5, 128, 48000]);
  assert.equal(pickMeta({ common: { artist: 'A', artists: ['A', 'B'] }, format: {} }).artist, 'A/B');
  assert.equal(pickMeta({ common: { artist: 'Solo', artists: ['Solo'] }, format: {} }).artist, 'Solo');
  assert.equal(pickMeta({ common: { albumartist: 'Band' }, format: {} }).artist, 'Band');
  assert.deepEqual(pickMeta(undefined), { artist: '', title: '', duration: null, bitrate: null, samplerate: null });
  assert.equal(pickMeta({ common: {}, format: { duration: 0, bitrate: -1 } }).duration, null);
});

test('reader on real files: WAV (RIFF INFO tags) and MP3 (ID3v2), a file without tags, a text file, a missing file', async () => {
  const d = tmp();
  const reader = createMetaReader();
  const wav = await reader.read(writeFixture(d, 'a.wav', makeWav({ seconds: 3, artist: 'Test Artist', title: 'Test Title' })));
  assert.equal(wav.artist, 'Test Artist');
  assert.equal(wav.title, 'Test Title');
  assert.equal(Math.round(wav.duration), 3);
  assert.equal(wav.samplerate, 44100);
  assert.equal(Math.round(wav.bitrate), 706);
  const mp3 = await reader.read(writeFixture(d, 'b.mp3', makeMp3({ frames: 800, artist: 'Mp3 Artist', title: 'Mp3 Title' })));
  assert.deepEqual([mp3.artist, mp3.title, mp3.bitrate, mp3.samplerate], ['Mp3 Artist', 'Mp3 Title', 128, 44100]);
  assert.ok(Math.abs(mp3.duration - 20.9) < 0.2, String(mp3.duration)); // 800 frames of 417 bytes at 128 kbit/s
  const plain = await reader.read(writeFixture(d, 'c.wav', makeWav({})));
  assert.deepEqual([plain.artist, plain.title], ['', '']);
  assert.equal(await reader.read(writeFixture(d, 'd.txt', Buffer.from('not audio'))), null);
  assert.equal(await reader.read(path.join(d, 'missing.wav')), null);
  assert.equal(await reader.read(d), null); // a folder
});

test('reader: a file is read once while it does not change; a changed file is read again', async () => {
  const d = tmp();
  const f = writeFixture(d, 'a.wav', makeWav({}));
  let calls = 0;
  const reader = createMetaReader({ parse: async () => { calls++; return { common: { title: `read ${calls}` }, format: {} }; } });
  assert.equal((await reader.read(f)).title, 'read 1');
  assert.equal((await reader.read(f)).title, 'read 1');
  assert.equal(calls, 1);
  fs.writeFileSync(f, Buffer.concat([fs.readFileSync(f), Buffer.alloc(10)]));
  assert.equal((await reader.read(f)).title, 'read 2');
  // two requests for the same file at the same moment share one read
  const g = writeFixture(d, 'b.wav', makeWav({}));
  await Promise.all([reader.read(g), reader.read(g), reader.read(g)]);
  assert.equal(calls, 3);
});

test('reader: at most `concurrency` files at once, a slow file is given up, the memory of old answers is bounded', async () => {
  const d = tmp();
  const paths = Array.from({ length: 12 }, (_, i) => writeFixture(d, `f${i}.wav`, makeWav({})));
  let active = 0, peak = 0;
  const slow = createMetaReader({
    concurrency: 3,
    parse: async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 10)); active--; return { common: {}, format: {} }; }
  });
  await Promise.all(paths.map((p) => slow.read(p)));
  assert.equal(peak, 3);

  const stuck = createMetaReader({ timeoutMs: 30, parse: () => new Promise(() => {}) });
  assert.equal(await stuck.read(paths[0]), null);
  assert.equal(await stuck.read(paths[1]), null); // the slot was released: the next file is not blocked

  const small = createMetaReader({ maxEntries: 5, parse: async () => ({ common: {}, format: {} }) });
  for (const p of paths) await small.read(p);
  assert.ok(small.size() <= 5);
});

test('plan: names built from the tags, "tag missing" note, sanitized characters, nothing read when the pattern does not ask', async () => {
  const d = tmp();
  const a = writeFixture(d, 'one.mp3', makeMp3({ artist: 'AC/DC', title: 'Who Made Who' }));
  const b = writeFixture(d, 'two.mp3', makeMp3({ title: 'Only Title' }));
  const reader = createMetaReader();
  const reads = [];
  const readMeta = (p) => { reads.push(path.basename(p)); return reader.read(p); };
  let rows = await buildPlan([{ path: a, selected: true }, { path: b, selected: true }], opts('{artist} - {title}', { readMeta }));
  assert.equal(rows[0].newName, 'AC_DC - Who Made Who.mp3');
  assert.deepEqual(rows[0].notes, ['sanitized']);
  assert.equal(rows[1].newName, '- Only Title.mp3'); // empty artist: the leading space is trimmed
  assert.ok(rows[1].notes.includes('no-tags'));
  assert.equal(rows[1].status, 'ok');

  reads.length = 0;
  rows = await buildPlan([{ path: a, selected: true }, { path: b, selected: false }], opts('{title}_{seq:2}', { readMeta }));
  assert.deepEqual(reads, ['one.mp3'], 'the unselected file is not read');
  assert.equal(rows[0].newName, 'Who Made Who_01.mp3');

  reads.length = 0;
  rows = await buildPlan([{ path: a, selected: true }], opts('{orig}_{seq:2}', { readMeta }));
  assert.deepEqual(reads, [], 'no tag placeholder in the pattern: no file is opened');
  assert.equal(rows[0].newName, 'one_01.mp3');
});

test('plan: duration, bitrate and sample rate from a real file; a file that cannot be read gives "tag missing", not a crash', async () => {
  const d = tmp();
  const w = writeFixture(d, 'x.wav', makeWav({ seconds: 187 - 180 + 180, rate: 8000 }));
  const junk = writeFixture(d, 'y.wav', Buffer.from('this is not a wave file'));
  const reader = createMetaReader();
  const rows = await buildPlan([{ path: w, selected: true }, { path: junk, selected: true }], opts('{duration:mmss}_{bitrate}_{samplerate}', { readMeta: (p) => reader.read(p) }));
  assert.equal(rows[0].newName, '0307_128_8000.wav');
  assert.equal(rows[0].notes.includes('no-tags'), false);
  assert.equal(rows[1].newName, '__.wav');
  assert.ok(rows[1].notes.includes('no-tags'));
});

test('plan: a failing reader does not stop the plan', async () => {
  const d = tmp();
  const f = writeFixture(d, 'a.wav', makeWav({}));
  const rows = await buildPlan([{ path: f, selected: true }], opts('{title}x', { readMeta: async () => { throw new Error('boom'); } }));
  assert.equal(rows[0].newName, 'x.wav');
  assert.ok(rows[0].notes.includes('no-tags'));
});
