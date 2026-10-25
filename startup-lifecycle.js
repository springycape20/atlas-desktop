const fs = require('node:fs/promises'),
  path = require('node:path');
function singleInstance(app, getWindow) {
  if (typeof app.requestSingleInstanceLock !== 'function') return true;
  if (!app.requestSingleInstanceLock()) {
    app.exit(0);
    return false;
  }
  app.on('second-instance', () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  return true;
}
function configureChromiumCache(app, { base = process.env.LOCALAPPDATA || require('node:os').tmpdir() } = {}) {
  if (!app.commandLine?.appendSwitch) return;
  const disk = require('node:fs'),
    profile = require('node:crypto')
      .createHash('sha256')
      .update(path.resolve(app.getPath('userData')))
      .digest('hex')
      .slice(0, 20);
  let directory = path.join(base, 'ATLAS', 'ChromiumCache-v2', profile);
  function writable(folder) {
    disk.mkdirSync(folder, { recursive: true });
    const probe = path.join(folder, 'write-probe-' + require('node:crypto').randomUUID());
    disk.writeFileSync(probe, '', { flag: 'wx' });
    disk.unlinkSync(probe);
  }
  try {
    writable(directory);
  } catch {
    directory = path.join(require('node:os').tmpdir(), 'atlas-chromium-cache-' + profile);
    writable(directory);
  }
  app.commandLine.appendSwitch('disk-cache-dir', directory);
  // Chromium's shader cache has a separate path and can be locked by older
  // development instances. Keep GPU acceleration and memory caching enabled.
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
  return directory;
}
async function migrateOnce(source, destination) {
  const marker = path.join(destination, '.legacy-migration-v1.json');
  try {
    const done = JSON.parse(await fs.readFile(marker, 'utf8'));
    if (done.source === path.resolve(source)) return { skipped: true };
  } catch {}
  try {
    await fs.access(source);
  } catch (error) {
    if (error.code === 'ENOENT') return { skipped: true };
    throw error;
  }
  await fs.mkdir(destination, { recursive: true });
  const errors = [];
  // Keep links already present at the destination: uv's minor-version Python
  // junctions point back into the legacy folder, which cp rejects as a self-copy.
  const filter = async (from, to) => {
    try {
      await fs.lstat(to);
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      throw error;
    }
    return !(await fs.lstat(from)).isSymbolicLink();
  };
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name),
      to = path.join(destination, entry.name);
    // The marker belongs to this destination and is written only after success.
    if (entry.name === '.legacy-migration-v1.json') continue;
    try {
      let exists = true;
      try {
        await fs.access(to);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        exists = false;
      }
      if (exists) {
        if (entry.isDirectory()) await fs.cp(from, to, { recursive: true, force: false, errorOnExist: false, filter });
      } else
        try {
          await fs.rename(from, to);
        } catch (error) {
          if (error.code !== 'EXDEV') throw error;
          await fs.cp(from, to, { recursive: true, force: false, errorOnExist: false });
        }
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(
      errors,
      'Some legacy ATLAS data could not be migrated; it will be retried on the next launch.',
    );
  await require('./atomic-store')
    .createAtomicStore(marker)
    .save({ source: path.resolve(source), completedAt: Date.now() });
  return { skipped: false };
}
module.exports = { singleInstance, migrateOnce, configureChromiumCache };
