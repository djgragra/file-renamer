import path from 'node:path';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';

// Renaming that never overwrites. fs.rename() silently replaces an existing target on every
// OS, so the name is claimed with a hard link first (fails with EEXIST if taken) and the old
// name is removed afterwards. File systems without hard links (FAT, exFAT, some network
// shares) fall back to "check, then rename", which leaves a very small window.
const NO_LINK_CODES = new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EMLINK', 'EINVAL', 'EACCES']);

export class CollisionError extends Error {
  constructor(target) {
    super(`exists: ${target}`);
    this.code = 'EEXIST';
  }
}

export async function renameNoOverwrite(from, to) {
  try {
    await fsp.link(from, to);
  } catch (err) {
    if (err.code === 'EEXIST') throw new CollisionError(to);
    if (!NO_LINK_CODES.has(err.code)) throw err;
    if (await exists(to)) throw new CollisionError(to);
    await fsp.rename(from, to);
    return;
  }
  try {
    await fsp.unlink(from);
  } catch (err) {
    // The new name exists but the old one could not be removed: undo the link, keep the file as it was.
    await fsp.unlink(to).catch(() => {});
    throw err;
  }
}

async function exists(p) {
  try {
    await fsp.lstat(p);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return false;
    throw err;
  }
}

const idOf = (st) => (st && st.ino ? `${st.dev}:${st.ino}` : null);
async function statId(p) {
  try {
    return idOf(await fsp.lstat(p, { bigint: true }));
  } catch {
    return null;
  }
}

const tempName = (to) => path.join(path.dirname(to), `.fr-${crypto.randomBytes(6).toString('hex')}.tmp`);

// pairs: [{ from, to }] absolute paths. Returns [{ from, to, ok, error? }] in the same order.
// Handles targets that are freed by another pair (chains), swaps and case-only changes
// (through a temporary name). A target taken by an unrelated file is reported, never replaced.
export async function applyRenames(pairs) {
  const results = pairs.map((p) => ({ from: p.from, to: p.to, ok: false, error: null }));
  const sourceIds = new Map(); // id -> index, for pairs still pending
  const pending = new Set();
  for (let i = 0; i < pairs.length; i++) {
    const id = await statId(pairs[i].from);
    if (!id && !(await exists(pairs[i].from))) { results[i].error = 'missing'; continue; }
    if (id) sourceIds.set(id, i);
    pending.add(i);
  }

  const fail = (i, err) => {
    results[i].error = err.code === 'EEXIST' ? 'exists' : err.code || String(err.message || err);
    pending.delete(i);
  };
  const done = (i) => { results[i].ok = true; pending.delete(i); };

  while (pending.size) {
    let progress = false;
    for (const i of [...pending]) {
      if (await exists(pairs[i].to)) continue;
      try {
        await renameNoOverwrite(pairs[i].from, pairs[i].to);
        done(i);
      } catch (err) {
        fail(i, err);
      }
      progress = true;
    }
    if (!pending.size || progress) continue;

    // Nothing can move directly: the remaining targets exist. Those that belong to this batch
    // (a cycle, a swap or the file itself) go through temporary names; the rest are collisions.
    const viaTemp = [];
    for (const i of [...pending]) {
      const tid = await statId(pairs[i].to);
      const own = tid && tid === (await statId(pairs[i].from));
      const other = tid && sourceIds.has(tid) && pending.has(sourceIds.get(tid));
      if (own || other) viaTemp.push(i);
      else fail(i, new CollisionError(pairs[i].to));
    }
    const moved = [];
    for (const i of viaTemp) {
      const tmp = tempName(pairs[i].to);
      try {
        await renameNoOverwrite(pairs[i].from, tmp);
        moved.push({ i, tmp });
      } catch (err) {
        fail(i, err);
      }
    }
    for (const { i, tmp } of moved) {
      try {
        await renameNoOverwrite(tmp, pairs[i].to);
        done(i);
      } catch (err) {
        await renameNoOverwrite(tmp, pairs[i].from).catch(() => {}); // put the file back
        fail(i, err);
      }
    }
    // Names freed by the temporary moves may unblock other pairs; loop again.
    if (!moved.length && pending.size) for (const i of [...pending]) fail(i, new CollisionError(pairs[i].to));
  }
  return results;
}

// ---- Undo log -------------------------------------------------------------------------------
// Only the last batch is kept. Each entry stores size and modification time of the renamed
// file: if either changed since, the file was edited or replaced and is not touched by the undo.

export async function buildLog(results) {
  const entries = [];
  for (const r of results) {
    if (!r.ok) continue;
    try {
      const st = await fsp.stat(r.to);
      entries.push({ from: r.from, to: r.to, size: st.size, mtimeMs: Math.round(st.mtimeMs) });
    } catch {
      entries.push({ from: r.from, to: r.to, size: null, mtimeMs: null });
    }
  }
  return { version: 1, createdAt: new Date().toISOString(), entries };
}

// Returns { runnable: [{from: to, to: from}], problems: [{entry, error}] } without touching disk.
export async function checkUndo(log) {
  const runnable = [];
  const problems = [];
  const sourceIds = new Set();
  for (const e of log.entries) sourceIds.add(await statId(e.to));
  for (const e of log.entries) {
    let st;
    try {
      st = await fsp.stat(e.to);
    } catch {
      problems.push({ entry: e, error: 'missing' });
      continue;
    }
    if (e.size !== null && (st.size !== e.size || Math.round(st.mtimeMs) !== e.mtimeMs)) {
      problems.push({ entry: e, error: 'changed' });
      continue;
    }
    if (await exists(e.from)) {
      const free = sourceIds.has(await statId(e.from)) || (await statId(e.from)) === (await statId(e.to));
      if (!free) { problems.push({ entry: e, error: 'occupied' }); continue; }
    }
    runnable.push({ from: e.to, to: e.from });
  }
  return { runnable, problems };
}
