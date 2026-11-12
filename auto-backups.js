const fs = require('node:fs/promises'),
  path = require('node:path');
const NAME = /^ATLAS-auto-[\dT-]+\.atlas-backup$/;
function createAutoBackups({ directory, make, busy = () => false, keep = 7, every = 86400000, now = Date.now }) {
  directory = require('./local-backups').canonicalDirectory(directory, { allowMissing: true });
  const defaultFolder = path.join(directory, 'auto-backups'),
    file = path.join(directory, 'auto-backup.json');
  const store = require('./atomic-store').createAtomicStore(file);
  const owner = require('node:crypto').createHash('sha256').update(path.resolve(directory).toLowerCase()).digest('hex');
  let running;
  const read = () =>
    fs
      .readFile(file, 'utf8')
      .then(JSON.parse)
      .catch(() => ({}));
  const write = async (state) => {
    await store.save(state);
    await store.flush();
  };
  async function destination(state = {}) {
    const folder = state.folder || defaultFolder;
    const canonical = require('./local-backups').canonicalDirectory(folder, { allowMissing: true });
    const stat = await fs.lstat(folder).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (
      stat &&
      (stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        path.resolve(canonical).toLowerCase() !== path.resolve(folder).toLowerCase())
    )
      throw Error('Backup destination changed or points through a link. Choose the folder again.');
    if (state.folder) {
      const marker = path.join(folder, '.atlas-backup-owner');
      const markerStat = await fs.lstat(marker).catch(() => null);
      if (!markerStat?.isFile() || markerStat.isSymbolicLink() || (await fs.readFile(marker, 'utf8')) !== owner)
        throw Error(
          'This backup destination belongs to another data folder or is unavailable. Choose a destination again.',
        );
    }
    return folder;
  }
  const list = async (folder) =>
    (
      await fs.readdir(folder).catch((error) => {
        if (error.code === 'ENOENT') return [];
        throw error;
      })
    )
      .filter((name) => NAME.test(name))
      .sort()
      .reverse();
  async function status() {
    const state = await read();
    const folder = state.folder || defaultFolder;
    let destinationError = '';
    try {
      await destination(state);
    } catch (error) {
      destinationError = error.message;
    }
    return {
      enabled: state.enabled !== false,
      lastAt: state.lastAt || 0,
      lastError: destinationError || state.lastError || '',
      copies: destinationError ? null : (await list(folder)).length,
      keep,
      folder,
      running: Boolean(running),
    };
  }
  async function setEnabled(enabled) {
    await write({ ...(await read()), enabled: enabled === true });
    return status();
  }
  async function setFolder(parent) {
    if (running) throw Error('Wait for the current backup before changing its destination.');
    let folder;
    if (parent) {
      const base = await fs.realpath(parent);
      if (!(await fs.stat(base)).isDirectory()) throw Error('Choose a backup directory.');
      const relative = path.relative(await fs.realpath(directory), base);
      if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)))
        throw Error('Choose a destination outside ATLAS data to avoid nested backups.');
      folder = path.join(base, 'ATLAS automatic backups');
      await fs.mkdir(folder, { recursive: true });
      const marker = path.join(folder, '.atlas-backup-owner');
      const entries = await fs.readdir(folder);
      if (!entries.includes('.atlas-backup-owner')) {
        if (entries.length) throw Error('The destination already contains files. Choose another location.');
        await fs.writeFile(marker, owner, { flag: 'wx', mode: 0o600 });
      }
      await destination({ folder });
    }
    await write({ ...(await read()), folder: folder || undefined });
    return status();
  }
  // Failures wait for the next day as well: a data folder over the limit would otherwise be
  // read in full every hour.
  async function perform({ force = false } = {}) {
    const state = await read();
    if (busy() || (!force && (state.enabled === false || now() - (state.triedAt || 0) < every))) return false;
    const folder = await destination(state);
    const stamp = new Date(now()).toISOString().slice(0, 19).replaceAll(':', '-'),
      target = path.join(folder, 'ATLAS-auto-' + stamp + '.atlas-backup');
    try {
      const bytes = await make();
      await destination(state);
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(target + '.tmp', bytes, { mode: 0o600 });
      await fs.rename(target + '.tmp', target);
      await destination(state);
      for (const name of (await list(folder)).slice(keep)) await fs.rm(path.join(folder, name), { force: true });
      await write({ ...(await read()), triedAt: now(), lastAt: now(), lastError: '' });
      return true;
    } catch (error) {
      await fs.rm(target + '.tmp', { force: true }).catch(() => {});
      await write({ ...(await read()), triedAt: now(), lastError: error.message });
      throw error;
    }
  }
  function tick(options) {
    if (running) return running;
    const pending = perform(options);
    running = pending;
    return pending.finally(() => {
      if (running === pending) running = null;
    });
  }
  return { status, setEnabled, setFolder, tick, folder: defaultFolder };
}
module.exports = { createAutoBackups };
