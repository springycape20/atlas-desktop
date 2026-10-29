const fs = require('node:fs/promises'),
  path = require('node:path'),
  { createHash, randomUUID } = require('node:crypto'),
  { TextDecoder } = require('node:util');
const { command } = require('./workspace-service'),
  { structuredPatch } = require('diff');
const hash = (value) => createHash('sha256').update(value).digest('hex'),
  MAX_FILE = 512 * 1024,
  MAX_TOTAL = 12 * 1024 * 1024,
  MAX_FILES = 1500;
const privateDirs = new Set(['.claude', '.codex', '.ssh', '.aws', '.azure', '.gnupg', '.kube']);
const sensitive = (name) =>
  name.split(/[\\/]/).some((part) => privateDirs.has(part)) ||
  (/^(?:credentials.*\.json|auth\.json|\.env(?:\..*)?)$/i.test(path.basename(name)) &&
    path.basename(name) !== '.env.example') ||
  /\.(?:pem|key|p12|pfx)$/i.test(name);
const skipped = new Set([
  ...privateDirs,
  'AppData',
  '.npm',
  '.nuget',
  '.gradle',
  '.m2',
  '.cargo',
  '.rustup',
  '.git',
  'node_modules',
  'dist',
  'build',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  'coverage',
  'target',
]);
function safeName(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('\0') ||
    path.isAbsolute(name) ||
    path.win32.isAbsolute(name) ||
    name.split(/[\\/]/).some((part) => part === '..' || !part)
  )
    throw Error('Invalid changed-file path.');
  return name.replace(/\\/g, '/');
}
function inside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
async function safePath(root, name) {
  name = safeName(name);
  if ((await fs.realpath(root)) !== root) throw Error('Project location changed.');
  const file = path.resolve(root, name);
  if (!inside(root, file)) throw Error('File is outside this project.');
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw Error('Symbolic links cannot be edited here.');
    } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
  }
  return file;
}
async function scan(root, exclude, permitted = async () => true) {
  // Match canonical task roots even when Windows supplies an 8.3 name or junction.
  if (exclude) exclude = await fs.realpath(exclude).catch(() => path.resolve(exclude));
  let names,
    limited = false;
  try {
    names = (await command('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'], root))
      .split('\0')
      .filter(Boolean);
  } catch {
    names = [];
    async function walk(folder, prefix = '') {
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        if (names.length >= MAX_FILES) {
          limited = true;
          return;
        }
        if (
          skipped.has(entry.name) ||
          sensitive(prefix + entry.name) ||
          entry.name.startsWith('.atlas-editor-') ||
          (exclude && (path.join(folder, entry.name) === exclude || inside(exclude, path.join(folder, entry.name))))
        )
          continue;
        const name = prefix + entry.name;
        if (entry.isDirectory()) await walk(path.join(folder, entry.name), name + '/');
        else if (entry.isFile()) names.push(name);
      }
    }
    await walk(root);
  }
  names = [...new Set(names)]
    .filter(
      (name) =>
        !sensitive(name) &&
        !path.basename(name).startsWith('.atlas-editor-') &&
        !(exclude && (path.resolve(root, name) === exclude || inside(exclude, path.resolve(root, name)))),
    )
    .sort();
  if (names.length > MAX_FILES) {
    limited = true;
    names = names.slice(0, MAX_FILES);
  }
  const files = Object.create(null);
  let total = 0;
  for (const raw of names) {
    let name, file, stat;
    try {
      name = safeName(raw);
      if (!(await permitted(root, name))) continue;
      file = await safePath(root, name);
      stat = await fs.lstat(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      limited = true;
      continue;
    }
    if (!stat.isFile()) continue;
    if (stat.size > MAX_FILE || total + stat.size > MAX_TOTAL) {
      files[name] = {
        hash: 'large:' + stat.size + ':' + stat.mtimeMs,
        size: stat.size,
        mode: stat.mode & 511,
        text: null,
      };
      limited = true;
      continue;
    }
    let bytes;
    try {
      bytes = await fs.readFile(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    total += bytes.length;
    let text = null;
    try {
      if (!bytes.includes(0)) text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {}
    files[name] = { hash: hash(bytes), size: bytes.length, mode: stat.mode & 511, text };
  }
  return { files, limited };
}
function changedFiles(before, after) {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort(),
    rows = [];
  let added = 0,
    removed = 0,
    complete = true;
  const deadline = Date.now() + 150;
  for (const name of names) {
    const a = before[name],
      b = after[name];
    if (a?.hash === b?.hash && a?.mode === b?.mode) continue;
    let patch = null,
      plus = null,
      minus = null;
    if ((!a || a.text !== null) && (!b || b.text !== null) && Date.now() < deadline) {
      patch = structuredPatch(name, name, a?.text || '', b?.text || '', '', '', {
        context: 3,
        stripTrailingCr: true,
        timeout: 30,
      });
      if (patch) {
        plus = 0;
        minus = 0;
        for (const hunk of patch.hunks)
          for (const line of hunk.lines) {
            if (line[0] === '+') plus++;
            else if (line[0] === '-') minus++;
          }
        added += plus;
        removed += minus;
      }
    }
    if (plus === null) complete = false;
    rows.push({
      path: name,
      status: !a ? 'added' : !b ? 'deleted' : 'modified',
      added: plus,
      removed: minus,
      binary: a?.text === null || b?.text === null,
      patch,
    });
  }
  return { files: rows, added, removed, complete };
}
function createChangeTracker(directory, { permitted } = {}) {
  const base = path.join(directory, 'changes'),
    loaded = new Map(),
    reports = new Map(),
    pending = new Map();
  const idPath = (id) => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw Error('Invalid task snapshot.');
    return path.join(base, id + '.json');
  };
  async function load(id) {
    if (loaded.has(id)) return loaded.get(id);
    const data = JSON.parse(await fs.readFile(idPath(id), 'utf8'));
    data.files = Object.assign(Object.create(null), data.files);
    if (loaded.size >= 4) loaded.delete(loaded.keys().next().value);
    loaded.set(id, data);
    return data;
  }
  async function capture(id, cwd) {
    const root = await fs.realpath(cwd);
    await fs.mkdir(base, { recursive: true });
    const snapshot = { cwd: root, createdAt: Date.now(), ...(await scan(root, directory, permitted)) };
    await fs.writeFile(idPath(id), JSON.stringify(snapshot), { flag: 'wx' });
    if (loaded.size >= 4) loaded.delete(loaded.keys().next().value);
    loaded.set(id, snapshot);
    return id;
  }
  async function report(id, force = false) {
    const cached = reports.get(id);
    if (!force && cached && Date.now() - cached.checkedAt < 1200) return cached;
    if (pending.has(id)) return pending.get(id);
    const promise = Promise.resolve()
      .then(async () => {
        const snapshot = await load(id),
          current = await scan(snapshot.cwd, directory, permitted);
        if (current.limited)
          for (const name of Object.keys(snapshot.files))
            if (!Object.hasOwn(current.files, name))
              try {
                const file = await safePath(snapshot.cwd, name);
                if ((await fs.stat(file)).isFile()) current.files[name] = snapshot.files[name];
              } catch (error) {
                if (error.code !== 'ENOENT') current.files[name] = snapshot.files[name];
              }
        const changes = changedFiles(snapshot.files, current.files),
          result = {
            ...changes,
            cwd: snapshot.cwd,
            createdAt: snapshot.createdAt,
            checkedAt: Date.now(),
            limited: snapshot.limited || current.limited,
          };
        if (reports.size >= 12) reports.delete(reports.keys().next().value);
        reports.set(id, result);
        return result;
      })
      .finally(() => pending.delete(id));
    pending.set(id, promise);
    return promise;
  }
  async function file(id, name) {
    name = safeName(name);
    const result = await report(id, true),
      row = result.files.find((row) => row.path === name);
    if (!row) throw Error('This file is no longer changed. Refresh the list.');
    const snapshot = await load(id),
      location = await safePath(snapshot.cwd, name);
    let bytes = null,
      stat = null;
    try {
      stat = await fs.stat(location);
      if (stat.size <= MAX_FILE) bytes = await fs.readFile(location);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const exists = Boolean(stat),
      binary = row.binary || bytes?.includes(0) || (!bytes && exists);
    let content = null;
    if (bytes && !binary)
      try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {}
    let lines = 0;
    const hunks = [];
    for (const hunk of row.patch?.hunks || []) {
      if (lines + hunk.lines.length > 3000) break;
      hunks.push(hunk);
      lines += hunk.lines.length;
    }
    return {
      path: name,
      status: row.status,
      added: row.added,
      removed: row.removed,
      content,
      originalContent: snapshot.files[name]?.text ?? null,
      version: bytes ? hash(bytes) + ':' + (stat.mode & 511) : null,
      editable: exists && !binary && content !== null,
      hunks,
      truncated: (row.patch?.hunks.length || 0) !== hunks.length,
      message: !row.patch ? 'Binary, large, or complex changes cannot be displayed inline.' : '',
    };
  }
  async function save(id, name, content, version) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_FILE || content.includes('\0'))
      throw Error('Use a UTF-8 text file under 512 KB.');
    const snapshot = await load(id),
      location = await safePath(snapshot.cwd, name),
      current = await file(id, name);
    if (!current.editable) throw Error('This file cannot be edited here.');
    if (current.version !== version)
      throw Error('The file changed on disk. Reload before saving to preserve those changes.');
    const stat = await fs.stat(location),
      temp = path.join(path.dirname(location), '.atlas-editor-' + randomUUID());
    try {
      await fs.writeFile(temp, content, { flag: 'wx', mode: stat.mode & 511 });
      await safePath(snapshot.cwd, name);
      const bytes = await fs.readFile(location),
        latest = await fs.stat(location);
      if (hash(bytes) + ':' + (latest.mode & 511) !== version)
        throw Error('The file changed on disk. Reload before saving.');
      await fs.rename(temp, location);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
    reports.delete(id);
    return { saved: true };
  }
  async function seal(id) {
    const snapshot = await load(id),
      current = await scan(snapshot.cwd, directory, permitted);
    snapshot.after = Object.fromEntries(
      changedFiles(snapshot.files, current.files).files.map((row) => [
        row.path,
        current.files[row.path] ? { hash: current.files[row.path].hash, mode: current.files[row.path].mode } : null,
      ]),
    );
    await fs.writeFile(idPath(id), JSON.stringify(snapshot));
  }
  async function restorePreview(id, selected) {
    const snapshot = await load(id);
    if (!snapshot.after) throw Error('This task has no completed checkpoint yet.');
    const current = await scan(snapshot.cwd, directory, permitted),
      files = Object.keys(snapshot.after).filter((name) => !selected || selected.includes(name)),
      conflicts = [];
    for (const name of files) {
      const expected = snapshot.after[name],
        actual = current.files[name];
      if ((expected?.hash || null) !== (actual?.hash || null) || (expected?.mode ?? null) !== (actual?.mode ?? null))
        conflicts.push(name);
      if (snapshot.files[name]?.text === null || expected?.hash?.startsWith('large:'))
        throw Error('This checkpoint contains binary or large originals/changes. Restore those files with Git.');
      await safePath(snapshot.cwd, name);
    }
    if (conflicts.length)
      throw Error('Later edits found in ' + conflicts.slice(0, 5).join(', ') + '. Restore cancelled to preserve them.');
    return {
      files,
      cwd: snapshot.cwd,
      token: hash(JSON.stringify([snapshot.after, files])),
      limited: snapshot.limited,
    };
  }
  async function restore(id, token, selected) {
    const preview = await restorePreview(id, selected);
    if (preview.token !== token) throw Error('Checkpoint changed. Review it again.');
    const snapshot = await load(id),
      backupId = 'undo-' + randomUUID();
    await capture(backupId, snapshot.cwd);
    for (const name of preview.files) {
      const location = await safePath(snapshot.cwd, name),
        original = snapshot.files[name];
      let current = null;
      try {
        const stat = await fs.stat(location);
        if (stat.size > MAX_FILE) throw Error('This file grew beyond the checkpoint limit: ' + name);
        const bytes = await fs.readFile(location);
        current = { hash: hash(bytes), mode: stat.mode & 511 };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const expected = snapshot.after[name];
      if ((expected?.hash || null) !== (current?.hash || null) || (expected?.mode ?? null) !== (current?.mode ?? null))
        throw Error('A file changed during restore: ' + name + '. Recovery snapshot: ' + backupId + '.');
      if (!original) {
        await fs.unlink(location).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
        });
        continue;
      }
      await fs.mkdir(path.dirname(location), { recursive: true });
      await safePath(snapshot.cwd, name);
      const temp = path.join(path.dirname(location), '.atlas-editor-' + randomUUID());
      try {
        await fs.writeFile(temp, original.text, { flag: 'wx', mode: original.mode });
        await fs.rename(temp, location);
        await fs.chmod(location, original.mode);
      } finally {
        await fs.unlink(temp).catch(() => {});
      }
    }
    await seal(backupId);
    reports.delete(id);
    return {
      restored: true,
      files: preview.files,
      backupId,
      message:
        'Working files restored to their pre-task contents. The Git index and commits were preserved; a recovery snapshot was saved.',
    };
  }
  async function fingerprint(id) {
    const snapshot = await load(id),
      current = await scan(snapshot.cwd, directory, permitted);
    return {
      value: hash(JSON.stringify(Object.entries(current.files).map(([name, file]) => [name, file.hash, file.mode]))),
      complete: !current.limited,
    };
  }
  return { capture, report, file, save, seal, restorePreview, restore, fingerprint };
}
module.exports = { createChangeTracker, changedFiles };
