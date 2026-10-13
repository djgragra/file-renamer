// garage-common: backup 1
// Configuration backup: build the file, read it back, say what must be typed again.
// Electron-free and file-free (the main process asks for the file and applies the plan), so it can
// be tested. File Renamer keeps no passwords or tokens, so the "include passwords" box does not exist
// and nothing has to be typed again; the file is still written with includesSecrets: false.
import { sanitizeSettings, sanitizePresets, MAX_PRESETS } from './settings.js';

export const BACKUP_APP = 'file-renamer';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 2_000_000;
// kept on this PC, not part of the file: the update memory, what the user has already been told
const RUNTIME_KEYS = ['lastSeenVersion', 'updateState', 'migrated'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const dateStamp = (ms) => new Date(ms).toISOString().slice(0, 10);

export const backupFileName = (now = Date.now()) => `${BACKUP_APP}-backup-${dateStamp(now)}.json`;

// settings: the settings of the app. Returns the object to write as JSON.
export function buildExport(settings, { now = Date.now() } = {}) {
  const s = structuredClone(settings);
  for (const k of RUNTIME_KEYS) delete s[k];
  const presets = Array.isArray(s.presets) ? s.presets : [];
  delete s.presets;
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date(now).toISOString(), includesSecrets: false, settings: s, presets };
}

// Nothing in this app is a secret: the list of what to type again is always empty.
export const missingSecrets = () => [];

// raw: the text or the parsed object of the file. current: the settings now in use.
// mode: 'replace' (settings and presets from the file) | 'add' (only the presets this PC does not have).
// Returns { ok, settings, missing, added, mode } or { ok:false, error }.
export function prepareImport(raw, current, { mode = 'replace' } = {}) {
  let file = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_BACKUP_BYTES) return { ok: false, error: 'too-big' };
    try {
      file = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'invalid' };
    }
  }
  if (!isObj(file) || !isObj(file.settings)) return { ok: false, error: 'invalid' };
  if (file.app !== BACKUP_APP) return { ok: false, error: 'wrong-app' };

  const fromFile = structuredClone({ ...file.settings, presets: Array.isArray(file.presets) ? file.presets : file.settings.presets });
  for (const k of RUNTIME_KEYS) delete fromFile[k];
  const incoming = sanitizeSettings(fromFile);

  if (mode === 'add') {
    const have = new Set(current.presets.map((p) => p.id));
    const haveNames = new Set(current.presets.map((p) => p.name.toLowerCase()));
    const extra = incoming.presets.filter((p) => !have.has(p.id) && !haveNames.has(p.name.toLowerCase())).slice(0, Math.max(0, MAX_PRESETS - current.presets.length));
    const result = sanitizeSettings({ ...structuredClone(current), presets: sanitizePresets([...current.presets, ...extra]) });
    return { ok: true, settings: { ...result, lastSeenVersion: current.lastSeenVersion, updateState: current.updateState, migrated: current.migrated }, missing: [], added: extra.length, mode };
  }
  const result = incoming;
  for (const k of RUNTIME_KEYS) result[k] = current[k];
  return { ok: true, settings: result, missing: [], added: null, mode };
}
