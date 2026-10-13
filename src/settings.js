// Settings of the app in one JSON file in the user's data folder, written atomically.
// Nothing here is secret (File Renamer has no passwords or tokens), so nothing is sealed.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_FIND, DEFAULT_CLEAN, sanitizeFind, sanitizeClean } from './text-tools.js';

export const MAX_PRESETS = 50;
export const MAX_RECENT = 8;
export const MAX_PATTERN_LENGTH = 500;
export const DEFAULT_PATTERN = '{date:yyyyMMdd}_{seq:3}_{orig}';

export const DEFAULT_SETTINGS = Object.freeze({
  language: 'en', // the app always starts in English until the user changes it
  theme: 'auto', // 'auto' | 'light' | 'dark'
  pattern: DEFAULT_PATTERN,
  seqStart: 1,
  seqStep: 1,
  recursive: false,
  avOnly: true,
  find: DEFAULT_FIND,
  clean: DEFAULT_CLEAN,
  recent: [], // last patterns used
  presets: [], // [{ id, name, pattern, seqStart, seqStep, find, clean }]
  checkUpdates: true,
  lastSeenVersion: '', // the version whose "What's new" the user has already seen
  updateState: { skipVersion: '', remindUntil: 0, lastCheck: null }, // lastCheck: { at, ok, error }
  migrated: false // the values saved by 26.10.1 in the window (localStorage) were copied here
});

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const int = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.trunc(Number(v)) : d);
const str = (v, max, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);

export function sanitizePreset(raw) {
  if (!isObj(raw)) return null;
  const name = str(raw.name, 60).trim();
  const pattern = str(raw.pattern, MAX_PATTERN_LENGTH);
  if (!name || !pattern) return null;
  return {
    id: typeof raw.id === 'string' && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : `p${randomUUID().slice(0, 8)}`,
    name,
    pattern,
    seqStart: int(raw.seqStart, 1),
    seqStep: int(raw.seqStep, 1) || 1,
    find: sanitizeFind(raw.find),
    clean: sanitizeClean(raw.clean)
  };
}

export function sanitizePresets(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const p = sanitizePreset(raw);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
    if (out.length >= MAX_PRESETS) break;
  }
  return out;
}

export function sanitizeUpdateState(raw) {
  const r = isObj(raw) ? raw : {};
  const lc = isObj(r.lastCheck) ? { at: int(r.lastCheck.at, 0), ok: r.lastCheck.ok === true, error: str(r.lastCheck.error, 300) } : null;
  return { skipVersion: str(r.skipVersion, 40), remindUntil: Math.max(0, int(r.remindUntil, 0)), lastCheck: lc };
}

export function sanitizeSettings(raw) {
  const r = isObj(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    language: ['en', 'it', 'es'].includes(r.language) ? r.language : d.language,
    theme: ['auto', 'light', 'dark'].includes(r.theme) ? r.theme : d.theme,
    pattern: typeof r.pattern === 'string' ? r.pattern.slice(0, MAX_PATTERN_LENGTH) : d.pattern,
    seqStart: int(r.seqStart, d.seqStart),
    seqStep: int(r.seqStep, d.seqStep) || 1,
    recursive: r.recursive === true,
    avOnly: r.avOnly === undefined ? d.avOnly : r.avOnly === true,
    find: sanitizeFind(r.find),
    clean: sanitizeClean(r.clean),
    recent: (Array.isArray(r.recent) ? r.recent : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => x.slice(0, MAX_PATTERN_LENGTH)).slice(0, MAX_RECENT),
    presets: sanitizePresets(r.presets),
    checkUpdates: r.checkUpdates === undefined ? d.checkUpdates : r.checkUpdates === true,
    lastSeenVersion: str(r.lastSeenVersion, 40),
    updateState: sanitizeUpdateState(r.updateState),
    migrated: r.migrated === true
  };
}

// Reads the file at start (a corrupt file is kept as <file>.corrupt-<time> and the defaults are used)
// and writes the whole object atomically after every update.
export function createStore({ file, now = Date.now } = {}) {
  let hadFile = false;
  let data = load();

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      hadFile = true;
      return sanitizeSettings(raw.settings || {});
    } catch (err) {
      if (err.code !== 'ENOENT') {
        try { fs.renameSync(file, `${file}.corrupt-${now()}`); } catch { /* ignore */ }
      }
      return sanitizeSettings({});
    }
  }

  function write() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, settings: data }, null, 1), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  return {
    hadFile: () => hadFile,
    file,
    get: () => structuredClone(data),
    update(patch) {
      data = sanitizeSettings({ ...data, ...(isObj(patch) ? patch : {}) });
      write();
      return structuredClone(data);
    },
    replace(next) {
      data = sanitizeSettings(next);
      write();
      return structuredClone(data);
    }
  };
}
