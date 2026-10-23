// CSV log of a rename batch (old name -> new name). Pure functions: no file system, no Electron.
// Opens in Excel, Numbers and LibreOffice: UTF-8 with a byte-order mark, comma-separated, CRLF line ends.
// A cell that starts with = + - @ (or a tab / carriage return) would be read as a formula by a spreadsheet,
// so it gets a single quote in front; paths and file names that do not start with those are written as they are.
import path from 'node:path';

export const CSV_HEADER = ['old_name', 'new_name', 'folder', 'status', 'error', 'time'];
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  let v = value === null || value === undefined ? '' : String(value);
  if (FORMULA_START.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// rows: [{ from, to, ok, error }] (full paths). time: ISO string of the batch.
export function batchCsv(rows, time) {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    const from = String(r.from || '');
    const to = r.to ? String(r.to) : '';
    lines.push([
      path.basename(from),
      to ? path.basename(to) : '',
      path.dirname(from),
      r.ok ? 'renamed' : 'failed',
      r.ok ? '' : r.error || 'error',
      time || ''
    ].map(csvCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export const csvFileName = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `file-renamer-log-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.csv`;
};
