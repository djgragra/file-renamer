// Screenshots of the real app for the site and the README. The content is invented (made-up file names in a
// temporary folder): no real recordings, no real paths.
// Run: node dev/make-screenshots.mjs [outputDir]      (opens the app for a few seconds; needs `npm install`)
//   on a server without a screen: FR_E2E_NO_SANDBOX=1 xvfb-run -a node dev/make-screenshots.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || path.join(root, 'docs', 'screenshots'));
fs.mkdirSync(outDir, { recursive: true });
const electron = path.join(root, 'node_modules', '.bin', 'electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const demo = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-shot-'));
const day = path.join(demo, 'Tappa 3 - Arrivo');
fs.mkdirSync(day);
const NAMES = ['Intervista vincitore (1).wav', 'Intervista presidente copy.wav', 'Ambiente arrivo traguardo.wav', 'Commento finale.wav', 'Jingle apertura.mp3', 'Interviste squadra - Città.wav'];
NAMES.forEach((n, i) => { fs.writeFileSync(path.join(day, n), 'x'.repeat(100 + i)); const t = new Date(2026, 9, 12, 14, 5 + i * 7); fs.utimesSync(path.join(day, n), t, t); });

function run(theme, language, settings, shots) {
  return (async () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'fr-shot-ud-'));
    fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ version: 1, settings: { language, theme, migrated: true, lastSeenVersion: '26.10.2', ...settings } }));
    const port = 9800 + Math.floor(Math.random() * 150);
    const child = spawn(electron, [root, ...(process.env.FR_E2E_NO_SANDBOX ? ['--no-sandbox'] : []), `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`], { stdio: 'ignore' });
    try {
      let page;
      for (let i = 0; i < 80 && !page; i++) {
        try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page' && t.url.includes('index.html')); } catch { /* not yet */ }
        if (!page) await sleep(250);
      }
      const ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((r) => ws.addEventListener('open', r));
      let id = 0;
      const pend = new Map();
      ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result); pend.delete(d.id); } });
      const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
      const ev = async (e) => (await cdp('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 2, mobile: false });
      await sleep(1200);
      // drop the demo files as the file manager would
      const files = NAMES.map((n) => path.join(day, n));
      for (const type of ['dragEnter', 'dragOver', 'drop']) await cdp('Input.dispatchDragEvent', { type, x: 400, y: 500, data: { items: [], files, dragOperationsMask: 1 } });
      await sleep(900);
      for (const shot of shots) {
        if (shot.js) await ev(shot.js);
        await sleep(shot.wait || 500);
        const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, shot.name), Buffer.from(data, 'base64'));
        console.log('wrote', shot.name);
      }
      ws.close();
    } finally {
      child.kill();
      await new Promise((r) => (child.exitCode === null ? child.once('exit', r) : r()));
      fs.rmSync(userData, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  })();
}

const tools = { find: { text: ' copy', replace: '', regex: false, caseSensitive: false }, clean: { case: 'lower', spaces: 'underscore', accents: true, special: true } };
const presets = [{ id: 'p1', name: 'Giro - interviste', pattern: '{mdate:yyyyMMdd}_{seq:2}_{orig}', seqStart: 1, seqStep: 1, find: tools.find, clean: tools.clean }, { id: 'p2', name: 'Per il playout', pattern: '{parent}_{seq:3}', seqStart: 1, seqStep: 1 }];

// 1. the list with the preview (dark), pattern with {parent}, find & replace and clean up open
await run('dark', 'en', { pattern: '{parent}_{mdate:yyyyMMdd}_{orig}', ...tools, presets }, [
  { name: 'main-dark.png', js: "document.getElementById('presetSel').value = 'p1'; document.getElementById('tools').open = true;" }
]);
// 2. light theme, Italian, Settings → Help & About
await run('light', 'it', { pattern: '{mdate:yyyyMMdd}_{seq:2}_{orig}', presets }, [
  { name: 'main-light.png' },
  { name: 'settings-about.png', js: "document.getElementById('setBtn').click(); document.querySelector('#setDlg .tab[data-tab=about]').click();" }
]);
fs.rmSync(demo, { recursive: true, force: true });
console.log('done:', outDir);
