const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
// Electron's fs treats .asar files as folders, so copying the installed app needs the unpatched one.
const rawFs = process.versions.electron ? require('original-fs').promises : fs;
async function copyApp(source, target) {
  await rawFs.mkdir(target, { recursive: true });
  for (const entry of await rawFs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name),
      to = path.join(target, entry.name);
    if (entry.isDirectory()) await copyApp(from, to);
    else if (entry.isFile()) await rawFs.copyFile(from, to);
  }
}
function createUpdateRecovery({ directory, appRoot, version, backupData, restoreData, launch, approve, isPackaged }) {
  const file = path.join(directory, 'update-recovery.json');
  async function status() {
    return JSON.parse(
      await fs.readFile(file, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return 'null';
        throw error;
      }),
    );
  }
  async function prepare() {
    if (!isPackaged) return { source: true };
    const root = await fs.realpath(appRoot);
    if (root === path.parse(root).root || root === path.dirname(root) || root === (await fs.realpath(directory)))
      throw Error('Unsafe application recovery location.');
    if (
      !(await approve(
        'Preserve this version before updating?',
        'A local copy of ATLAS ' +
          version +
          ' and its app records will be retained for rollback. This can require substantial disk space. No data is uploaded.',
      ))
    )
      throw Error('Update cancelled: recovery copy was not approved.');
    const folder = path.join(directory, 'update-recovery', randomUUID());
    try {
      await fs.mkdir(folder, { recursive: true });
      const data = await backupData();
      await fs.writeFile(path.join(folder, 'data.atlas-backup'), data, { mode: 0o600 });
      const target = path.join(folder, 'app');
      await copyApp(root, target);
      const executable = path.join(target, path.basename(process.execPath));
      await fs.access(executable);
      const row = { version, createdAt: Date.now(), folder, executable, data: path.join(folder, 'data.atlas-backup') };
      await fs.writeFile(file, JSON.stringify(row));
      return row;
    } catch (error) {
      await rawFs.rm(folder, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }
  async function rollback() {
    const row = await status();
    if (!row) throw Error('No pre-update recovery copy exists yet.');
    const base = await fs.realpath(path.join(directory, 'update-recovery')),
      folder = await fs.realpath(row.folder),
      executable = await fs.realpath(row.executable),
      data = await fs.realpath(row.data);
    if (
      !require('./project-files').within(base, folder) ||
      !require('./project-files').within(folder, executable) ||
      !require('./project-files').within(folder, data)
    )
      throw Error('Recovery paths changed.');
    if (
      !(await approve(
        'Launch the preserved version and restore its data?',
        'Version ' +
          row.version +
          '\nSaved ' +
          new Date(row.createdAt).toLocaleString() +
          '\nExecutable: ' +
          executable +
          '\n\nCurrent managed records will be preserved in a recovery backup. ATLAS will close and launch its local preserved copy. The newer installation remains available.',
      ))
    )
      return { cancelled: true };
    await restoreData(await fs.readFile(data));
    await launch(executable);
    return { launching: true };
  }
  return { prepare, status, rollback };
}
module.exports = { createUpdateRecovery };
