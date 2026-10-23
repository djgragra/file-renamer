// Tags and technical values read from an audio/video file, for {artist} {title} {duration} {bitrate} {samplerate}.
// The reader is only asked when the pattern uses one of them. Files are parsed by music-metadata (pure
// JavaScript, no native code, nothing leaves the PC). The answer is remembered per file (path, size and
// modification time), so typing in the pattern field never reads a file twice; at most `concurrency`
// files are open at once and a file that takes too long is given up (the value is then empty).
// Electron-free: the parser is injected, so it can be tested.
import fsp from 'node:fs/promises';
import { parseFile } from 'music-metadata';

const MAX_TEXT = 200;
// control characters never belong in a name; the rest of the tag is kept as it is (the plan replaces what a file name cannot hold)
const clean = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, MAX_TEXT) : '');
const num = (v) => (Number.isFinite(v) && v > 0 ? v : null);

// music-metadata result -> { artist, title, duration (s), bitrate (kbit/s), samplerate (Hz) }; a missing value is '' or null
export function pickMeta(md) {
  const common = md?.common || {};
  const format = md?.format || {};
  return {
    // several artists are joined with "/": ID3v2.3 itself separates artists with "/", so "AC/DC" is read as two names
    // and comes back as "AC/DC" (a "/" cannot be in a file name: it becomes "_")
    artist: clean((Array.isArray(common.artists) && common.artists.length > 1 ? common.artists.join('/') : common.artist) || common.albumartist),
    title: clean(common.title),
    duration: num(format.duration),
    bitrate: num(format.bitrate) === null ? null : format.bitrate / 1000,
    samplerate: num(format.sampleRate)
  };
}

export function createMetaReader({ parse = parseFile, concurrency = 6, timeoutMs = 10_000, maxEntries = 50_000 } = {}) {
  const cache = new Map(); // key -> Promise<meta|null>
  const waiting = [];
  let active = 0;

  const slot = () => new Promise((resolve) => {
    if (active < concurrency) { active++; resolve(); } else waiting.push(resolve);
  });
  const release = () => {
    const next = waiting.shift();
    if (next) next(); else active--;
  };

  async function load(file) {
    await slot();
    let timer;
    try {
      const md = await Promise.race([
        parse(file, { skipCovers: true }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); })
      ]);
      return pickMeta(md);
    } catch {
      return null; // not an audio/video file, damaged, or too slow: no values
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  return {
    // -> { artist, title, duration, bitrate, samplerate } or null when the file cannot be read
    async read(file) {
      let st;
      try { st = await fsp.stat(file); } catch { return null; }
      if (!st.isFile()) return null;
      const key = `${file}\u0000${st.size}\u0000${Math.round(st.mtimeMs)}`;
      if (!cache.has(key)) {
        if (cache.size >= maxEntries) cache.delete(cache.keys().next().value); // oldest first
        cache.set(key, load(file));
      }
      return cache.get(key);
    },
    size: () => cache.size
  };
}
