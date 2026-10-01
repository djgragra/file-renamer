// End-to-end check of the real app: starts Electron with a debugging port, drives the window
// through the DevTools protocol and verifies the files on disk.
// Run: node dev/e2e-electron.mjs   (needs `npm install`; opens a window for a few seconds)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electron = path.join(root, 'node_modules', '.bin', 'electron');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-e2e-'));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-e2e-ud-'));
for (const n of ['b.wav', 'a.wav', 'c.mp3', 'notes.txt']) fs.writeFileSync(path.join(dir, n), n);

const port = 9300 + Math.floor(Math.random() * 500);
const child = spawn(electron, [root, `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { stdio: 'ignore', env: { ...process.env, FR_E2E_ENV: "RTL" } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('renderer/index.html'));
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('window not found');
}

let ws, id = 0;
const pending = new Map();
async function cdp(method, params = {}) {
  return new Promise((resolve, reject) => {
    const my = ++id;
    pending.set(my, { resolve, reject });
    ws.send(JSON.stringify({ id: my, method, params }));
  });
}
const evalJs = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

try {
  const page = await target();
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.reject(new Error(d.error.message)) : p.resolve(d.result); }
  });
  await sleep(500);

  // folder scan with the audio/video filter: notes.txt must be left out
  const scan = await evalJs(`api.files.expand([${JSON.stringify(dir)}], {recursive:false, avOnly:true})`);
  assert.deepEqual(scan.files.map((f) => f.name), ['a.wav', 'b.wav', 'c.mp3']);
  assert.equal(scan.filtered, 1);

  // plan through the real IPC, with {env}
  const files = scan.files.map((f) => ({ path: f.path, selected: true }));
  const plan = await evalJs(`api.plan(${JSON.stringify(files)}, {pattern:'{env:FR_E2E_ENV}_{seq:2}_{orig}', seqStart:5, seqStep:1, seed:1})`);
  assert.deepEqual(plan.map((r) => r.newName), ['RTL_05_a.wav', 'RTL_06_b.wav', 'RTL_07_c.mp3']);

  // rename, then undo
  const items = plan.map((r) => ({ path: r.path, newName: r.newName }));
  const res = await evalJs(`api.rename(${JSON.stringify(items)})`);
  assert.ok(res.every((r) => r.ok), JSON.stringify(res));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['RTL_05_a.wav', 'RTL_06_b.wav', 'RTL_07_c.mp3', 'notes.txt']);
  assert.equal((await evalJs('api.undo.info()')).count, 3);

  // the main process refuses names that are not plain file names
  const bad = await evalJs(`api.rename([{path:${JSON.stringify(path.join(dir, 'notes.txt'))}, newName:'../x.txt'}])`);
  assert.equal(bad[0].error, 'invalid');

  const undo = await evalJs('api.undo.run()');
  assert.ok(undo.results.every((r) => r.ok));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['a.wav', 'b.wav', 'c.mp3', 'notes.txt']);
  assert.equal((await evalJs('api.undo.info()')).available, false);

  console.log('e2e OK');
} finally {
  ws?.close();
  child.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(userData, { recursive: true, force: true });
}
