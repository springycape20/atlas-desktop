const fs = require('node:fs/promises'),
  path = require('node:path');
const NAME = /^ATLAS-auto-[\dT-]+\.atlas-backup$/;
// ponytail: createBackup is synchronous, so a very large data folder pauses the app briefly once a
// day; move it to a worker if that is ever noticed.
function createAutoBackups({ directory, make, busy = () => false, keep = 7, every = 86400000, now = Date.now }) {
  const folder = path.join(directory, 'auto-backups'),
    file = path.join(directory, 'auto-backup.json');
  const read = () =>
    fs
      .readFile(file, 'utf8')
      .then(JSON.parse)
      .catch(() => ({}));
  const write = async (state) => fs.writeFile(file, JSON.stringify(state));
  const list = async () =>
    (await fs.readdir(folder).catch(() => []))
      .filter((name) => NAME.test(name))
      .sort()
      .reverse();
  async function status() {
    const state = await read();
    return {
      enabled: state.enabled !== false,
      lastAt: state.lastAt || 0,
      lastError: state.lastError || '',
      copies: (await list()).length,
      keep,
      folder,
    };
  }
  async function setEnabled(enabled) {
    await write({ ...(await read()), enabled: enabled === true });
    return status();
  }
  // Failures wait for the next day as well: a data folder over the limit would otherwise be
  // read in full every hour.
  async function tick() {
    const state = await read();
    if (state.enabled === false || busy() || now() - (state.triedAt || 0) < every) return false;
    const stamp = new Date(now()).toISOString().slice(0, 19).replaceAll(':', '-'),
      target = path.join(folder, 'ATLAS-auto-' + stamp + '.atlas-backup');
    try {
      const bytes = await make();
      await fs.mkdir(folder, { recursive: true });
      await fs.writeFile(target + '.tmp', bytes, { mode: 0o600 });
      await fs.rename(target + '.tmp', target);
      for (const name of (await list()).slice(keep)) await fs.rm(path.join(folder, name), { force: true });
      await write({ ...state, triedAt: now(), lastAt: now(), lastError: '' });
      return true;
    } catch (error) {
      await fs.rm(target + '.tmp', { force: true }).catch(() => {});
      await write({ ...state, triedAt: now(), lastError: error.message });
      throw error;
    }
  }
  return { status, setEnabled, tick, folder };
}
module.exports = { createAutoBackups };
