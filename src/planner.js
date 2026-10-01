import path from 'node:path';
import fsp from 'node:fs/promises';
import { resolveTemplate, makeRng } from './pattern.js';

// Extensions offered by the file dialog and used when scanning folders. This is a convenience
// filter (common audio/video containers), not a list from a standard; files dropped one by one
// are always accepted.
export const AV_EXTENSIONS = [
  'wav', 'bwf', 'mp3', 'mp2', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'aif', 'aiff', 'wma',
  'mp4', 'm4v', 'mov', 'mxf', 'mkv', 'avi', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', 'webm', 'wmv', 'flv'
];

// Windows rules, read on learn.microsoft.com "Naming Files, Paths, and Namespaces"
// (page updated 2025-04-11). Applied on every OS so the names also work when the files move
// to a Windows machine or an exFAT/FAT drive.
const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/i;
// Not a documented limit of every file system: most common file systems allow 255 characters
// (or bytes) per name; the check is conservative and counts UTF-16 units.
export const MAX_NAME_LENGTH = 255;

export function splitName(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

// Replaces forbidden characters with "_", trims spaces at both ends and trailing periods.
export function sanitizeBase(base) {
  const cleaned = base.replace(FORBIDDEN_CHARS, '_').replace(/^\s+/, '').replace(/[\s.]+$/, '');
  return { value: cleaned, changed: cleaned !== base };
}

// Reserved device names are reserved with or without an extension ("NUL.txt" is NUL).
export function isReservedName(name) {
  return RESERVED.test(name.split('.')[0].replace(/\s+$/, ''));
}

const keyOf = (dir, name) => `${dir}\u0000${name.normalize('NFC').toLowerCase()}`;
const idOf = (st) => (st && st.ino ? `${st.dev}:${st.ino}` : null);

async function lstatOrNull(p) {
  try {
    return await fsp.lstat(p, { bigint: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

// files: [{ path, selected }] in list order.
// opts:  { pattern, seqStart, seqStep, seed, now, env }
// Returns one row per file: { path, dir, name, newName, status, reasons, notes }
//   status: ok | unchanged | skipped | error
//   reasons (error): empty, reserved, too-long, duplicate, exists
//   notes: sanitized, case-only, chain
export async function buildPlan(files, opts) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const seqStart = Number.isFinite(opts.seqStart) ? opts.seqStart : 1;
  const seqStep = Number.isFinite(opts.seqStep) && opts.seqStep !== 0 ? opts.seqStep : 1;
  const pattern = String(opts.pattern ?? '');

  const rows = files.map((f) => {
    const dir = path.dirname(f.path);
    const name = path.basename(f.path);
    return { path: f.path, dir, name, newName: name, status: f.selected ? 'ok' : 'skipped', reasons: [], notes: [] };
  });

  // Source files are read first: {mdate}/{mtime} need the modification time.
  for (const row of rows) {
    if (row.status === 'ok') row.sourceStat = await lstatOrNull(row.path);
  }

  let k = 0;
  rows.forEach((row, i) => {
    if (row.status !== 'ok') return;
    const { base, ext } = splitName(row.name);
    const rng = makeRng(((opts.seed >>> 0) + Math.imul(i + 1, 2654435761)) >>> 0);
    const resolved = resolveTemplate(pattern, { now, mtime: row.sourceStat ? new Date(Number(row.sourceStat.mtimeMs)) : undefined, seq: seqStart + k * seqStep, orig: base, rng, env: opts.env });
    k++;
    const clean = sanitizeBase(resolved);
    if (clean.changed) row.notes.push('sanitized');
    if (!clean.value) { row.reasons.push('empty'); return; }
    row.newName = clean.value + ext;
    if (row.newName.length > MAX_NAME_LENGTH) row.reasons.push('too-long');
    if (isReservedName(row.newName)) row.reasons.push('reserved');
  });

  // Duplicates inside the batch (same folder, equal after NFC + lower-casing). The names of
  // selected rows count, including rows that do not change: they keep occupying their name.
  const byKey = new Map();
  for (const row of rows) {
    if (row.status !== 'ok' || row.reasons.length) continue;
    const key = keyOf(row.dir, row.newName);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  for (const group of byKey.values()) {
    if (group.length > 1) for (const row of group) row.reasons.push('duplicate');
  }

  // Disk checks: a target that exists is fine only when it is the same file (case-only change)
  // or the file of another row of this batch that is being renamed away (swap or chain).
  const sourceIds = new Map();
  for (const row of rows) {
    if (row.status !== 'ok') continue;
    const st = row.sourceStat;
    if (st) {
      const id = idOf(st);
      if (id && row.newName !== row.name) sourceIds.set(id, row);
    }
  }
  const batchSourceKeys = new Set(rows.filter((r) => r.status === 'ok' && r.newName !== r.name).map((r) => keyOf(r.dir, r.name)));

  for (const row of rows) {
    if (row.status !== 'ok') continue;
    if (!row.sourceStat) { row.reasons.push('missing'); continue; }
    if (row.newName === row.name) { if (!row.reasons.length) row.status = 'unchanged'; continue; }
    if (row.reasons.length) continue;
    const target = path.join(row.dir, row.newName);
    const st = await lstatOrNull(target);
    if (!st) continue;
    const tid = idOf(st);
    const sid = idOf(row.sourceStat);
    if (tid && sid && tid === sid) { row.notes.push('case-only'); continue; }
    const owner = tid ? sourceIds.get(tid) : null;
    if ((owner && owner !== row) || (!tid && batchSourceKeys.has(keyOf(row.dir, row.newName)))) { row.notes.push('chain'); continue; }
    row.reasons.push('exists');
  }

  for (const row of rows) {
    delete row.sourceStat;
    if (row.reasons.length) row.status = 'error';
  }
  return rows;
}
