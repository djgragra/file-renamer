import { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme, shell, net, clipboard } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AV_EXTENSIONS, buildPlan, sanitizeBase, isReservedName, MAX_NAME_LENGTH } from './src/planner.js';
import { applyRenames, buildLog, checkUndo } from './src/renamer.js';
import { checkForUpdate, pageUrl, downloadInstaller, sweepPartials, bannerState, remindLaterState, skipVersionState, makeSafetyCopy, installPlan, whatsNew, startupKind } from './src/updater.js';
import { createStore } from './src/settings.js';
import { buildExport, prepareImport, backupFileName, MAX_BACKUP_BYTES } from './src/backup.js';
import { createLogger } from './src/logger.js';
import { createMetaReader } from './src/metadata.js';
import { createUndoHistory } from './src/undo-history.js';
import { batchCsv, csvFileName } from './src/csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_FILES = 20000;
const EXTERNAL_OK = /^https:\/\/(onairgarage\.com|github\.com\/djgragra)(\/|$)/;

if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow = null;
let lastUpdateInfo = null;
let store = null;
let logger = null;
let busyOps = 0; // renames / undos in progress: "Close and install" is refused while this is above 0
let downloadedFile = null;
let downloadedFor = null;
let downloadAbort = null;
let pendingImport = null;
let startKind = 'same';
let history = null; // the undo history (src/undo-history.js)
let lastBatch = null; // the last batch of this session, with the failures: { time, rows }, for the CSV log
const metaReader = createMetaReader();

const settings = () => store.get();
const send = (channel, ...args) => mainWindow?.webContents.send(channel, ...args);


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 640,
    minHeight: 480,
    title: 'File Renamer',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1311' : '#f4f6f4',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL_OK.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  store = createStore({ file: path.join(app.getPath('userData'), 'settings.json') });
  logger = createLogger({ dir: path.join(app.getPath('userData'), 'logs'), retentionDays: 7 });
  logger.prune();
  history = createUndoHistory({ file: path.join(app.getPath('userData'), 'undo-history.json'), legacyFile: path.join(app.getPath('userData'), 'last-batch.json') });
  logger.log('info', `File Renamer ${app.getVersion()} started (${process.platform} ${process.arch})`);
  const stale = sweepPartials(app.getPath('downloads'));
  if (stale.length) logger.log('info', `removed ${stale.length} unfinished installer download(s) left by an earlier run`);
  announceStartup();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (err) => { logger?.log('error', `uncaught: ${err.message}`); });
process.on('unhandledRejection', (err) => { logger?.log('error', `unhandled: ${err?.message || err}`); });

// ---- Files ----------------------------------------------------------------------------------

const AV_SET = new Set(AV_EXTENSIONS);

async function describe(p) {
  const st = await fsp.lstat(p);
  if (!st.isFile()) return null; // folders, symlinks and devices are never renamed
  return { path: p, name: path.basename(p), dir: path.dirname(p), size: st.size, mtimeMs: Math.round(st.mtimeMs) };
}

async function scanDir(dir, { recursive, avOnly }, out) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    out.unreadable++;
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const e of entries) {
    if (out.files.length >= MAX_FILES) { out.truncated = true; return; }
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) await scanDir(full, { recursive, avOnly }, out);
    } else if (e.isFile()) {
      if (avOnly && !AV_SET.has(path.extname(e.name).slice(1).toLowerCase())) { out.filtered++; continue; }
      const d = await describe(full).catch(() => null);
      if (d) out.files.push(d);
    }
  }
}

async function expandPaths(paths, opts = {}) {
  const out = { files: [], filtered: 0, unreadable: 0, truncated: false };
  for (const p of paths) {
    if (typeof p !== 'string' || !path.isAbsolute(p)) continue;
    let st;
    try { st = await fsp.lstat(p); } catch { out.unreadable++; continue; }
    if (st.isDirectory()) await scanDir(p, { recursive: !!opts.recursive, avOnly: opts.avOnly !== false }, out);
    else if (st.isFile()) { const d = await describe(p); if (d) out.files.push(d); }
    if (out.files.length >= MAX_FILES) { out.truncated = true; break; }
  }
  return out;
}

ipcMain.handle('files:expand', (_e, paths, opts) => expandPaths(Array.isArray(paths) ? paths : [], opts));

