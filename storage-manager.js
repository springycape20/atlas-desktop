const fs = require('node:fs/promises'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
function createStorageManager(root, { protectedIds = () => [] } = {}) {
  async function inspect(days = 30) {
    if (![0, 7, 30, 90, 365].includes(Number(days))) throw Error('Choose 0, 7, 30, 90 or 365 days.');
    const candidates = [],
      totals = [];
    const protectedSet = new Set(await protectedIds());
    for (const category of [
      'attachments',
      'changes',
      'task-evidence',
      'colab-reports',
      'worktrees',
      'recovery-backups',
    ]) {
      let bytes = 0,
        count = 0;
      async function walk(folder, prefix = '') {
        const directory = await fs.lstat(folder).catch(() => null);
        if (!directory?.isDirectory() || directory.isSymbolicLink()) return;
        for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) {
          const name = path.join(folder, entry.name),
            stat = await fs.lstat(name);
          if (stat.isSymbolicLink()) continue;
          if (stat.isDirectory()) await walk(name, prefix + entry.name + '/');
          else if (stat.isFile()) {
            bytes += stat.size;
            count++;
            const stem = entry.name.replace(/\.meta\.json$|\.json$/, '');
            if (
              ['changes', 'task-evidence'].includes(category) &&
              !(category === 'task-evidence' && prefix.startsWith('trial-snapshots/')) &&
              !protectedSet.has(stem) &&
              !stem.startsWith('named-') &&
              !stem.startsWith('undo-') &&
              (!Number(days) || Date.now() - stat.mtimeMs >= Number(days) * 86400000)
            )
              candidates.push({ path: category + '/' + prefix + entry.name, size: stat.size, mtime: stat.mtimeMs });
          }
        }
      }
      await walk(path.join(root, category));
      totals.push({ category, bytes, files: count });
    }
    const token = createHash('sha256').update(JSON.stringify(candidates)).digest('hex');
    return { totals, candidates, token, days: Number(days) };
  }
  async function remove(request) {
    const current = await inspect(request.days);
    if (current.token !== request.token) throw Error('Storage changed. Review cleanup again.');
    if (
      !Array.isArray(request.paths) ||
      request.paths.some((name) => !current.candidates.some((row) => row.path === name))
    )
      throw Error('Only reviewed eligible files can be removed.');
    for (const name of request.paths) {
      const actual = path.resolve(root, ...name.split('/'));
      if (!actual.startsWith(path.resolve(root) + path.sep)) throw Error('Unsafe cleanup target.');
      const realRoot = await fs.realpath(root),
        parent = await fs.realpath(path.dirname(actual));
      if (!require('./project-files').within(realRoot, parent)) throw Error('Linked cleanup target refused.');
      await fs.unlink(actual);
    }
    return { removed: request.paths.length };
  }
  return { inspect, remove };
}
module.exports = { createStorageManager };
