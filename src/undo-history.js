// The undo history: the last renamed batches, newest on top. "Undo" always works on the newest one, then on the
// one before it, and so on (a file renamed twice goes back one step at a time). Electron-free: the files are
// given, so it can be tested.
//
// Format of the file (version 2): { version: 2, batches: [{ createdAt, entries: [{ from, to, size, mtimeMs }] }] }, oldest first.
// File Renamer 26.10.3 and earlier kept one batch in `last-batch.json` ({ version: 1, createdAt, entries }); it is read
// once, becomes the first batch of the history and the old file is removed at the next write.
import fsp from 'node:fs/promises';
import path from 'node:path';

export const MAX_BATCHES = 10;
export const MAX_ENTRIES = 100_000; // all batches together; the newest batch is always kept

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const numOrNull = (v) => (Number.isFinite(v) ? v : null);

function cleanBatch(raw) {
  if (!isObj(raw) || !Array.isArray(raw.entries)) return null;
  const entries = raw.entries
    .filter((e) => isObj(e) && typeof e.from === 'string' && typeof e.to === 'string' && e.from && e.to)
    .map((e) => ({ from: e.from, to: e.to, size: numOrNull(e.size), mtimeMs: numOrNull(e.mtimeMs) }));
  if (!entries.length) return null;
  return { createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(0).toISOString(), entries };
}

// Drops the oldest batches while there are too many batches or entries.
export function trimHistory(batches, { maxBatches = MAX_BATCHES, maxEntries = MAX_ENTRIES } = {}) {
  const out = batches.slice();
  const total = () => out.reduce((n, b) => n + b.entries.length, 0);
  while (out.length > 1 && (out.length > maxBatches || total() > maxEntries)) out.shift();
  return out;
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

export function createUndoHistory({ file, legacyFile = null, limits } = {}) {
  async function read() {
    const raw = await readJson(file);
    if (isObj(raw) && raw.version === 2 && Array.isArray(raw.batches)) return raw.batches.map(cleanBatch).filter(Boolean);
    const old = legacyFile ? await readJson(legacyFile) : null;
    const batch = isObj(old) && old.version === 1 ? cleanBatch(old) : null;
    return batch ? [batch] : [];
  }

  async function write(batches) {
    if (!batches.length) {
      await fsp.rm(file, { force: true });
    } else {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify({ version: 2, batches }), 'utf8');
      await fsp.rename(tmp, file);
    }
    if (legacyFile) await fsp.rm(legacyFile, { force: true });
  }

  return {
    read,
    // -> { count (batches), entries (of the newest), createdAt } or null when there is nothing to undo
    async info() {
      const batches = await read();
      const top = batches.at(-1);
      return top ? { batches: batches.length, entries: top.entries.length, createdAt: top.createdAt } : null;
    },
    async top() {
      return (await read()).at(-1) || null;
    },
    // log: { createdAt, entries } as made by buildLog (src/renamer.js)
    async push(log) {
      const batch = cleanBatch(log);
      if (!batch) return;
      await write(trimHistory([...(await read()), batch], limits));
    },
    // After an undo: only the entries that were not restored stay in the newest batch; an empty batch goes away.
    async settleTop(restoredTo) {
      const batches = await read();
      const top = batches.at(-1);
      if (!top) return;
      const rest = top.entries.filter((e) => !restoredTo.has(e.to));
      if (rest.length) batches[batches.length - 1] = { ...top, entries: rest };
      else batches.pop();
      await write(batches);
    },
    // "Forget this batch": takes the newest batch out of the history without touching any file.
    async dropTop() {
      const batches = await read();
      batches.pop();
      await write(batches);
    }
  };
}
