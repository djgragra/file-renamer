import { app, BrowserWindow, Menu, ipcMain, dialog, nativeTheme, shell } from 'electron';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { AV_EXTENSIONS, buildPlan, sanitizeBase, isReservedName, MAX_NAME_LENGTH } from './src/planner.js';
import { applyRenames, buildLog, checkUndo } from './src/renamer.js';
import { checkForUpdate, downloadInstaller } from './src/updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_FILES = 20000;
const EXTERNAL_OK = /^https:\/\/(onairgarage\.com|github\.com\/djgragra)(\/|$)/;

if (!app.requestSingleInstanceLock()) app.quit();

let mainWindow = null;
let lastUpdateInfo = null;

const undoFile = () => path.join(app.getPath('userData'), 'last-batch.json');

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
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); }
});
app.on('window-all-closed', () => app.quit());

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
  const done = await applyRenames(pairs);
  done.forEach((r, k) => { results[index[k]] = r; });
  const log = await buildLog(results.filter(Boolean));
  if (log.entries.length) await fsp.writeFile(undoFile(), JSON.stringify(log), 'utf8').catch(() => {});
  return results;
});

async function readLog() {
  try {
    const log = JSON.parse(await fsp.readFile(undoFile(), 'utf8'));
    return log && log.version === 1 && Array.isArray(log.entries) ? log : null;
  } catch {
    return null;
  }
}

ipcMain.handle('undo:info', async () => {
  const log = await readLog();
  return log && log.entries.length ? { available: true, count: log.entries.length, createdAt: log.createdAt } : { available: false };
});

ipcMain.handle('undo:check', async () => {
  const log = await readLog();
  if (!log) return { runnable: 0, problems: [] };
  const { runnable, problems } = await checkUndo(log);
  return { runnable: runnable.length, problems: problems.map((p) => ({ from: p.entry.from, to: p.entry.to, error: p.error })) };
});

ipcMain.handle('undo:run', async () => {
  const log = await readLog();
  if (!log) return { results: [] };
  const { runnable, problems } = await checkUndo(log);
  const results = await applyRenames(runnable);
  // Keep in the log only the entries that were not restored, so a second try can finish the job.
  const restored = new Set(results.filter((r) => r.ok).map((r) => r.from));
  const rest = log.entries.filter((e) => !restored.has(e.to));
  if (rest.length) await fsp.writeFile(undoFile(), JSON.stringify({ ...log, entries: rest }), 'utf8').catch(() => {});
  else await fsp.rm(undoFile(), { force: true });
  return { results, problems: problems.map((p) => ({ from: p.entry.from, to: p.entry.to, error: p.error })) };
});

// ---- App, updates ---------------------------------------------------------------------------

ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));

ipcMain.handle('open-external', (_e, url) => {
  if (typeof url === 'string' && EXTERNAL_OK.test(url)) shell.openExternal(url);
});

ipcMain.handle('update:check', async () => {
  const info = await checkForUpdate();
  lastUpdateInfo = info.ok ? info : null;
  return { ...info, installer: info.installer ? { name: info.installer.name, size: info.installer.size } : null };
});

ipcMain.handle('update:download', async () => {
  if (!lastUpdateInfo?.available) return { ok: false, error: 'no-update' };
  try {
    const file = await downloadInstaller(lastUpdateInfo, app.getPath('downloads'), (received, total) => {
      mainWindow?.webContents.send('update:progress', received, total);
    });
    return { ok: true, file };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('update:reveal', (_e, file) => {
  if (typeof file === 'string' && path.dirname(file) === app.getPath('downloads')) shell.showItemInFolder(file);
});
