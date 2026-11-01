const fs = require('node:fs/promises'),
  path = require('node:path');
// App copies contain .asar files, which Electron's fs treats as folders.
const rawFs = process.versions.electron ? require('original-fs').promises : fs;
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const inside = (parent, child) => {
  const relative = path.relative(parent.toLowerCase(), child.toLowerCase());
  return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
async function size(folder) {
  let bytes = 0;
  for (const entry of await rawFs.readdir(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name),
      stat = await rawFs.lstat(file);
    if (stat.isDirectory()) bytes += await size(file);
    else if (stat.isFile()) bytes += stat.size;
  }
  return bytes;
}
async function folders(parent) {
  const stat = await rawFs.lstat(parent).catch(() => null);
  if (!stat?.isDirectory()) return [];
  const rows = [];
  for (const entry of await rawFs.readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(parent, entry.name);
    rows.push({ folder, modified: (await rawFs.lstat(folder)).mtimeMs });
  }
  return rows.sort((a, b) => b.modified - a.modified);
}
// Only the copy update-recovery.json names can be rolled back to, and only the newest
// pre-restore records are kept as the obvious way back.
function createRecoveryCleanup(directory, { runningFrom = process.execPath } = {}) {
  async function inspect() {
    const candidates = [];
    const current = await fs
      .readFile(path.join(directory, 'update-recovery.json'), 'utf8')
      .then(JSON.parse)
      .catch((error) => (error.code === 'ENOENT' ? null : { unreadable: true }));
    // If the record cannot be read, which copy is the rollback target is unknown: offer none.
    if (!current?.unreadable)
      for (const { folder, modified } of await folders(path.join(directory, 'update-recovery')))
        if (!(current?.folder && same(current.folder, folder)) && !inside(folder, runningFrom))
          candidates.push({ kind: 'App copy', name: 'update-recovery/' + path.basename(folder), folder, modified });
    for (const { folder, modified } of (await folders(path.join(directory, 'recovery-backups'))).slice(1))
      candidates.push({
        kind: 'Records before a restore',
        name: 'recovery-backups/' + path.basename(folder),
        folder,
        modified,
      });
    return Promise.all(candidates.map(async ({ folder, ...row }) => ({ ...row, bytes: await size(folder) })));
  }
  async function remove(names) {
    if (!Array.isArray(names) || !names.length) throw Error('Choose recovery copies to delete.');
    const current = await inspect();
    if (names.some((name) => !current.some((row) => row.name === name)))
      throw Error('Recovery copies changed. Review them again.');
    for (const name of names) await rawFs.rm(path.join(directory, ...name.split('/')), { recursive: true });
    return { removed: names.length };
  }
  return { inspect, remove };
}
module.exports = { createRecoveryCleanup };
