// Placeholder engine. Same meaning as G-Downloader, plus {orig}.
//
//   {date}            -> yyyy-MM-dd (now)
//   {date:FORMAT}     -> e.g. {date:yyyyMMdd}, {date:dd-MM-yyyy}
//   {time}            -> HHmmss (now)
//   {time:FORMAT}     -> e.g. {time:HHmm}
//   {date+1h:H}       -> shifted by +/-N then m (minutes), h (hours) or d (days)
//   {mdate}, {mtime}  -> same as {date}/{time} (same FORMAT and offsets) but for the file's own
//                        modification time
//   {seq}, {seq:N}    -> counter (start/step set by the batch), zero-padded to N digits
//   {rand}, {rand:N}  -> random lowercase alphanumeric string (default 6, max 64)
//   {env:NAME}        -> value of the environment variable NAME ('' when unset)
//   {orig}            -> original file name without extension
//
// FORMAT tokens (own implementation, not date-fns): yyyy yy MM M dd d HH H hh h mm m ss s SSS a.
// Text between single quotes is literal ('T'). Any other character is copied as is.

const PLACEHOLDER_RE = /\{([a-zA-Z]+)(?:([+-]\d+)([mhd]))?(?::([^}]*))?\}/g;
const KNOWN = new Set(['date', 'time', 'mdate', 'mtime', 'seq', 'rand', 'env', 'orig']);
const MAX_RAND = 64;
const MAX_PAD = 20;

const pad = (n, w) => String(n).padStart(w, '0');

export function shiftDate(date, amount, unit) {
  const n = parseInt(amount, 10);
  const d = new Date(date.getTime());
  if (!n) return d;
  if (unit === 'm') d.setMinutes(d.getMinutes() + n);
  else if (unit === 'h') d.setHours(d.getHours() + n);
  else d.setDate(d.getDate() + n); // calendar days: keeps the local clock time across DST changes
  return d;
}

export function formatDate(date, fmt) {
  let out = '';
  for (let i = 0; i < fmt.length; ) {
    const c = fmt[i];
    if (c === "'") {
      const end = fmt.indexOf("'", i + 1);
      if (end === -1) { out += fmt.slice(i + 1); break; }
      out += end === i + 1 ? "'" : fmt.slice(i + 1, end);
      i = end + 1;
      continue;
    }
    if (!/[yMdHhmsSa]/.test(c)) { out += c; i++; continue; }
    let j = i;
    while (j < fmt.length && fmt[j] === c) j++;
    const len = j - i;
    const h12 = date.getHours() % 12 || 12;
    switch (c) {
      case 'y': out += len === 2 ? pad(date.getFullYear() % 100, 2) : pad(date.getFullYear(), len); break;
      case 'M': out += pad(date.getMonth() + 1, len); break;
      case 'd': out += pad(date.getDate(), len); break;
      case 'H': out += pad(date.getHours(), len); break;
      case 'h': out += pad(h12, len); break;
      case 'm': out += pad(date.getMinutes(), len); break;
      case 's': out += pad(date.getSeconds(), len); break;
      case 'S': out += pad(date.getMilliseconds(), 3).slice(0, len); break;
      case 'a': out += date.getHours() < 12 ? 'AM' : 'PM'; break;
    }
    i = j;
  }
  return out;
}

// Small deterministic generator: the same seed gives the same names, so the preview does not
// change while the user types and the confirmed names are the ones that were shown.
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomString(len, rng) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(rng() * chars.length)];
  return out;
}

// ctx: { now: Date, mtime: Date (file modification time), seq: number, orig: string, rng: () => number, env: object }
export function resolveTemplate(template, ctx = {}) {
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const mtime = ctx.mtime instanceof Date && !isNaN(ctx.mtime) ? ctx.mtime : now;
  const seq = Number.isFinite(ctx.seq) ? ctx.seq : 0;
  const rng = ctx.rng || Math.random;
  const env = ctx.env || {};

  return String(template).replace(PLACEHOLDER_RE, (match, key, amount, unit, arg) => {
    if (!KNOWN.has(key)) return match;
    switch (key) {
      case 'date':
        return formatDate(amount ? shiftDate(now, amount, unit) : now, arg ? arg : 'yyyy-MM-dd');
      case 'time':
        return formatDate(amount ? shiftDate(now, amount, unit) : now, arg ? arg : 'HHmmss');
      case 'mdate':
        return formatDate(amount ? shiftDate(mtime, amount, unit) : mtime, arg ? arg : 'yyyy-MM-dd');
      case 'mtime':
        return formatDate(amount ? shiftDate(mtime, amount, unit) : mtime, arg ? arg : 'HHmmss');
      case 'seq': {
        const digits = Math.min(MAX_PAD, parseInt(arg, 10) || 0);
        const s = String(Math.abs(seq)).padStart(digits, '0');
        return seq < 0 ? '-' + s : s;
      }
      case 'rand':
        return randomString(Math.min(MAX_RAND, Math.max(1, parseInt(arg, 10) || 6)), rng);
      case 'env':
        return Object.prototype.hasOwnProperty.call(env, arg) ? String(env[arg]) : '';
      case 'orig':
        return String(ctx.orig ?? '');
    }
    return match;
  });
}

// Placeholders that look like placeholders but are not known: shown as a warning in the UI.
export function unknownPlaceholders(template) {
  const found = [];
  for (const m of String(template).matchAll(PLACEHOLDER_RE)) {
    if (!KNOWN.has(m[1])) found.push(m[0]);
  }
  return found;
}
