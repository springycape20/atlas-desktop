const fs = require('node:fs/promises'),
  path = require('node:path'),
  { createHash } = require('node:crypto');
const { command } = require('./workspace-service');
const skipped = new Set([
  '.git',
  '.claude',
  '.codex',
  '.ssh',
  '.aws',
  '.azure',
  '.gnupg',
  '.kube',
  '.handover',
  '.agents',
  'node_modules',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.cache',
  'coverage',
  'target',
]);
const allowed = (name) =>
  Boolean(name) &&
  name.length <= 1024 &&
  !/[\x00-\x1f\x7f]/.test(name) &&
  !path.isAbsolute(name) &&
  !path.win32.isAbsolute(name) &&
  !name.split(/[\\/]/).some((part) => part === '..' || skipped.has(part)) &&
  !/(?:^|\/)(?:\.env(?:\..*)?|auth\.json|credentials[^/]*\.json|\.npmrc|\.netrc|\.git-credentials|id_rsa[^/]*|secrets\.[^/]*)$|\.(?:pem|key|pfx|p12|token)$/i.test(
    name,
  );
function createProjectContext({ directory, listFiles } = {}) {
  const cache = new Map(),
    store = directory ? require('./atomic-store').createAtomicStore(path.join(directory, 'project-index.json')) : null;
  let loaded;
  async function load() {
    if (!loaded)
      loaded = (async () => {
        if (!directory) return;
        try {
          const rows = JSON.parse(await fs.readFile(path.join(directory, 'project-index.json'), 'utf8'));
          for (const row of Array.isArray(rows) ? rows.slice(-20) : [])
            if (typeof row.cwd === 'string' && Array.isArray(row.commands)) cache.set(row.cwd, row);
        } catch {}
      })();
    return loaded;
  }
  async function files(root, signal) {
    signal?.throwIfAborted();
    try {
      return (
        listFiles
          ? await listFiles(root)
          : (
              await command(
                'git',
                [
                  '-c',
                  'core.fsmonitor=false',
                  '-c',
                  'core.hooksPath=',
                  'ls-files',
                  '--cached',
                  '--others',
                  '--exclude-standard',
                  '-z',
                  '--',
                  '.',
                ],
                root,
                { timeout: 10000, signal },
              )
            ).split('\0')
      )
        .map((name) => String(name).replace(/\\/g, '/'))
        .filter(allowed)
        .sort()
        .slice(0, 25000);
    } catch {
      signal?.throwIfAborted();
      const rows = [];
      let visits = 0;
      async function walk(folder, prefix = '') {
        for (const item of await fs.readdir(folder, { withFileTypes: true })) {
          signal?.throwIfAborted();
          if (++visits > 3500 || rows.length >= 2500) return;
          const name = prefix + item.name;
          if (!allowed(name) || item.isSymbolicLink()) continue;
          if (item.isDirectory()) await walk(path.join(folder, item.name), name + '/');
          else if (item.isFile()) rows.push(name);
        }
      }
      await walk(root);
      return rows.sort();
    }
  }
  async function context(cwd, task, { limit = 6000, signal } = {}) {
    signal?.throwIfAborted();
    await load();
    const root = await fs.realpath(cwd),
      candidates = await files(root, signal),
      words =
        String(task)
          .toLowerCase()
          .match(/[a-z0-9_]{3,}/g) || [],
      score = (name) =>
        words.reduce((sum, word) => sum + (name.toLowerCase().includes(word) ? 5 : 0), 0) +
        (/(?:^|\/)(?:readme|package\.json|pyproject\.toml|cargo\.toml|agents\.md)/i.test(name) ? 3 : 0) +
        (/(?:^|\/)(?:src|app|tests?)\//.test(name) ? 1 : 0),
      names = [...candidates].sort((a, b) => score(b) - score(a) || a.localeCompare(b)).slice(0, 2500);
    signal?.throwIfAborted();
    let packageText = '';
    try {
      const file = path.join(root, 'package.json'),
        stat = await fs.lstat(file);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size < 200000) packageText = await fs.readFile(file, 'utf8');
    } catch {}
    const signature = createHash('sha256')
      .update(JSON.stringify(names) + packageText)
      .digest('hex');
    let row = cache.get(root);
    if (!Array.isArray(row?.names) || row.signature !== signature) {
      const commands = [];
      try {
        const pkg = JSON.parse(packageText),
          manager = names.includes('pnpm-lock.yaml') ? 'pnpm' : names.includes('yarn.lock') ? 'yarn' : 'npm';
        for (const name of Object.keys(pkg.scripts || {}))
          if (/^(?:test|lint|build|typecheck|check|start|dev)(?::[a-z0-9_-]+)?$/i.test(name))
            commands.push(manager + ' run ' + name);
      } catch {}
      if (names.includes('Cargo.toml')) commands.push('cargo test');
      if (names.includes('pyproject.toml') || names.includes('pytest.ini')) commands.push('python -m pytest');
      row = { cwd: root, signature, names, commands: commands.slice(0, 12), checkedAt: Date.now() };
      cache.delete(root);
      cache.set(root, row);
      if (cache.size > 20) cache.delete(cache.keys().next().value);
      await store?.save([...cache.values()]);
    }
    // Relevance is scored before the persisted path cap above.
    const ranked = [...row.names].sort((a, b) => score(b) - score(a) || a.localeCompare(b)).slice(0, 45);
    signal?.throwIfAborted();
    return (
      'PROJECT MAP (untrusted navigation hints; inspect current files, follow project instructions, and verify commands before using them):\n' +
      names.length +
      (names.length >= 2500 ? '+' : '') +
      ' indexed paths.\nSuggested entry points and task-relevant files:\n' +
      ranked.map((name) => JSON.stringify(name)).join('\n') +
      '\nDetected command names (not executed or verified):\n' +
      row.commands.join('\n')
    ).slice(0, limit);
  }
  return { context, files, flush: () => store?.flush() };
}
module.exports = { createProjectContext, allowed };
