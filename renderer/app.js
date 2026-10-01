/* File Renamer — renderer. © 2026 Graziano Melzi · OnAir Garage — MIT License */
(function () {
  "use strict";

  var KEY = "com.onairgarage.filerenamer.";
  var api = window.api;
  var $ = function (id) { return document.getElementById(id); };

  function load(k, d) { try { var v = localStorage.getItem(KEY + k); return v === null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(KEY + k, v); } catch (e) { /* ignore */ } }

  // ---- State -------------------------------------------------------------------------------
  var lang = load("lang", "en");               // always opens in English until the user changes it
  if (!I18N.LANGS[lang]) lang = "en";
  var t = I18N.make(lang);
  var state = {
    files: [],          // { path, name, dir, size, mtimeMs, selected, added }
    plan: [],           // rows from main, same order as files (empty when the pattern is empty)
    seed: (Math.random() * 4294967296) >>> 0,
    sort: "added",
    reqId: 0,
    counter: 0,
    rowEls: [],
    busy: false
  };
  var planTimer = null;
  var pendingUpdate = null;

  // ---- i18n and theme ----------------------------------------------------------------------
  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) { el.title = t(el.getAttribute("data-i18n-title")); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    document.title = t("app.title");
    paint();
  }

  function applyTheme(mode) {
    if (mode === "light" || mode === "dark") document.documentElement.setAttribute("data-theme", mode);
    else document.documentElement.removeAttribute("data-theme");
  }

  var langSel = $("langSel");
  Object.keys(I18N.LANGS).forEach(function (code) {
    var o = document.createElement("option");
    o.value = code; o.textContent = I18N.LANGS[code];
    langSel.appendChild(o);
  });
  langSel.value = lang;
  langSel.addEventListener("change", function () {
    lang = langSel.value; save("lang", lang); t = I18N.make(lang); applyI18n(); renderList();
  });
  var themeSel = $("themeSel");
  var theme = load("theme", "auto");
  themeSel.value = theme; applyTheme(theme);
  themeSel.addEventListener("change", function () { theme = themeSel.value; save("theme", theme); applyTheme(theme); });

  // ---- Toasts and dialogs ------------------------------------------------------------------
  function toast(msg, ms) {
    var el = document.createElement("div");
    el.className = "toast"; el.textContent = msg;
    $("toasts").appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 5000);
  }
  function openDlg(id) { var d = $(id); if (!d.open) d.showModal(); return d; }
  function closeDlg(id) { var d = $(id); if (d.open) d.close(); }

  function baseName(p) { return p.split(/[\\/]/).pop(); }
  function dirName(p) { var i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")); return i > 0 ? p.slice(0, i) : p; }

  // ---- Settings ----------------------------------------------------------------------------
  var patternEl = $("pattern");
  var seqStartEl = $("seqStart");
  var seqStepEl = $("seqStep");
  patternEl.value = load("pattern", patternEl.value);
  seqStartEl.value = load("seqStart", "1");
  seqStepEl.value = load("seqStep", "1");
  $("optRecursive").checked = load("recursive", "0") === "1";
  $("optAv").checked = load("avonly", "1") === "1";
  $("updAuto").checked = load("updauto", "1") === "1";

  function recentPatterns() { try { return JSON.parse(load("recent", "[]")) || []; } catch (e) { return []; } }
  function rememberPattern(p) {
    if (!p.trim()) return;
    var list = recentPatterns().filter(function (x) { return x !== p; });
    list.unshift(p);
    save("recent", JSON.stringify(list.slice(0, 8)));
    fillRecent();
  }
  function fillRecent() {
    var dl = $("recent");
    dl.textContent = "";
    recentPatterns().forEach(function (p) { var o = document.createElement("option"); o.value = p; dl.appendChild(o); });
  }
  fillRecent();

  function scanOpts() { return { recursive: $("optRecursive").checked, avOnly: $("optAv").checked }; }
  $("optRecursive").addEventListener("change", function () { save("recursive", this.checked ? "1" : "0"); });
  $("optAv").addEventListener("change", function () { save("avonly", this.checked ? "1" : "0"); });

  // ---- Plan --------------------------------------------------------------------------------
  function numVal(el, d) { var n = parseInt(el.value, 10); return isFinite(n) ? n : d; }

  function schedulePlan() {
    clearTimeout(planTimer);
    planTimer = setTimeout(runPlan, 100);
  }

  function runPlan() {
    var pattern = patternEl.value;
    var unknown = /\{([a-zA-Z]+)(?:[+-]\d+[mhd])?(?::[^}]*)?\}/g, bad = [], m;
    while ((m = unknown.exec(pattern))) if (["date", "time", "mdate", "mtime", "seq", "rand", "env", "orig"].indexOf(m[1]) === -1) bad.push(m[0]);
    var warn = $("patWarn");
    warn.hidden = !bad.length;
    warn.textContent = bad.length ? t("warn.unknown", { list: bad.join(" ") }) : "";

    var id = ++state.reqId;
    if (!state.files.length || !pattern.trim()) { state.plan = []; paint(); return Promise.resolve(); }
    var files = state.files.map(function (f) { return { path: f.path, selected: f.selected }; });
    return api.plan(files, { pattern: pattern, seqStart: numVal(seqStartEl, 1), seqStep: numVal(seqStepEl, 1), seed: state.seed })
      .then(function (rows) { if (id === state.reqId) { state.plan = rows; paint(); } });
  }

  patternEl.addEventListener("input", function () { save("pattern", patternEl.value); schedulePlan(); });
  patternEl.addEventListener("change", function () { rememberPattern(patternEl.value); });
  [seqStartEl, seqStepEl].forEach(function (el) {
    el.addEventListener("input", function () { save(el.id, el.value); schedulePlan(); });
  });
  $("rerollBtn").addEventListener("click", function () { state.seed = (Math.random() * 4294967296) >>> 0; schedulePlan(); });

  document.querySelectorAll(".chip").forEach(function (chip) {
    chip.addEventListener("click", function () {
      var ins = chip.getAttribute("data-ins");
      var s = patternEl.selectionStart, e = patternEl.selectionEnd;
      if (s === null || s === undefined) { s = e = patternEl.value.length; }
      patternEl.value = patternEl.value.slice(0, s) + ins + patternEl.value.slice(e);
      var pos = s + ins.length;
      patternEl.focus();
      patternEl.setSelectionRange(pos, pos);
      save("pattern", patternEl.value);
      schedulePlan();
    });
  });

  // ---- List --------------------------------------------------------------------------------
  function addFiles(res) {
    if (!res) return;
    var known = {};
    state.files.forEach(function (f) { known[f.path] = true; });
    var added = 0;
    res.files.forEach(function (f) {
      if (known[f.path]) return;
      known[f.path] = true;
      f.selected = true; f.added = state.counter++;
      state.files.push(f); added++;
    });
    if (res.filtered) toast(t("scan.filtered", { n: res.filtered }));
    if (res.unreadable) toast(t("scan.unreadable", { n: res.unreadable }));
    if (res.truncated) toast(t("scan.truncated"));
    if (added) { applySort(); renderList(); schedulePlan(); }
  }

  function applySort() {
    var by = {
      added: function (a, b) { return a.added - b.added; },
      nameAsc: function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }) || a.added - b.added; },
      nameDesc: function (a, b) { return b.name.localeCompare(a.name, undefined, { numeric: true }) || a.added - b.added; },
      modified: function (a, b) { return a.mtimeMs - b.mtimeMs || a.added - b.added; }
    };
    state.files.sort(by[state.sort] || by.added);
  }

  $("sortSel").addEventListener("change", function () {
    state.sort = this.value; applySort(); renderList(); schedulePlan();
  });

  function renderList() {
    var rows = $("rows");
    rows.textContent = "";
    state.rowEls = [];
    document.body.classList.toggle("has-files", state.files.length > 0);
    $("listHead").hidden = !state.files.length;
    var frag = document.createDocumentFragment();
    state.files.forEach(function (f, i) {
      var row = document.createElement("div");
      row.className = "row";
      var chkWrap = document.createElement("label");
      chkWrap.className = "cell-check";
      var chk = document.createElement("input");
      chk.type = "checkbox"; chk.checked = f.selected;
      chk.setAttribute("aria-label", f.name);
      chk.addEventListener("change", function () { f.selected = chk.checked; schedulePlan(); paint(); });
      chkWrap.appendChild(chk);
      var idx = document.createElement("span");
      idx.className = "cell-idx"; idx.textContent = String(i + 1);
      var cur = document.createElement("div");
      cur.className = "cur";
      var n1 = document.createElement("div"); n1.className = "name"; n1.textContent = f.name; n1.title = f.path;
      var d1 = document.createElement("span"); d1.className = "dir"; d1.textContent = f.dir;
      cur.appendChild(n1); cur.appendChild(d1);
      var arrow = document.createElement("span");
      arrow.className = "arrow"; arrow.textContent = "→"; arrow.setAttribute("aria-hidden", "true");
      var nw = document.createElement("div");
      nw.className = "new";
      var n2 = document.createElement("div"); n2.className = "name";
      nw.appendChild(n2);
      var st = document.createElement("div");
      st.className = "status";
      [chkWrap, idx, cur, arrow, nw, st].forEach(function (el) { row.appendChild(el); });
      frag.appendChild(row);
      state.rowEls.push({ row: row, chk: chk, newName: n2, status: st });
    });
    rows.appendChild(frag);
    paint();
  }

  function paint() {
    var ready = 0, problems = 0, unchanged = 0, selected = 0;
    state.files.forEach(function (f, i) {
      var els = state.rowEls[i];
      if (!els) return;
      var r = state.plan[i];
      if (f.selected) selected++;
      els.chk.checked = f.selected;
      var cls = "row", st = "", stCls = "status", nn = "—";
      if (!f.selected) { cls += " row--skipped"; }
      if (r && r.status === "ok") {
        ready++; nn = r.newName; stCls += " status--ok";
        st = r.notes.length ? r.notes.map(function (n) { return t("note." + n); }).join(", ") : t("st.ok");
      } else if (r && r.status === "unchanged") {
        unchanged++; nn = r.newName; st = t("st.unchanged");
      } else if (r && r.status === "error") {
        problems++; cls += " row--error"; stCls += " status--err";
        nn = r.newName;
        st = r.reasons.map(function (x) { return t("reason." + x); }).join(", ");
      } else if (r && r.status === "skipped") {
        nn = r.newName;
      }
      els.row.className = cls;
      els.newName.textContent = nn;
      els.newName.title = nn;
      els.status.className = stCls;
      els.status.textContent = st;
    });
    $("selAll").checked = state.files.length > 0 && selected === state.files.length;
    $("selAll").indeterminate = selected > 0 && selected < state.files.length;

    var sum = $("summary");
    sum.textContent = "";
    function part(text, cls) { var s = document.createElement("span"); if (cls) s.className = cls; s.textContent = text; sum.appendChild(s); }
    if (state.files.length) {
      part(t("sum.total", { n: state.files.length }));
      part(t("sum.selected", { n: selected }));
      if (ready) part(t("sum.ready", { n: ready }), "good");
      if (problems) part(t("sum.problems", { n: problems }), "bad");
    }
    var btn = $("renameBtn");
    btn.textContent = ready ? t("btn.rename", { n: ready }) : t("btn.rename.none");
    btn.disabled = state.busy || !ready || problems > 0;
    btn.title = problems > 0 ? t("tip.blocked") : "";
    $("clearBtn").disabled = state.busy || !state.files.length;
  }

  $("selAll").addEventListener("change", function () {
    var v = this.checked;
    state.files.forEach(function (f) { f.selected = v; });
    paint(); schedulePlan();
  });

  // ---- Adding files ------------------------------------------------------------------------
  $("addFilesBtn").addEventListener("click", function () { api.files.pick("files", scanOpts()).then(addFiles); });
  $("addFolderBtn").addEventListener("click", function () { api.files.pick("folder", scanOpts()).then(addFiles); });
  $("clearBtn").addEventListener("click", function () { state.files = []; state.plan = []; renderList(); });

  var dragDepth = 0;
  window.addEventListener("dragenter", function (e) { e.preventDefault(); dragDepth++; document.body.classList.add("dragging"); });
  window.addEventListener("dragleave", function (e) { e.preventDefault(); if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
  window.addEventListener("dragover", function (e) { e.preventDefault(); });
  window.addEventListener("drop", function (e) {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
    var paths = Array.prototype.map.call(e.dataTransfer.files, function (f) { try { return api.pathForFile(f); } catch (err) { return ""; } }).filter(Boolean);
    if (paths.length) api.files.expand(paths, scanOpts()).then(addFiles);
  });

  // ---- Rename ------------------------------------------------------------------------------
  function readyItems() {
    var items = [];
    state.plan.forEach(function (r, i) { if (r.status === "ok") items.push({ path: state.files[i].path, newName: r.newName }); });
    return items;
  }

  $("renameBtn").addEventListener("click", function () {
    var items = readyItems();
    if (!items.length) return;
    var dirs = {};
    items.forEach(function (it) { dirs[dirName(it.path)] = true; });
    $("confirmText").textContent = t("confirm.text", { n: items.length, m: Object.keys(dirs).length });
    var ul = $("confirmPairs");
    ul.textContent = "";
    items.slice(0, 8).forEach(function (it) {
      var li = document.createElement("li");
      li.appendChild(document.createTextNode(baseName(it.path) + " → "));
      var to = document.createElement("span"); to.className = "to"; to.textContent = it.newName;
      li.appendChild(to); ul.appendChild(li);
    });
    if (items.length > 8) { var more = document.createElement("li"); more.textContent = t("confirm.more", { n: items.length - 8 }); ul.appendChild(more); }
    openDlg("confirmDlg");
  });
  $("confirmCancel").addEventListener("click", function () { closeDlg("confirmDlg"); });

  $("confirmOk").addEventListener("click", function () {
    closeDlg("confirmDlg");
    var items = readyItems();
    state.busy = true; paint();
    rememberPattern(patternEl.value);
    api.rename(items).then(function (results) {
      var ok = 0, failed = [];
      results.forEach(function (r) {
        if (r && r.ok) {
          ok++;
          var f = state.files.filter(function (x) { return x.path === r.from; })[0];
          if (f) { f.path = r.to; f.name = baseName(r.to); f.dir = dirName(r.to); f.selected = false; }
        } else if (r) failed.push(r);
      });
      showResult(ok, failed);
      state.busy = false;
      renderList(); schedulePlan(); refreshUndo();
    }).catch(function (err) { state.busy = false; paint(); toast(String(err && err.message || err)); });
  });

  function errText(code) { return t("err." + code) === "err." + code ? code : t("err." + code); }

  function showResult(ok, failed) {
    $("resultText").textContent = t("result.ok", { n: ok }) + (failed.length ? " · " + t("result.failed", { n: failed.length }) : "");
    var ul = $("resultList");
    ul.textContent = "";
    failed.slice(0, 50).forEach(function (r) {
      var li = document.createElement("li"); li.className = "bad";
      li.textContent = baseName(r.from || "") + " — " + errText(r.error);
      ul.appendChild(li);
    });
    $("resultHint").textContent = ok ? t("result.undoHint") : "";
    openDlg("resultDlg");
  }
  $("resultClose").addEventListener("click", function () { closeDlg("resultDlg"); });

  // ---- Undo --------------------------------------------------------------------------------
  function refreshUndo() {
    return api.undo.info().then(function (i) {
      $("undoBtn").disabled = !i.available;
      $("undoBtn").title = i.available ? new Date(i.createdAt).toLocaleString(lang) + " · " + t("sum.total", { n: i.count }) : "";
    });
  }

  $("undoBtn").addEventListener("click", function () {
    api.undo.check().then(function (c) {
      $("undoText").textContent = c.runnable ? t("undo.text", { n: c.runnable }) : t("undo.none");
      var ul = $("undoList");
      ul.textContent = "";
      if (c.problems.length) {
        var head = document.createElement("li"); head.textContent = t("undo.skipped", { n: c.problems.length }); ul.appendChild(head);
        c.problems.slice(0, 30).forEach(function (p) {
          var li = document.createElement("li"); li.className = "bad";
          li.textContent = baseName(p.to) + " — " + errText(p.error);
          ul.appendChild(li);
        });
      }
      $("undoOk").disabled = !c.runnable;
      openDlg("undoDlg");
    });
  });
  $("undoCancel").addEventListener("click", function () { closeDlg("undoDlg"); });
  $("undoOk").addEventListener("click", function () {
    closeDlg("undoDlg");
    api.undo.run().then(function (res) {
      var ok = 0;
      res.results.forEach(function (r) {
        if (!r.ok) return;
        ok++;
        var f = state.files.filter(function (x) { return x.path === r.from; })[0];
        if (f) { f.path = r.to; f.name = baseName(r.to); f.dir = dirName(r.to); }
      });
      toast(t("undo.done", { n: ok }));
      renderList(); schedulePlan(); refreshUndo();
    });
  });

  // ---- Updates -----------------------------------------------------------------------------
  function showUpdate(info) {
    pendingUpdate = info;
    var text = $("updText");
    $("updProgress").hidden = true;
    $("updDownload").hidden = true; $("updShow").hidden = true; $("updPage").hidden = true;
    if (!info.ok) text.textContent = t("upd.error", { e: info.error });
    else if (info.noRelease) text.textContent = t("upd.norelease");
    else if (info.available) {
      text.textContent = t("upd.available", { v: info.latest });
      $("updPage").hidden = false;
      $("updDownload").hidden = !info.installer;
    } else text.textContent = t("upd.latest", { v: info.current });
  }

  function checkUpdates(silent) {
    if (!silent) { $("updText").textContent = t("upd.checking"); }
    return api.update.check().then(function (info) {
      if (silent) {
        if (info.ok && info.available) {
          $("updBannerText").textContent = t("upd.available", { v: info.latest });
          $("updBanner").hidden = false;
          showUpdate(info);
        }
      } else showUpdate(info);
    });
  }

  $("updBtn").addEventListener("click", function () { openDlg("updDlg"); checkUpdates(false); });
  $("updBannerBtn").addEventListener("click", function () { openDlg("updDlg"); });
  $("updCheck").addEventListener("click", function () { checkUpdates(false); });
  $("updClose").addEventListener("click", function () { closeDlg("updDlg"); });
  $("updAuto").addEventListener("change", function () { save("updauto", this.checked ? "1" : "0"); });
  $("updPage").addEventListener("click", function () { if (pendingUpdate && pendingUpdate.url) api.openExternal(pendingUpdate.url); });
  var downloadedFile = null;
  $("updDownload").addEventListener("click", function () {
    $("updDownload").hidden = true; $("updProgress").hidden = false;
    $("updBar").style.width = "0%";
    $("updText").textContent = t("upd.downloading", { pct: 0 });
    api.update.download().then(function (res) {
      if (res.ok) { downloadedFile = res.file; $("updText").textContent = t("upd.done"); $("updProgress").hidden = true; $("updShow").hidden = false; }
      else { $("updText").textContent = t("upd.error", { e: res.error }); $("updProgress").hidden = true; $("updDownload").hidden = false; }
    });
  });
  $("updShow").addEventListener("click", function () { if (downloadedFile) api.update.reveal(downloadedFile); });
  api.update.onProgress(function (received, total) {
    var pct = total ? Math.min(100, Math.round(received * 100 / total)) : 0;
    $("updBar").style.width = pct + "%";
    $("updText").textContent = t("upd.downloading", { pct: pct });
  });

  // ---- Help and external links -------------------------------------------------------------
  $("helpBtn").addEventListener("click", function () { openDlg("helpDlg"); });
  $("helpClose").addEventListener("click", function () { closeDlg("helpDlg"); });
  document.querySelectorAll("a[data-ext]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (/^https:/.test(a.href)) api.openExternal(a.href);
    });
  });

  // ---- Start -------------------------------------------------------------------------------
  applyI18n();
  renderList();
  api.info().then(function (i) { $("ver").textContent = "v" + i.version; });
  refreshUndo();
  if ($("updAuto").checked) checkUpdates(true).catch(function () { /* offline: ignore */ });
})();
