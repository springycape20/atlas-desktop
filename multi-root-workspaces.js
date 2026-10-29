const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
function createMultiRootWorkspaces(directory, { guard = require('./project-root').createProjectRootGuard() } = {}) {
  const file = path.join(directory, 'multi-root-workspaces.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let lock = Promise.resolve();
  const read = async () =>
    JSON.parse(
      await fs.readFile(file, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '[]';
        throw error;
      }),
    );
  return {
    action(request = {}) {
      return (lock = lock
        .catch(() => {})
        .then(async () => {
          const rows = await read();
          if (!request.action || request.action === 'list') return rows;
          if (request.action === 'remove') {
            await store.save(rows.filter((row) => row.id !== request.id));
            await store.flush();
            return read();
          }
          if (request.action === 'save') {
            if (!Array.isArray(request.roots) || !request.roots.length || request.roots.length > 8)
              throw Error('Choose 1–8 named roots.');
            const roots = [];
            for (const row of request.roots) {
              const cwd = await guard.assertProject(row.cwd);
              if (
                roots.some(
                  (root) =>
                    require('./project-files').within(root.cwd, cwd) ||
                    require('./project-files').within(cwd, root.cwd) ||
                    root.cwd === cwd,
                )
              )
                throw Error('Workspace roots must not overlap.');
              roots.push({ name: String(row.name || path.basename(cwd)).slice(0, 80), cwd });
            }
            if (new Set(roots.map((root) => root.name)).size !== roots.length)
              throw Error('Give each root a unique name.');
            const row = {
              id: rows.some((row) => row.id === request.id) ? request.id : randomUUID(),
              name: String(request.name || 'Workspace').slice(0, 100),
              roots,
            };
            await store.save([...rows.filter((r) => r.id !== row.id), row].slice(-50));
            await store.flush();
            return row;
          }
          throw Error('Unknown workspace action.');
        }));
    },
  };
}
module.exports = { createMultiRootWorkspaces };