ipcMain.handle('files:pick', async (_e, kind, opts = {}) => {
  const folder = kind === 'folder';
  const res = await dialog.showOpenDialog(mainWindow, {
    properties: folder ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
    filters: folder ? undefined : [
      { name: 'Audio / Video', extensions: AV_EXTENSIONS },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (res.canceled) return { files: [], filtered: 0, unreadable: 0, truncated: false };
  return expandPaths(res.filePaths, opts);
});

// ---- Plan and rename ------------------------------------------------------------------------

ipcMain.handle('plan:build', (_e, files, opts = {}) => {
  const list = (Array.isArray(files) ? files : []).filter((f) => f && typeof f.path === 'string');
  return buildPlan(list.map((f) => ({ path: f.path, selected: !!f.selected })), {
    pattern: opts.pattern,
    seqStart: Number(opts.seqStart),
    seqStep: Number(opts.seqStep),
    seed: Number(opts.seed) || 1,
    find: opts.find,
    clean: opts.clean,
    ext: opts.ext,
    readMeta: (file) => metaReader.read(file),
    now: new Date(),
    env: process.env
  });
});

// Last check before touching the disk: the name must be a plain, valid file name in the same
// folder. Whether the target is free is checked again by the rename itself (never overwrites).
function validTarget(item) {
  if (!item || typeof item.path !== 'string' || typeof item.newName !== 'string') return false;
  const n = item.newName;
  if (!n || n !== path.basename(n) || n.length > MAX_NAME_LENGTH || isReservedName(n)) return false;
  const dot = n.lastIndexOf('.');
  const base = dot > 0 ? n.slice(0, dot) : n;
  return !sanitizeBase(base).changed;
}

ipcMain.handle('rename:apply', async (_e, items) => {
  const list = Array.isArray(items) ? items : [];
  const results = [];
  const pairs = [];
  const index = [];
  list.forEach((it, i) => {
    if (!validTarget(it)) { results[i] = { from: it?.path, to: null, ok: false, error: 'invalid' }; return; }
    pairs.push({ from: it.path, to: path.join(path.dirname(it.path), it.newName) });
    index.push(i);
  });
  busyOps++;
  let done;
  try {
    done = await applyRenames(pairs);
  } finally {
    busyOps--;
  }
  done.forEach((r, k) => { results[index[k]] = r; });
  logger.log('info', `rename: ${done.filter((r) => r.ok).length} renamed, ${results.filter((r) => r && !r.ok).length} failed`);
  const log = await buildLog(results.filter(Boolean));
  lastBatch = { time: log.createdAt, rows: results.filter(Boolean).map((r) => ({ from: r.from, to: r.to, ok: !!r.ok, error: r.error || null })) };
  if (log.entries.length) await history.push(log).catch((err) => logger.log('error', `undo history not saved: ${err.message}`));
  return results;
});

ipcMain.handle('undo:info', async () => {
  const i = await history.info();
  return i ? { available: true, count: i.entries, createdAt: i.createdAt, batches: i.batches } : { available: false, batches: 0 };
});

ipcMain.handle('undo:check', async () => {
  const [log, info] = [await history.top(), await history.info()];
  if (!log) return { runnable: 0, problems: [], batches: 0 };
  const { runnable, problems } = await checkUndo(log);
  return { runnable: runnable.length, batches: info.batches, createdAt: log.createdAt, problems: problems.map((p) => ({ from: p.entry.from, to: p.entry.to, error: p.error })) };
});

ipcMain.handle('undo:run', async () => {
  const log = await history.top();
  if (!log) return { results: [] };
  const { runnable, problems } = await checkUndo(log);
  busyOps++;
  let results;
  try {
    results = await applyRenames(runnable);
  } finally {
    busyOps--;
  }
  logger.log('info', `undo: ${results.filter((r) => r.ok).length} restored, ${problems.length} skipped`);
  // Only the entries that were not restored stay in the batch, so a second try can finish the job.
  await history.settleTop(new Set(results.filter((r) => r.ok).map((r) => r.from))).catch((err) => logger.log('error', `undo history not saved: ${err.message}`));
  return { results, problems: problems.map((p) => ({ from: p.entry.from, to: p.entry.to, error: p.error })) };
});

// "Forget this batch": for a batch that can no longer be undone (files moved or edited since) and blocks the ones before it.
ipcMain.handle('undo:forget', async () => {
  await history.dropTop();
  logger.log('info', 'undo: newest batch forgotten');
  return true;
});

// ---- CSV log of the last batch, and the preview on the clipboard ---------------------------------------------

// The batch of this session (with the files that failed); after a restart, the newest batch of the undo history.
ipcMain.handle('batchlog:save', async () => {
  let rows = lastBatch?.rows;
  let time = lastBatch?.time;
  if (!rows?.length) {
    const top = await history.top();
    if (top) { rows = top.entries.map((e) => ({ from: e.from, to: e.to, ok: true })); time = top.createdAt; }
  }
  if (!rows?.length) return { ok: false, error: 'none' };
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('documents'), csvFileName()),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (res.canceled || !res.filePath) return { ok: false, cancelled: true };
  try {
    await fsp.writeFile(res.filePath, batchCsv(rows, time), 'utf8');
    logger.log('info', `batch log saved (${rows.length} rows)`);
    return { ok: true, file: path.basename(res.filePath), rows: rows.length };
  } catch (err) {
    logger.log('error', `batch log failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('clipboard:copy', (_e, text) => {
  if (typeof text !== 'string' || !text || text.length > 5_000_000) return false;
  clipboard.writeText(text);
  return true;
});

ipcMain.handle('open-page', () => {
  shell.openExternal(pageUrl(undefined, settings().language));
});

// ---- App, settings ----------------------------------------------------------------------------

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  logsDir: path.join(app.getPath('userData'), 'logs')
}));

ipcMain.handle('settings:get', () => settings());
ipcMain.handle('settings:update', (_e, patch) => store.update(patch));

ipcMain.handle('open-external', (_e, url) => {
  if (typeof url === 'string' && EXTERNAL_OK.test(url)) shell.openExternal(url);
});

ipcMain.handle('logs:open-folder', () => shell.openPath(path.join(app.getPath('userData'), 'logs')));

// Help & About: what to send to whoever helps. Never settings values, file names or folders the user chose.
function supportInfo() {
  const s = settings();
  const u = s.updateState.lastCheck;
  const lastError = logger.entries().filter((e) => e.level === 'error').at(-1);
  const home = os.homedir();
  const tidy = (v) => String(v || '').split(home).join('~');
  return [
    `File Renamer ${app.getVersion()}`,
    `Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · Node ${process.versions.node}`,
    `System: ${process.platform} ${os.release()} ${process.arch}`,
    `Language: ${s.language} · Theme: ${s.theme}`,
    `Presets: ${s.presets.length}`,
    `Last update check: ${u ? `${new Date(u.at).toISOString()} (${u.ok ? 'ok' : tidy(u.error || 'failed')})` : 'never'}`,
    `Last error: ${lastError ? `${new Date(lastError.t).toISOString()} ${tidy(lastError.message).slice(0, 160)}` : 'none'}`
  ].join('\n');
}
ipcMain.handle('app:copy-support-info', () => {
  const text = supportInfo();
  clipboard.writeText(text);
  return text;
});

// ---- Backup (apps/COMMON-FEATURES.md, section 3) ----------------------------------------------

ipcMain.handle('backup:export', async () => {
  const res = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('documents'), backupFileName()),
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (res.canceled || !res.filePath) return { ok: false, cancelled: true };
  try {
    await fsp.writeFile(res.filePath, JSON.stringify(buildExport(settings()), null, 1), 'utf8');
    logger.log('info', 'backup exported');
    return { ok: true, file: path.basename(res.filePath) };
  } catch (err) {
    logger.log('error', `backup export failed: ${err.message}`);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('backup:import-pick', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (res.canceled || !res.filePaths[0]) return { ok: false, cancelled: true };
  try {
    const st = await fsp.stat(res.filePaths[0]);
    if (st.size > MAX_BACKUP_BYTES) return { ok: false, error: 'too-big' };
    const raw = await fsp.readFile(res.filePaths[0], 'utf8');
    const plan = prepareImport(raw, settings());
    if (!plan.ok) return { ok: false, error: plan.error };
    pendingImport = raw;
    const have = new Set(settings().presets.map((p) => p.id));
    return { ok: true, presets: plan.settings.presets.length, newPresets: plan.settings.presets.filter((p) => !have.has(p.id)).length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('backup:import-apply', (_e, mode) => {
  if (!pendingImport) return { ok: false, error: 'invalid' };
  const plan = prepareImport(pendingImport, settings(), { mode: mode === 'add' ? 'add' : 'replace' });
  pendingImport = null;
  if (!plan.ok) return { ok: false, error: plan.error };
  const next = store.replace(plan.settings);
  logger.log('info', `backup imported (${plan.mode})`);
  return { ok: true, settings: next, added: plan.added, missing: plan.missing };
});

ipcMain.handle('backup:import-cancel', () => { pendingImport = null; return true; });

// ---- Guided update (apps/COMMON-FEATURES.md, section 4) ----------------------------------------

// what the page may know: the installer's name and size, never a URL
const publicInfo = (info) => info && { ...info, installer: info.installer ? { name: info.installer.name, size: info.installer.size } : null, sumsUrl: undefined };
const updateView = (info) => ({
  info: publicInfo(info),
  banner: bannerState(info, settings().updateState),
  lastCheck: settings().updateState.lastCheck,
  downloaded: downloadedFile && info?.available ? path.basename(downloadedFile) : null
});
const setUpdateState = (patch) => store.update({ updateState: { ...settings().updateState, ...patch } });

ipcMain.handle('update:check', async () => {
  const info = await checkForUpdate({ current: app.getVersion(), fetchFn: net.fetch });
  lastUpdateInfo = info.ok ? info : null;
  if (downloadedFor && (!info.ok || info.latest !== downloadedFor)) { downloadedFile = null; downloadedFor = null; } // a newer release came out: download again
  setUpdateState({ lastCheck: { at: Date.now(), ok: !!info.ok, error: info.ok ? '' : String(info.error || '') } });
  return updateView(info);
});

ipcMain.handle('update:download', async () => {
  if (!lastUpdateInfo?.available) return { ok: false, error: 'no-update' };
  if (downloadAbort) return { ok: false, error: 'busy' };
  sweepPartials(app.getPath('downloads')); // a .part left by a download that was cut off earlier goes first
  downloadAbort = new AbortController();
  try {
    downloadedFile = await downloadInstaller({
      info: lastUpdateInfo,
      dir: app.getPath('downloads'),
      fetchFn: net.fetch,
      current: app.getVersion(),
      signal: downloadAbort.signal,
      onProgress: (received, total) => send('update:progress', received, total)
    });
    downloadedFor = lastUpdateInfo.latest;
    logger.log('info', `update ${lastUpdateInfo.latest} downloaded and verified (SHA-256)`);
    return { ok: true, file: path.basename(downloadedFile) };
  } catch (err) {
    downloadedFile = null;
    downloadedFor = null;
    const cancelled = downloadAbort?.signal.aborted;
    if (!cancelled) logger.log('warn', `update download failed: ${err.message}`);
    return { ok: false, error: cancelled ? 'cancelled' : err.message };
  } finally {
    downloadAbort = null;
  }
});
ipcMain.handle('update:cancel', () => { downloadAbort?.abort(); return true; });

ipcMain.handle('update:remind', () => { setUpdateState(remindLaterState(settings().updateState)); return updateView(lastUpdateInfo); });
ipcMain.handle('update:skip', () => { setUpdateState(skipVersionState(settings().updateState, lastUpdateInfo?.latest)); return updateView(lastUpdateInfo); });

// "Close and install": refused while a rename is in progress; a safety copy of the settings first
ipcMain.handle('update:install', () => {
  if (!downloadedFile || !fs.existsSync(downloadedFile)) return { ok: false, error: 'no-file' };
  if (busyOps > 0) return { ok: false, error: 'busy' };
  try {
    makeSafetyCopy({ file: store.file, dir: path.join(app.getPath('userData'), 'backups'), version: lastUpdateInfo?.current || app.getVersion() });
  } catch (err) {
    return { ok: false, error: `safety copy: ${err.message}` };
  }
  const plan = installPlan(process.platform, downloadedFile);
  logger.log('info', `installing update ${lastUpdateInfo?.latest || ''} (${plan.kind})`);
  if (plan.kind === 'run-installer') {
    spawn(plan.file, [], { detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.quit(), 300);
  } else if (plan.kind === 'open-image') shell.openPath(plan.file);
  else shell.showItemInFolder(plan.file);
  return { ok: true, kind: plan.kind, hint: plan.hint || null, quit: plan.quit };
});

ipcMain.handle('update:reveal', () => {
  if (downloadedFile && fs.existsSync(downloadedFile)) shell.showItemInFolder(downloadedFile);
});

// After a start of a newer version: the window with what changed, once
function announceStartup() {
  startKind = startupKind(settings().lastSeenVersion, app.getVersion(), store.hadFile());
  if (startKind === 'first') store.update({ lastSeenVersion: app.getVersion() });
}
ipcMain.handle('whatsnew:get', () => {
  if (startKind !== 'updated') return null;
  let text = '';
  try { text = fs.readFileSync(path.join(__dirname, 'CHANGELOG.md'), 'utf8'); } catch { /* not packaged */ }
  return whatsNew(text, app.getVersion()) || { version: app.getVersion(), date: '', bullets: [] };
});
ipcMain.handle('whatsnew:seen', () => { startKind = 'same'; store.update({ lastSeenVersion: app.getVersion() }); return true; });
