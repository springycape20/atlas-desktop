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
  // shellRows are chats that run PowerShell without asking (riskyPowerShell still asks); kept apart from
  // screen control so allowing one never allows the other.
  let loaded,
    rows = [],
    shellRows = [],
    deniedPaths = [],
    queue = Promise.resolve();
  const owned = (grants) => [
    ...new Map(
      grants
        .filter((row) => validOwner(row.owner) && typeof row.id === 'string' && Number.isFinite(row.grantedAt))
        .map((row) => [row.owner, row]),
    ).values(),
  ];
  async function load() {
    return (loaded ||= fs
      .readFile(file, 'utf8')
      .then((text) => {
        const saved = JSON.parse(text);
        if (
          saved.version !== 1 ||
          !Array.isArray(saved.grants) ||
          (saved.shellGrants !== undefined && !Array.isArray(saved.shellGrants)) ||
          (saved.deniedPaths !== undefined &&
            (!Array.isArray(saved.deniedPaths) ||
              saved.deniedPaths.some((value) => typeof value !== 'string' || !path.isAbsolute(value))))
        )
          throw Error('Invalid desktop permissions file.');
        rows = owned(saved.grants);
        shellRows = owned(saved.shellGrants || []);
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
  function change(fn, deny = (values) => values, shell = (values) => values) {
    const result = queue.then(async () => {
      await load();
      const next = fn(rows),
        nextDenied = deny(deniedPaths),
        nextShell = shell(shellRows);
      await store.save({ version: 1, grants: next, shellGrants: nextShell, deniedPaths: nextDenied });
      rows = next;
      shellRows = nextShell;
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
      shellRows = [];
      deniedPaths = [];
      loaded = Promise.resolve();
    }
    await change((current) => (owner === undefined ? [] : current.filter((row) => row.owner !== owner)));
  }
  const keep = (current) => current;
  async function grantShell(owner) {
    if (!validOwner(owner)) throw Error('Select a saved chat before allowing PowerShell for it.');
    await change(keep, undefined, (current) =>
      current.some((row) => row.owner === owner)
        ? current
        : [...current, { owner, id: randomUUID(), grantedAt: Date.now() }],
    );
    return shellGrant(owner);
  }
  async function shellGrant(owner) {
    await load();
    return shellRows.find((row) => row.owner === owner) || null;
  }
  async function revokeShell(owner) {
    if (owner !== undefined && !validOwner(owner)) throw Error('Invalid chat permission.');
    await change(keep, undefined, (current) =>
      owner === undefined ? [] : current.filter((row) => row.owner !== owner),
    );
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
    shellGrant,
    grantShell,
    revokeShell,
    revokeShellIf: (owner, id) =>
      change(keep, undefined, (current) => current.filter((row) => row.owner !== owner || row.id !== id)),
    shellGrants: async () => {
      await load();
      return structuredClone(shellRows);
    },
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
