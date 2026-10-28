const fs = require('node:fs');
const path = require('node:path');
const MARKER = '.data-reset-request-v1.json';
const kept = new Set(['tools', '.legacy-migration-v1.json']);
function writeMarker(root, name, value) {
  const temp = path.join(root, name + '.' + require('node:crypto').randomUUID() + '.tmp');
  try {
    fs.writeFileSync(temp, JSON.stringify(value), { flag: 'wx' });
    // Replace directory entries atomically, rather than following an existing
    // marker symlink/hardlink into a different file.
    fs.renameSync(temp, path.join(root, name));
  } finally {
    try {
      fs.unlinkSync(temp);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
function checkDirectory(directory) {
  const root = path.resolve(directory);
  if (
    root === path.parse(root).root ||
    fs.lstatSync(root).isSymbolicLink() ||
    fs.realpathSync(root).toLowerCase() !== root.toLowerCase()
  )
    throw Error('The ATLAS data directory cannot be reset safely.');
  return root;
}
function requestReset(directory) {
  const root = checkDirectory(directory);
  writeMarker(root, MARKER, { version: 1 });
}
// Runs after the single-instance lock, before stores and Chromium open any data.
function applyPendingReset(directory, legacyDirectory) {
  if (!fs.existsSync(path.join(directory, MARKER))) return false;
  const root = checkDirectory(directory);
  const request = fs.lstatSync(path.join(root, MARKER));
  if (!request.isFile() || request.isSymbolicLink() || request.size > 200) throw Error('Invalid data reset request.');
  if (JSON.parse(fs.readFileSync(path.join(root, MARKER), 'utf8')).version !== 1)
    throw Error('Invalid data reset request.');
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === MARKER || kept.has(entry.name)) continue;
    const target = path.resolve(root, entry.name);
    if (!target.startsWith(root + path.sep)) throw Error('Data reset target is outside ATLAS.');
    if (fs.lstatSync(target).isSymbolicLink()) fs.unlinkSync(target);
    else fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
  // Prevent surviving legacy copies from being silently imported again.
  writeMarker(root, '.legacy-migration-v1.json', { source: path.resolve(legacyDirectory), completedAt: Date.now() });
  fs.unlinkSync(path.join(root, MARKER));
  return true;
}
module.exports = { requestReset, applyPendingReset };
