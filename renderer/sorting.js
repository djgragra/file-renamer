/* File Renamer — the orders of the list (also loaded by the tests). © 2026 Graziano Melzi · OnAir Garage — MIT License */
(function (root) {
  "use strict";

  // Each comparator gets two files { name, size, mtimeMs, added }. A tie keeps the order in which the files were added,
  // so the counter {seq} is always predictable.
  var SORTERS = {
    added: function (a, b) { return a.added - b.added; },
    nameAsc: function (a, b) { return a.name.localeCompare(b.name, undefined, { numeric: true }) || a.added - b.added; },
    nameDesc: function (a, b) { return b.name.localeCompare(a.name, undefined, { numeric: true }) || a.added - b.added; },
    modified: function (a, b) { return a.mtimeMs - b.mtimeMs || a.added - b.added; },
    sizeAsc: function (a, b) { return a.size - b.size || a.added - b.added; },
    sizeDesc: function (a, b) { return b.size - a.size || a.added - b.added; }
  };

  root.FRSort = { SORTERS: SORTERS, sort: function (files, by) { return files.sort(SORTERS[by] || SORTERS.added); } };
})(typeof window !== "undefined" ? window : globalThis);
