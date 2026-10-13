// Two optional steps applied to the name (without extension) after the pattern has been resolved:
//   1. find and replace (plain text or regular expression; an empty "replace with" removes the text)
//   2. clean up (accents, special characters, upper/lower/Title Case, spaces)
// Pure functions: no file system, no Electron.

export const MAX_FIND_LENGTH = 200;

export const DEFAULT_FIND = Object.freeze({ text: '', replace: '', regex: false, caseSensitive: false });
export const DEFAULT_CLEAN = Object.freeze({ case: 'none', spaces: 'none', accents: false, special: false });
export const CASE_MODES = ['none', 'lower', 'upper', 'title'];
export const SPACE_MODES = ['none', 'underscore', 'hyphen'];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

export function sanitizeFind(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    text: typeof r.text === 'string' ? r.text.slice(0, MAX_FIND_LENGTH) : '',
    replace: typeof r.replace === 'string' ? r.replace.slice(0, MAX_FIND_LENGTH) : '',
    regex: r.regex === true,
    caseSensitive: r.caseSensitive === true
  };
}

export function sanitizeClean(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    case: CASE_MODES.includes(r.case) ? r.case : 'none',
    spaces: SPACE_MODES.includes(r.spaces) ? r.spaces : 'none',
    accents: r.accents === true,
    special: r.special === true
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// -> { ok:true, re } or { ok:false } (empty text = nothing to do, ok with re null).
export function compileFind(find) {
  const f = sanitizeFind(find);
  if (!f.text) return { ok: true, re: null, replace: '' };
  try {
    const re = new RegExp(f.regex ? f.text : escapeRe(f.text), f.caseSensitive ? 'g' : 'gi');
    return { ok: true, re, replace: f.replace, regex: f.regex };
  } catch {
    return { ok: false, error: 'bad-regex' };
  }
}

export function applyFind(value, compiled) {
  if (!compiled?.re) return value;
  compiled.re.lastIndex = 0;
  // plain text: the replacement is literal ($ has no special meaning); regex: $1, $& work as in JavaScript
  return compiled.regex ? value.replace(compiled.re, compiled.replace) : value.replace(compiled.re, () => compiled.replace);
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s_.-])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());

export function applyClean(value, clean) {
  const c = sanitizeClean(clean);
  let v = value;
  if (c.accents) v = v.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
  // special characters: everything except letters, digits, space, "_", "-" and "."
  if (c.special) v = v.replace(/[^\p{L}\p{N} _.-]+/gu, '');
  if (c.case === 'lower') v = v.toLowerCase();
  else if (c.case === 'upper') v = v.toUpperCase();
  else if (c.case === 'title') v = titleCase(v);
  if (c.spaces !== 'none') {
    const sep = c.spaces === 'underscore' ? '_' : '-';
    // spaces become the separator; runs of the separator collapse to one and none stays at the ends
    v = v.replace(/\s+/g, sep);
    v = v.replace(new RegExp(`${escapeRe(sep)}{2,}`, 'g'), sep).replace(new RegExp(`^${escapeRe(sep)}+|${escapeRe(sep)}+$`, 'g'), '');
  }
  return v;
}

export const hasTransforms = (find, clean) => {
  const f = sanitizeFind(find);
  const c = sanitizeClean(clean);
  return !!f.text || c.case !== 'none' || c.spaces !== 'none' || c.accents || c.special;
};

// opts: { find, clean }. Returns the new text, or throws Error('bad-regex') when the expression is not valid.
export function prepareTransform(opts = {}) {
  const compiled = compileFind(opts.find);
  if (!compiled.ok) return { ok: false, error: compiled.error };
  const clean = sanitizeClean(opts.clean);
  return { ok: true, run: (value) => applyClean(applyFind(value, compiled), clean) };
}
