// Browser-only stand-in for the Electron preload (window.api), used by dev/preview.html to look at
// the interface in a normal browser. The planner here is a rough imitation, not the real one.
(function () {
  var names = ['Interview 01.wav', 'interview_02.WAV', 'jingle morning.mp3', 'jingle-evening.mp3', 'news:flash.wav', 'promo_final_v3.mp4', 'nul.wav', 'Clip.wav'];
  var listeners = [];
  window.api = {
    platform: 'darwin',
    info: function () { return Promise.resolve({ version: '26.10.1', platform: 'darwin' }); },
    pathForFile: function (f) { return '/Volumes/Audio/' + f.name; },
    files: {
      pick: function () { return Promise.resolve({ files: names.map(function (n, i) { return { path: '/Volumes/Audio/Radio/' + n, name: n, dir: '/Volumes/Audio/Radio', size: 1000 + i, mtimeMs: 1700000000000 + i * 1000 }; }), filtered: 2, unreadable: 0, truncated: false }); },
      expand: function () { return window.api.files.pick(); }
    },
    plan: function (files, o) {
      var k = 0;
      return Promise.resolve(files.map(function (f) {
        var name = f.path.split('/').pop();
        if (!f.selected) return { path: f.path, newName: name, status: 'skipped', reasons: [], notes: [] };
        var dot = name.lastIndexOf('.'), base = name.slice(0, dot), ext = name.slice(dot);
        var nn = o.pattern.replace('{orig}', base).replace(/\{seq:3\}/, String(o.seqStart + o.seqStep * k++).padStart(3, '0')).replace(/\{date:yyyyMMdd\}/, '20261001');
        var notes = [], reasons = [];
        if (/[:]/.test(nn)) { nn = nn.replace(/:/g, '_'); notes.push('sanitized'); }
        if (/^nul/i.test(nn)) reasons.push('reserved');
        if (name === 'Clip.wav') reasons.push('exists');
        var st = reasons.length ? 'error' : (nn + ext === name ? 'unchanged' : 'ok');
        return { path: f.path, newName: nn + ext, status: st, reasons: reasons, notes: notes };
      }));
    },
    rename: function (items) { return Promise.resolve(items.map(function (i) { return { from: i.path, to: i.path.replace(/[^/]+$/, i.newName), ok: true }; })); },
    undo: { info: function () { return Promise.resolve({ available: true, count: 3, createdAt: new Date().toISOString() }); }, check: function () { return Promise.resolve({ runnable: 2, problems: [{ from: '/a', to: '/x/b.wav', error: 'changed' }] }); }, run: function () { return Promise.resolve({ results: [] }); } },
    update: { check: function () { return Promise.resolve({ ok: true, current: '26.10.1', available: false, noRelease: true }); }, download: function () { return Promise.resolve({ ok: false, error: 'mock' }); }, reveal: function () {}, onProgress: function (cb) { listeners.push(cb); } },
    openExternal: function () {}
  };
})();
