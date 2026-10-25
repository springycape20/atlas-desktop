const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const validOwner = (owner) =>
  typeof owner === 'string' &&
  /^(?:colab|assistant):[^\x00-\x1f]{1,200}$/.test(owner) &&
  !owner.endsWith(':undefined') &&
  !owner.endsWith(':null');
function screenAction(tool, args = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return false;
  return (
    [
      'Screenshot',
      'Snapshot',
      'Click',
      'Type',
      'Scroll',
      'Move',
      'Shortcut',
      'Wait',
      'WaitFor',
      'ControlStatus',
    ].includes(tool) ||
    (tool === 'App' && ['switch', 'resize'].includes(args.mode))
  );
}
function createDesktopPermissions(directory, notify = () => {}) {
  const file = path.join(directory, 'desktop-permissions.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let loaded,
    rows = [],
    deniedPaths = [],
    queue = Promise.resolve();
  async function load() {
    return (loaded ||= fs
      .readFile(file, 'utf8')
      .then((text) => {
        const saved = JSON.parse(text);
        if (
          saved.version !== 1 ||
          !Array.isArray(saved.grants) ||
          (saved.deniedPaths !== undefined &&
            (!Array.isArray(saved.deniedPaths) ||
              saved.deniedPaths.some((value) => typeof value !== 'string' || !path.isAbsolute(value))))
        )
          throw Error('Invalid desktop permissions file.');
        rows = [
          ...new Map(
            saved.grants
              .filter((row) => validOwner(row.owner) && typeof row.id === 'string' && Number.isFinite(row.grantedAt))
              .map((row) => [row.owner, row]),
          ).values(),
        ];
        deniedPaths = saved.deniedPaths || [];
      })
      .catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      }));
  }
  async function list() {
    await load();
    return structuredClone(rows);
  }
  async function get(owner) {
    await load();
    return rows.find((row) => row.owner === owner) || null;
  }
  function change(fn, deny = (values) => values) {
    const result = queue.then(async () => {
      await load();
      const next = fn(rows),
        nextDenied = deny(deniedPaths);
      await store.save({ version: 1, grants: next, deniedPaths: nextDenied });
      rows = next;
      deniedPaths = nextDenied;
      try {
        notify(await list());
      } catch {}
    });
    queue = result.catch(() => {});
    return result;
  }
  async function grant(owner) {
    if (!validOwner(owner)) throw Error('Select a saved chat before remembering screen control.');
    await change((current) =>
      current.some((row) => row.owner === owner)
        ? current
        : [...current, { owner, id: randomUUID(), grantedAt: Date.now() }],
    );
    return get(owner);
  }
  async function revoke(owner) {
    if (owner !== undefined && !validOwner(owner)) throw Error('Invalid chat permission.');
    try {
      await load();
    } catch {
      rows = [];
      deniedPaths = [];
      loaded = Promise.resolve();
    }
    await change((current) => (owner === undefined ? [] : current.filter((row) => row.owner !== owner)));
  }
  async function denyFiles(files) {
    if (!Array.isArray(files) || files.some((value) => typeof value !== 'string' || !path.isAbsolute(value)))
      throw Error('Invalid denied file path.');
    await change(
      (current) => current,
      (values) => [...new Set([...values, ...files])],
    );
  }
  const revokeIf = (owner, id) => change((current) => current.filter((row) => row.owner !== owner || row.id !== id));
  return {
    list,
    get,
    grant,
    revoke,
    revokeIf,
    denyFiles,
    deniedFiles: async () => {
      await load();
      return [...deniedPaths];
    },
    flush: async () => {
      await queue;
      await store.flush();
    },
  };
}
module.exports = { createDesktopPermissions, validOwner, screenAction };
