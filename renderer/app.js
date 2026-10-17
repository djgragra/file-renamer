/* File Renamer — renderer. © 2026 Graziano Melzi · OnAir Garage — MIT License */
(function () {
  "use strict";

  var LEGACY_KEY = "com.onairgarage.filerenamer.";
  var RELEASES = "https://github.com/djgragra/file-renamer/releases";
  var api = window.api;
  var $ = function (id) { return document.getElementById(id); };

  // ---- State -------------------------------------------------------------------------------
  var cfg = null;       // settings, owned by the main process (settings.json); this is the working copy
  var lang = "en";      // the app always opens in English until the user changes it
  var t = I18N.make(lang);
  var appInfo = { version: "", platform: "", arch: "" };
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

  function saveCfg(patch) {
    Object.keys(patch).forEach(function (k) { cfg[k] = patch[k]; });
    api.settings.update(patch);
  }

  // ---- Icons (line icons drawn from a few paths; no files, no inline style) -----------------
  var ICONS = {
    gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 13a7.7 7.7 0 0 0 0-2l2-1.5-2-3.4-2.3.9a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.3-.9-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.3-.9a7.5 7.5 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 1.7-1l2.3.9 2-3.4z",
    help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.4a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.3 1-1.3 1.9M12 16.8v.2",
    file: "M7 3h7l4 4v14H7zM14 3v4h4",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
    undo: "M9 7 4 12l5 5M4 12h10a6 6 0 0 1 0 8",
    download: "M12 4v11M7 11l5 5 5-5M5 20h14",
    check: "M5 12.5l4.5 4.5L19 7.5",
    close: "M6 6l12 12M18 6 6 18",
    notes: "M7 3h10v18H7zM10 8h4M10 12h4M10 16h2"
  };
  function icon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "16"); svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor"); svg.setAttribute("stroke-width", "1.8");
    svg.setAttribute("stroke-linecap", "round"); svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "ico");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", ICONS[name]);
    svg.appendChild(p);
    return svg;
  }
  document.querySelectorAll("[data-icon]").forEach(function (el) { el.insertBefore(icon(el.getAttribute("data-icon")), el.firstChild); });

  // ---- i18n and theme ----------------------------------------------------------------------
  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) { el.title = t(el.getAttribute("data-i18n-title")); });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) { el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria"))); });
    document.title = t("app.title");
    fillPresets();
    renderUpdate();
    updLastText();
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
  langSel.addEventListener("change", function () {
    lang = langSel.value; saveCfg({ language: lang }); t = I18N.make(lang); applyI18n(); renderList();
  });
  $("themeSel").addEventListener("change", function () { saveCfg({ theme: this.value }); applyTheme(this.value); });

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

  function ask(title, text, okLabel) {
    return new Promise(function (resolve) {
      $("askTitle").textContent = title; $("askText").textContent = text; $("askOk").textContent = okLabel;
      var dlg = openDlg("askDlg");
      function done(v) { $("askOk").onclick = null; $("askCancel").onclick = null; dlg.onclose = null; closeDlg("askDlg"); resolve(v); }
      $("askOk").onclick = function () { done(true); };
      $("askCancel").onclick = function () { done(false); };
      dlg.onclose = function () { resolve(false); };
    });
  }

  // ---- Pattern, find & replace, clean up ---------------------------------------------------
  var patternEl = $("pattern");
  var seqStartEl = $("seqStart");
  var seqStepEl = $("seqStep");
  var KNOWN = ["date", "time", "mdate", "mtime", "seq", "rand", "env", "orig", "parent"];

  function recentPatterns() { return (cfg && cfg.recent) || []; }
  function rememberPattern(p) {
    if (!p.trim()) return;
    var list = recentPatterns().filter(function (x) { return x !== p; });
    list.unshift(p);
    saveCfg({ recent: list.slice(0, 8) });
    fillRecent();
  }
  function fillRecent() {
    var dl = $("recent");
    dl.textContent = "";
    recentPatterns().forEach(function (p) { var o = document.createElement("option"); o.value = p; dl.appendChild(o); });
  }

  function scanOpts() { return { recursive: $("optRecursive").checked, avOnly: $("optAv").checked }; }
  $("optRecursive").addEventListener("change", function () { saveCfg({ recursive: this.checked }); });
  $("optAv").addEventListener("change", function () { saveCfg({ avOnly: this.checked }); });

  function findOpts() {
    return { text: $("findText").value, replace: $("findRepl").value, regex: $("findRegex").checked, caseSensitive: $("findCase").checked };
  }
  function cleanOpts() {
    return { case: $("cleanCase").value, spaces: $("cleanSpaces").value, accents: $("cleanAccents").checked, special: $("cleanSpecial").checked };
  }
  function toolsActive() {
    var f = findOpts(), c = cleanOpts();
    return !!f.text || c.case !== "none" || c.spaces !== "none" || c.accents || c.special;
  }
  function saveTools() {
    saveCfg({ find: findOpts(), clean: cleanOpts() });
    $("toolsBadge").hidden = !toolsActive();
    schedulePlan();
  }
  ["findText", "findRepl", "findRegex", "findCase", "cleanCase", "cleanSpaces", "cleanAccents", "cleanSpecial"].forEach(function (id) {
    $(id).addEventListener("input", saveTools);
    $(id).addEventListener("change", saveTools);
  });

  function setTools(find, clean) {
    $("findText").value = find.text; $("findRepl").value = find.replace;
    $("findRegex").checked = find.regex; $("findCase").checked = find.caseSensitive;
    $("cleanCase").value = clean.case; $("cleanSpaces").value = clean.spaces;
    $("cleanAccents").checked = clean.accents; $("cleanSpecial").checked = clean.special;
    $("toolsBadge").hidden = !toolsActive();
    if (toolsActive()) $("tools").open = true;
  }

  // ---- Plan --------------------------------------------------------------------------------
  function numVal(el, d) { var n = parseInt(el.value, 10); return isFinite(n) ? n : d; }

  function schedulePlan() {
    clearTimeout(planTimer);
    planTimer = setTimeout(runPlan, 100);
  }

  function runPlan() {
    var pattern = patternEl.value;
    var unknown = /\{([a-zA-Z]+)(?:[+-]\d+[mhd])?(?::[^}]*)?\}/g, bad = [], m;
    while ((m = unknown.exec(pattern))) if (KNOWN.indexOf(m[1]) === -1) bad.push(m[0]);
    var warn = $("patWarn");
    warn.hidden = !bad.length;
    warn.textContent = bad.length ? t("warn.unknown", { list: bad.join(" ") }) : "";

    var f = findOpts(), badRe = false;
    if (f.text && f.regex) { try { new RegExp(f.text, "g"); } catch (e) { badRe = true; } }
    $("findWarn").hidden = !badRe;

    var id = ++state.reqId;
    if (!state.files.length || !pattern.trim()) { state.plan = []; paint(); return Promise.resolve(); }
    var files = state.files.map(function (x) { return { path: x.path, selected: x.selected }; });
    return api.plan(files, { pattern: pattern, seqStart: numVal(seqStartEl, 1), seqStep: numVal(seqStepEl, 1), seed: state.seed, find: f, clean: cleanOpts() })
      .then(function (rows) { if (id === state.reqId) { state.plan = rows; paint(); } });
  }

  function savePatternSettings() { saveCfg({ pattern: patternEl.value, seqStart: numVal(seqStartEl, 1), seqStep: numVal(seqStepEl, 1) || 1 }); }
  patternEl.addEventListener("input", function () { saveCfg({ pattern: patternEl.value }); schedulePlan(); });
  patternEl.addEventListener("change", function () { rememberPattern(patternEl.value); });
  [seqStartEl, seqStepEl].forEach(function (el) {
    el.addEventListener("input", function () { savePatternSettings(); schedulePlan(); });
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
      saveCfg({ pattern: patternEl.value });
      schedulePlan();
    });
  });

  // ---- Presets -----------------------------------------------------------------------------
  function presets() { return (cfg && cfg.presets) || []; }
  function fillPresets() {
    var sel = $("presetSel");
    var keep = sel.value;
    sel.textContent = "";
    var none = document.createElement("option");
    none.value = ""; none.textContent = t("preset.none");
    sel.appendChild(none);
    presets().forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.id; o.textContent = p.name;
      sel.appendChild(o);
    });
    sel.value = presets().some(function (p) { return p.id === keep; }) ? keep : "";
    $("presetDel").disabled = !sel.value;
  }
  function newId() { return "p" + Math.random().toString(36).slice(2, 10); }
  function currentPreset(name, id) {
    return { id: id, name: name, pattern: patternEl.value, seqStart: numVal(seqStartEl, 1), seqStep: numVal(seqStepEl, 1) || 1, find: findOpts(), clean: cleanOpts() };
  }

  $("presetSel").addEventListener("change", function () {
    var p = presets().filter(function (x) { return x.id === $("presetSel").value; })[0];
    $("presetDel").disabled = !p;
    if (!p) return;
    patternEl.value = p.pattern; seqStartEl.value = p.seqStart; seqStepEl.value = p.seqStep;
    setTools(p.find, p.clean);
    saveCfg({ pattern: p.pattern, seqStart: p.seqStart, seqStep: p.seqStep, find: p.find, clean: p.clean });
    schedulePlan();
  });

  function presetByName(name) {
    var n = name.trim().toLowerCase();
    return presets().filter(function (p) { return p.name.toLowerCase() === n; })[0];
  }
  function presetHint() {
    var exists = presetByName($("presetName").value);
    $("presetHint").textContent = exists ? t("preset.replaceHint") : t("preset.hint");
    $("presetOk").disabled = !$("presetName").value.trim();
  }
  $("presetSave").addEventListener("click", function () {
    var sel = presets().filter(function (p) { return p.id === $("presetSel").value; })[0];
    $("presetName").value = sel ? sel.name : "";
    presetHint();
    openDlg("presetDlg");
    $("presetName").focus(); $("presetName").select();
  });
  $("presetName").addEventListener("input", presetHint);
  $("presetName").addEventListener("keydown", function (e) { if (e.key === "Enter" && !$("presetOk").disabled) { e.preventDefault(); $("presetOk").click(); } });
  $("presetCancel").addEventListener("click", function () { closeDlg("presetDlg"); });
  $("presetOk").addEventListener("click", function () {
    var name = $("presetName").value.trim();
    if (!name) return;
    var existing = presetByName(name);
    if (!existing && presets().length >= 50) { closeDlg("presetDlg"); toast(t("preset.max")); return; }
    var p = currentPreset(name, existing ? existing.id : newId());
    var list = presets().filter(function (x) { return x.id !== p.id; });
    list.push(p);
    saveCfg({ presets: list });
    fillPresets();
    $("presetSel").value = p.id; $("presetDel").disabled = false;
    closeDlg("presetDlg");
    toast(t("preset.saved", { name: name }));
  });
  $("presetDel").addEventListener("click", function () {
    var p = presets().filter(function (x) { return x.id === $("presetSel").value; })[0];
    if (!p) return;
    ask(t("preset.delete"), t("preset.deleteConfirm", { name: p.name }), t("preset.delete")).then(function (yes) {
      if (!yes) return;
      saveCfg({ presets: presets().filter(function (x) { return x.id !== p.id; }) });
      fillPresets();
      toast(t("preset.deleted", { name: p.name }));
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

    // status pill in the header: the state in words
    var pill = $("statusPill"), kind = "off", text = t("pill.empty");
    if (state.files.length) {
      if (problems) { kind = "bad"; text = t("pill.problems", { n: problems }); }
      else if (ready) { kind = "ok"; text = t("pill.ready", { n: ready }); }
      else { text = t("pill.nothing"); }
    }
    pill.className = "status-pill " + kind;
    $("statusText").textContent = text;
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

  // ---- Guided update (same states in the banner and in Settings → Updates) ----------------
  // phase: idle | downloading | ready | installing | error
  var upd = { view: null, phase: "idle", pct: 0, got: 0, total: 0, error: "", busy: false, after: "", checking: false, retry: "download" };

  function mb(n) { return (n / 1048576).toFixed(1); }
  function btn(label, cls, onclick, ico) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "btn " + (cls || "btn--ghost btn--small");
    b.textContent = label;
    if (ico) b.insertBefore(icon(ico), b.firstChild);
    b.addEventListener("click", onclick);
    return b;
  }
  function updErrText(e) { var k = "upd.err." + e; return t(k) === k ? e : t(k); }

  // what the widget says, and the buttons
  function buildUpdate(box, inBanner) {
    box.textContent = "";
    var v = upd.view, info = v && v.info;
    var main = document.createElement("div"); main.className = "update-main";
    var text = document.createElement("div"); text.className = "update-text";
    var actions = document.createElement("div"); actions.className = "update-actions";
    var available = !!(info && info.ok && info.available);

    if (upd.phase === "downloading") {
      text.textContent = upd.total ? t("upd.downloading", { pct: upd.pct, got: mb(upd.got), total: mb(upd.total) }) : t("upd.downloading.nototal", { got: mb(upd.got) });
      main.appendChild(text);
      var bar = document.createElement("progress"); bar.className = "update-progress"; bar.max = 100; bar.value = upd.pct;
      main.appendChild(bar);
      actions.appendChild(btn(t("upd.cancel"), "btn--ghost btn--small", function () { api.update.cancel(); }, "close"));
    } else if (upd.phase === "installing") {
      text.textContent = upd.after ? t(upd.after) : t("upd.after.win");
      main.appendChild(text);
    } else if (upd.phase === "error") {
      text.textContent = upd.busy ? t("upd.busy") : t("upd.err", { e: updErrText(upd.error) });
      main.appendChild(text);
      actions.appendChild(btn(t("upd.retry"), "btn--primary btn--small", function () { if (upd.retry === "install") installNow(); else startDownload(); }, "download"));
    } else if (upd.phase === "ready") {
      text.textContent = t("upd.verified", { v: info ? info.latest : "" });
      main.appendChild(text);
      actions.appendChild(btn(t("upd.install"), "btn--primary btn--small", installNow, "check"));
    } else if (available) {
      text.textContent = t("upd.available", { v: info.latest, c: info.current });
      main.appendChild(text);
      if (info.notes) { var n = document.createElement("div"); n.className = "update-notes"; n.textContent = info.notes; main.appendChild(n); }
      if (info.installer) actions.appendChild(btn(t("upd.get"), "btn--primary btn--small", startDownload, "download"));
      actions.appendChild(btn(t("upd.remind"), "btn--ghost btn--small", function () { api.update.remind().then(setView); }));
      actions.appendChild(btn(t("upd.skip"), "btn--ghost btn--small", function () { api.update.skip().then(setView); }));
    } else if (upd.checking) {
      text.textContent = t("upd.checking");
      main.appendChild(text);
    } else if (info && info.ok && info.noRelease) {
      text.textContent = t("upd.norelease"); main.appendChild(text);
    } else if (info && info.ok) {
      text.textContent = t("upd.latest", { v: info.current }); main.appendChild(text);
    } else if (info) {
      text.textContent = t("upd.checkError", { e: info.error || "" }); main.appendChild(text);
    } else {
      return false;
    }
    if (available && upd.phase !== "installing") actions.appendChild(btn(t("upd.notes"), "btn--ghost btn--small", function () { api.openExternal(info.url); }, "notes"));
    box.appendChild(main);
    box.appendChild(actions);
    return true;
  }

  function renderUpdate() {
    var v = upd.view, info = v && v.info;
    var active = upd.phase !== "idle";
    var show = !!(info && info.ok && info.available && (active || v.banner === "show"));
    var bar = $("updBar");
    bar.hidden = !show;
    if (show) buildUpdate(bar, true);
    var panel = $("updPanel");
    panel.hidden = !buildUpdate(panel, false);
  }
  function setView(view) {
    upd.view = view; upd.checking = false;
    if (view.downloaded && upd.phase === "idle") upd.phase = "ready";
    updLastText();
    renderUpdate();
  }
  function updLastText() {
    var lc = upd.view ? upd.view.lastCheck : (cfg && cfg.updateState && cfg.updateState.lastCheck);
    $("updLast").textContent = lc
      ? t("upd.lastCheck", { when: new Date(lc.at).toLocaleString(lang), result: lc.ok ? t("upd.ok") : t("upd.failed") })
      : t("upd.lastCheck", { when: t("upd.never"), result: "—" });
  }

  function checkUpdates(manual) {
    if (manual) { upd.checking = true; renderUpdate(); }
    return api.update.check().then(function (view) {
      if (upd.phase === "downloading" || upd.phase === "installing") { upd.checking = false; return; }
      upd.phase = view.downloaded ? "ready" : "idle";
      setView(view);
    }).catch(function () { upd.checking = false; renderUpdate(); });
  }

  function startDownload() {
    upd.phase = "downloading"; upd.pct = 0; upd.got = 0; upd.total = upd.view && upd.view.info && upd.view.info.installer ? upd.view.info.installer.size : 0; upd.error = ""; upd.busy = false;
    renderUpdate();
    api.update.download().then(function (res) {
      if (res.ok) { upd.phase = "ready"; if (upd.view) upd.view.downloaded = res.file; }
      else if (res.error === "cancelled") { upd.phase = "idle"; }
      else { upd.phase = "error"; upd.error = res.error; upd.retry = "download"; }
      renderUpdate();
    });
  }
  api.update.onProgress(function (received, total) {
    upd.got = received; upd.total = total || upd.total;
    upd.pct = upd.total ? Math.min(100, Math.round(received * 100 / upd.total)) : 0;
    if (upd.phase === "downloading") renderUpdate();
  });

  function installNow() {
    api.update.install().then(function (res) {
      if (res.ok) {
        upd.phase = "installing";
        upd.after = res.kind === "open-image" ? "upd.after.mac" : res.kind === "reveal" ? "upd.after.linux" : "upd.after.win";
      } else {
        upd.phase = "error"; upd.error = res.error; upd.busy = res.error === "busy"; upd.retry = "install";
      }
      renderUpdate();
    });
  }

  $("updCheck").addEventListener("click", function () { checkUpdates(true); });
  $("updAuto").addEventListener("change", function () { saveCfg({ checkUpdates: this.checked }); });

  // ---- What's new (once, after an update) ----------------------------------------------------
  function showNews(w) {
    $("newsTitle").textContent = t("wn.title", { v: w.version });
    var body = $("newsBody");
    body.textContent = "";
    if (w.bullets && w.bullets.length) {
      var ul = document.createElement("ul");
      w.bullets.forEach(function (b) { var li = document.createElement("li"); li.textContent = b.replace(/\*\*/g, ""); ul.appendChild(li); });
      body.appendChild(ul);
    } else {
      var p = document.createElement("p"); p.textContent = t("wn.empty"); body.appendChild(p);
    }
    $("newsNotes").onclick = function () { api.openExternal(RELEASES + "/tag/v" + w.version); };
    openDlg("newsDlg");
  }
  $("newsOk").addEventListener("click", function () { closeDlg("newsDlg"); api.whatsNew.seen(); });

  // ---- Settings dialog -----------------------------------------------------------------------
  function showTab(name) {
    document.querySelectorAll("#setDlg .tab").forEach(function (b) { b.classList.toggle("tab--sel", b.getAttribute("data-tab") === name); b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false"); });
    document.querySelectorAll("#setDlg .panel").forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== name; });
    if (name === "updates") { renderUpdate(); updLastText(); }
  }
  document.querySelectorAll("#setDlg .tab").forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });
  function openSettings(tab) { showTab(tab || "general"); openDlg("setDlg"); }
  $("setBtn").addEventListener("click", function () { openSettings("general"); });
  $("setClose").addEventListener("click", function () { closeDlg("setDlg"); });

  // backup
  function bkMessage(text) { $("bkResult").textContent = text; }
  $("bkExport").addEventListener("click", function () {
    api.backup.exportFile().then(function (r) {
      bkMessage(r.ok ? t("bk.exported", { file: r.file }) : r.cancelled ? t("bk.cancelled") : r.error);
    });
  });
  $("bkImport").addEventListener("click", function () {
    api.backup.importPick().then(function (r) {
      if (!r.ok) { bkMessage(r.cancelled ? t("bk.cancelled") : (t("bk.err." + r.error) === "bk.err." + r.error ? r.error : t("bk.err." + r.error))); return; }
      $("importText").textContent = t("bk.importText", { n: r.presets, m: r.newPresets });
      openDlg("importDlg");
    });
  });
  function finishImport(mode) {
    closeDlg("importDlg");
    api.backup.importApply(mode).then(function (r) {
      if (!r.ok) { bkMessage(t("bk.err." + r.error)); return; }
      cfg = r.settings;
      applyCfg();
      bkMessage(mode === "add" ? t("bk.doneAdd", { n: r.added }) : t("bk.doneReplace"));
    });
  }
  $("importReplace").addEventListener("click", function () { finishImport("replace"); });
  $("importAdd").addEventListener("click", function () { finishImport("add"); });
  $("importCancel").addEventListener("click", function () { closeDlg("importDlg"); api.backup.importCancel(); });

  // help & about
  $("abManual").addEventListener("click", function (e) { e.preventDefault(); closeDlg("setDlg"); openDlg("helpDlg"); });
  $("abCopy").addEventListener("click", function () { api.copySupportInfo().then(function () { $("abResult").textContent = t("ab.copied"); }); });
  $("abTip").addEventListener("click", function (e) { e.preventDefault(); api.openExternal(I18N.tipUrl(lang)); });
  $("abLogs").addEventListener("click", function () { api.openLogs(); });
  $("abCheck").addEventListener("click", function () { showTab("updates"); checkUpdates(true); });

  // ---- Help and external links -------------------------------------------------------------
  $("helpBtn").addEventListener("click", function () { openDlg("helpDlg"); });
  $("helpClose").addEventListener("click", function () { closeDlg("helpDlg"); });
  document.querySelectorAll("a[data-ext]:not(#abTip)").forEach(function (a) {
    a.addEventListener("click", function (e) {
      e.preventDefault();
      if (/^https:/.test(a.href)) api.openExternal(a.href);
    });
  });

  // ---- Start -------------------------------------------------------------------------------
  // Puts the settings into the interface (also after a backup import).
  function applyCfg() {
    lang = I18N.LANGS[cfg.language] ? cfg.language : "en";
    t = I18N.make(lang);
    langSel.value = lang;
    $("themeSel").value = cfg.theme; applyTheme(cfg.theme);
    patternEl.value = cfg.pattern; seqStartEl.value = cfg.seqStart; seqStepEl.value = cfg.seqStep;
    $("optRecursive").checked = cfg.recursive; $("optAv").checked = cfg.avOnly;
    $("updAuto").checked = cfg.checkUpdates;
    setTools(cfg.find, cfg.clean);
    fillRecent();
    applyI18n();
    schedulePlan();
  }

  // 26.10.1 kept its settings in the window (localStorage): copy them once into the settings file.
  function legacyPatch() {
    function get(k) { try { return localStorage.getItem(LEGACY_KEY + k); } catch (e) { return null; } }
    var patch = { migrated: true };
    var l = get("lang"); if (l && I18N.LANGS[l]) patch.language = l;
    var th = get("theme"); if (th === "light" || th === "dark" || th === "auto") patch.theme = th;
    var p = get("pattern"); if (p) patch.pattern = p;
    var s1 = parseInt(get("seqStart"), 10); if (isFinite(s1)) patch.seqStart = s1;
    var s2 = parseInt(get("seqStep"), 10); if (isFinite(s2) && s2) patch.seqStep = s2;
    var rc = get("recursive"); if (rc !== null) patch.recursive = rc === "1";
    var av = get("avonly"); if (av !== null) patch.avOnly = av === "1";
    var ua = get("updauto"); if (ua !== null) patch.checkUpdates = ua === "1";
    try { var rec = JSON.parse(get("recent") || "[]"); if (Array.isArray(rec)) patch.recent = rec; } catch (e) { /* ignore */ }
    return patch;
  }

  renderList();
  api.settings.get().then(function (s) {
    cfg = s;
    if (!cfg.migrated) {
      var patch = legacyPatch();
      Object.keys(patch).forEach(function (k) { cfg[k] = patch[k]; });
      api.settings.update(patch);
    }
    applyCfg();
    return api.info();
  }).then(function (i) {
    appInfo = i;
    $("ver").textContent = "v" + i.version;
    $("abVersion").textContent = i.version;
    $("aboutVer").textContent = "OnAir Garage · MIT";
    $("abSystem").textContent = i.platform + " " + i.arch;
    refreshUndo();
    api.whatsNew.get().then(function (w) { if (w) showNews(w); });
    if (cfg.checkUpdates) setTimeout(function () { checkUpdates(false); }, 15000);
    setInterval(function () { if (cfg.checkUpdates) checkUpdates(false); }, 24 * 3600 * 1000);
  });
})();
