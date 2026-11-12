const fs = require('node:fs'),
  path = require('node:path'),
  zlib = require('node:zlib'),
  { createHash, randomUUID } = require('node:crypto');
const folders = new Set(['attachments', 'changes', 'task-evidence', 'colab-reports', 'chat-chunks']);
const managed = (name) => folders.has(name) || (/^[\w.-]+\.(json|enc)$/.test(name) && !name.startsWith('.'));
const safe = (name) =>
  typeof name === 'string' &&
  !name.includes('\\') &&
  !name.includes(':') &&
  !name.includes('\0') &&
  !name.startsWith('/') &&
  name.split('/').every((part) => part && part !== '.' && part !== '..') &&
  managed(name.split('/')[0]);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tooLarge = () =>
  Object.assign(Error('ATLAS records are over the backup limit of 256 MiB or 20,000 files.'), {
    code: 'ATLAS_BACKUP_LIMIT',
  });
function collect(root, { progress = () => {} } = {}) {
  assertDirectory(root);
  const rows = [];
  let total = 0;
  const record = (name, file, stat) => {
    const bytes = fs.readFileSync(file),
      after = fs.lstatSync(file);
    if (
      after.isSymbolicLink() ||
      stat.ino !== after.ino ||
      stat.size !== after.size ||
      stat.mtimeMs !== after.mtimeMs ||
      bytes.length !== after.size
    )
      throw Error('Local records changed during backup. Try again after saves finish.');
    rows.push({ path: name, size: bytes.length, sha256: digest(bytes), data: bytes.toString('base64') });
    if (rows.length % 100 === 0) progress({ phase: 'collecting', files: rows.length, bytes: total });
  };
  progress({ phase: 'collecting', files: 0, bytes: 0 });
  function walk(folder, prefix) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const name = prefix + entry.name,
        file = path.join(folder, entry.name),
        stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw Error('Backup refuses linked data: ' + name);
      if (entry.isDirectory()) walk(file, name + '/');
      else if (entry.isFile()) {
        if ((total += stat.size) > 256 * 1024 * 1024 || rows.length >= 20000) throw tooLarge();
        record(name, file, stat);
      }
    }
  }
  for (const name of fs.readdirSync(root)) {
    if (!managed(name)) continue;
    const file = path.join(root, name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw Error('Backup refuses linked data: ' + name);
    if (stat.isDirectory()) walk(file, name + '/');
    else {
      if ((total += stat.size) > 256 * 1024 * 1024 || rows.length >= 20000) throw tooLarge();
      record(name, file, stat);
    }
  }
  return rows;
}
function validate(bytes) {
  if (bytes.length > 256 * 1024 * 1024) throw Error('Backup is too large.');
  const value = JSON.parse(zlib.gunzipSync(bytes, { maxOutputLength: 400 * 1024 * 1024 }));
  if (value.format !== 'atlas-backup-v1' || !Array.isArray(value.files) || value.files.length > 20000)
    throw Error('Unsupported backup.');
  const names = new Set();
  let total = 0;
  for (const row of value.files) {
    if (!safe(row.path) || names.has(row.path)) throw Error('Unsafe or duplicate backup path.');
    names.add(row.path);
    const data = Buffer.from(row.data, 'base64');
    if (data.length !== row.size || digest(data) !== row.sha256 || (total += data.length) > 256 * 1024 * 1024)
      throw Error('Backup integrity/size check failed.');
  }
  return value;
}
function createBackup(root, version, renderer, { progress = () => {} } = {}) {
  const files = collect(root, { progress });
  progress({ phase: 'compressing', files: files.length, bytes: files.reduce((sum, row) => sum + row.size, 0) });
  return zlib.gzipSync(
    Buffer.from(JSON.stringify({ format: 'atlas-backup-v1', version, createdAt: Date.now(), files, renderer })),
  );
}
function stageRestore(root, bytes) {
  assertDirectory(root);
  assertChildDirectory(root, 'restore-staging');
  const value = validate(bytes),
    id = randomUUID(),
    stage = path.join(root, 'restore-staging', id);
  fs.mkdirSync(stage, { recursive: true });
  for (const row of value.files) {
    const target = path.join(stage, ...row.path.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(row.data, 'base64'), { mode: 0o600 });
  }
  fs.writeFileSync(path.join(stage, 'renderer-state.json'), JSON.stringify(value.renderer || {}));
  const expected = collect(stage).map(({ path, size, sha256 }) => ({ path, size, sha256 }));
  fs.writeFileSync(path.join(root, '.restore-pending.json'), JSON.stringify({ id, version: value.version, expected }));
  return { id, version: value.version, files: value.files.length, createdAt: value.createdAt };
}
// A failed request is cleared, so it reports once instead of failing on every launch.
function applyPendingRestore(root) {
  const marker = path.join(root, '.restore-pending.json');
  if (!fs.existsSync(marker)) return false;
  try {
    return applyRestore(root, marker);
  } catch (error) {
    fs.rmSync(marker, { force: true });
    throw error;
  }
}
function applyRestore(root, marker) {
  assertDirectory(root);
  assertChildDirectory(root, 'restore-staging');
  assertChildDirectory(root, 'recovery-backups');
  const { id, expected } = JSON.parse(fs.readFileSync(marker));
  if (!/^[\w-]{1,80}$/.test(id)) throw Error('Invalid restore request.');
  const stage = path.join(root, 'restore-staging', id),
    recovery = path.join(root, 'recovery-backups', id);
  if (fs.lstatSync(stage).isSymbolicLink()) throw Error('Linked restore stage refused.');
  const actual = collect(stage).map(({ path, size, sha256 }) => ({ path, size, sha256 }));
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw Error('Staged restore data changed; select the backup again.');
  assertChildDirectory(path.join(root, 'recovery-backups'), id);
  fs.mkdirSync(recovery, { recursive: true });
  const moved = [],
    installed = [];
  try {
    for (const name of fs.readdirSync(root).filter(managed)) {
      fs.renameSync(path.join(root, name), path.join(recovery, name));
      moved.push(name);
    }
    for (const name of fs.readdirSync(stage).filter(managed)) {
      fs.renameSync(path.join(stage, name), path.join(root, name));
      installed.push(name);
    }
    fs.renameSync(path.join(root, 'renderer-state.json'), path.join(root, '.renderer-restore.json'));
    fs.unlinkSync(marker);
    return true;
  } catch (error) {
    if (installed.includes('renderer-state.json') && fs.existsSync(path.join(root, '.renderer-restore.json')))
      fs.renameSync(path.join(root, '.renderer-restore.json'), path.join(root, 'renderer-state.json'));
    for (const name of installed.reverse()) fs.renameSync(path.join(root, name), path.join(stage, name));
    for (const name of moved.reverse()) fs.renameSync(path.join(recovery, name), path.join(root, name));
    throw error;
  }
}
module.exports = { createBackup, validate, stageRestore, applyPendingRestore, collect, canonicalDirectory };
// Expand Windows 8.3 aliases without accepting a symlink/junction at any level.
// realpath alone cannot distinguish those two cases.
function canonicalDirectory(root, { allowMissing = false } = {}) {
  const absolute = path.resolve(root),
    base = path.parse(absolute).root,
    parts = path.relative(base, absolute).split(path.sep).filter(Boolean);
  let current = base;
  for (let i = 0; i < parts.length; i++) {
    const parent = current;
    current = path.join(current, parts[i]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT' && allowMissing) return path.join(fs.realpathSync.native(parent), ...parts.slice(i));
      throw error;
    }
    if (stat.isSymbolicLink()) throw Error('Linked app data directory refused.');
    if (!stat.isDirectory()) throw Error('Choose an app data directory.');
  }
  return fs.realpathSync.native(absolute);
}
function assertDirectory(root) {
  canonicalDirectory(root);
}
function assertChildDirectory(root, name) {
  const target = path.join(root, name);
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw Error('Linked recovery directory refused.');
}
