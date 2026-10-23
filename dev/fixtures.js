// Small audio files made on the fly for the tests (no binary files in the repository, no real recordings).
import fs from 'node:fs';
import path from 'node:path';

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const pad2 = (b) => (b.length % 2 ? Buffer.concat([b, Buffer.alloc(1)]) : b);
const chunk = (id, body) => Buffer.concat([Buffer.from(id, 'ascii'), u32(body.length), pad2(body)]);

// WAV, mono 16 bit, `seconds` of silence, with the tags in a RIFF INFO list
export function makeWav({ seconds = 1, rate = 44100, artist = '', title = '' } = {}) {
  const fmt = chunk('fmt ', Buffer.concat([u16(1), u16(1), u32(rate), u32(rate * 2), u16(2), u16(16)]));
  const data = chunk('data', Buffer.alloc(rate * 2 * seconds));
  const info = [['IART', artist], ['INAM', title]].filter(([, v]) => v).map(([id, v]) => chunk(id, Buffer.from(v + '\0', 'latin1')));
  const list = info.length ? chunk('LIST', Buffer.concat([Buffer.from('INFO', 'ascii'), ...info])) : Buffer.alloc(0);
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, list, data]);
  return Buffer.concat([Buffer.from('RIFF', 'ascii'), u32(body.length), body]);
}

const synchsafe = (n) => Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
const frame = (id, text) => {
  const body = Buffer.concat([Buffer.from([0]), Buffer.from(text, 'latin1')]); // ISO-8859-1
  const size = Buffer.alloc(4); size.writeUInt32BE(body.length);
  return Buffer.concat([Buffer.from(id, 'ascii'), size, Buffer.from([0, 0]), body]);
};

// MP3, MPEG-1 Layer III 128 kbit/s 44.1 kHz (417-byte frames of silence), with ID3v2.3 tags
export function makeMp3({ frames = 40, artist = '', title = '' } = {}) {
  const tags = Buffer.concat([artist && frame('TPE1', artist), title && frame('TIT2', title)].filter(Boolean));
  const head = tags.length ? Buffer.concat([Buffer.from('ID3', 'ascii'), Buffer.from([3, 0, 0]), synchsafe(tags.length), tags]) : Buffer.alloc(0);
  const one = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(417 - 4)]);
  return Buffer.concat([head, ...Array.from({ length: frames }, () => one)]);
}

export function writeFixture(dir, name, buf) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, buf);
  return p;
}
