const fs = require('node:fs/promises'),
  path = require('node:path'),
  { fileURLToPath } = require('node:url'),
  { randomUUID, createHash } = require('node:crypto');
const hash = (text) => (text === null ? null : createHash('sha256').update(text).digest('hex'));
function createWorkspaceEdits({ files, busy = () => false }) {
  const plans = new Map(),
    history = new Map();
  let serial = Promise.resolve();
  function prune(map) {
    for (const [id, row] of map) if (Date.now() - row.at > 3600000) map.delete(id);
    while (map.size > 20) map.delete(map.keys().next().value);
  }
  function relative(root, value) {
    const absolute = path.resolve(
        root,
        String(value).startsWith('file:') ? fileURLToPath(value) : require('./project-files').referencePath(value),
      ),
      name = path.relative(root, absolute).split(path.sep).join('/');
    if (
      !name ||
      !require('./project-files').within(root, absolute) ||
      !require('./project-files').allowed(name) ||
      !require('./project-files').isTextFile(name)
    )
      throw Error('Choose an allowed project text file.');
    return name;
  }
  async function inspect(root, name, create = false) {
    if (path.relative(root, await fs.realpath(root))) throw Error('Project root changed. Review again.');
    let parent = root;
    for (const part of name.split('/').slice(0, -1)) {
      parent = path.join(parent, part);
      try {
        await files.resolve(root, path.relative(root, parent));
        if ((await fs.lstat(parent)).isSymbolicLink()) throw Error('File edits do not follow symbolic links.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (create) {
          await fs.mkdir(parent);
          await files.resolve(root, path.relative(root, parent));
        }
      }
    }
    try {
      const target = await files.resolve(root, name);
      if ((await fs.lstat(path.join(root, name))).isSymbolicLink())
        throw Error('File edits do not replace symbolic links.');
      const value = await files.read(root, name);
      if (typeof value.text !== 'string' || value.bom)
        throw Error('Workspace edits require UTF-8 text without a byte-order mark, under 256 KiB.');
      const stat = await fs.stat(target.actual, { bigint: true });
      return {
        text: value.text,
        mode: value.mode,
        hash: hash(value.text),
        absolute: target.actual,
        identity: stat.ino ? String(stat.dev) + ':' + String(stat.ino) : null,
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { text: null, mode: 0o600, hash: null, absolute: path.join(root, name) };
    }
  }
  async function preview(root, edit) {
    if (!edit || typeof edit !== 'object' || (edit.changes && edit.documentChanges))
      throw Error('Choose one workspace edit format.');
    const changes =
      edit.documentChanges ||
      Object.entries(edit.changes || {}).map(([uri, edits]) => ({ textDocument: { uri, version: null }, edits }));
    if (!Array.isArray(changes) || changes.length > 100) throw Error('Workspace edit has too many operations.');
    const state = new Map();
    const get = async (value) => {
      const name = relative(root, value);
      if (!state.has(name)) {
        if (state.size >= 50) throw Error('Workspace edits support up to 50 files.');
        const value = await inspect(root, name);
        state.set(name, {
          path: name,
          before: value.text,
          after: value.text,
          modeBefore: value.mode,
          modeAfter: value.mode,
          identity: value.identity,
        });
      }
      return state.get(name);
    };
    for (const [uri, expected] of Object.entries(edit.atlasDocumentHashes || {})) {
      if (!/^[a-f0-9]{64}$/.test(expected) || hash((await get(uri)).before) !== expected)
        throw Error('Document changed since the language-server action. Request it again.');
    }
    for (const change of changes) {
      if (change.kind === 'create') {
        const row = await get(change.uri);
        if (row.after !== null) {
          if (change.options?.ignoreIfExists) continue;
          if (!change.options?.overwrite) throw Error('Create target already exists: ' + row.path);
        }
        row.after = '';
      } else if (change.kind === 'delete') {
        const row = await get(change.uri);
        if (row.after === null && !change.options?.ignoreIfNotExists)
          throw Error('Delete source is missing: ' + row.path);
        if (change.options?.recursive) throw Error('Directory deletion is unsupported.');
        row.after = null;
      } else if (change.kind === 'rename') {
        const before = await get(change.oldUri),
          after = await get(change.newUri);
        if (before === after) continue;
        if (before.identity && before.identity === after.identity)
          throw Error(
            'Move source and destination refer to the same file through aliases. Use a distinct destination.',
          );
        if (before.after === null) throw Error('Move source is missing: ' + before.path);
        if (after.after !== null) {
          if (change.options?.ignoreIfExists) continue;
          if (!change.options?.overwrite) throw Error('Move target already exists: ' + after.path);
        }
        after.after = before.after;
        after.modeAfter = before.modeAfter;
        before.after = null;
      } else if (change.textDocument) {
        if (change.textDocument.version !== null && change.textDocument.version !== undefined)
          throw Error('Versioned server edits require a fresh unversioned action.');
        const row = await get(change.textDocument.uri);
        if (row.after === null) throw Error('Text edit target does not exist: ' + row.path);
        row.after = require('./language-edits').editText(row.after, change.edits);
      } else throw Error('Unsupported workspace edit operation.');
    }
    const rows = [...state.values()].filter((row) => row.before !== row.after);
    let bytes = 0;
    for (const row of rows) {
      if (row.after !== null && (row.after.includes('\0') || Buffer.byteLength(row.after) > 262144))
        throw Error('Edited file exceeds text limits.');
      bytes += Buffer.byteLength(row.before || '') + Buffer.byteLength(row.after || '');
    }
    if (bytes > 8 * 1048576) throw Error('Workspace edit exceeds 8 MiB of before/after text.');
    const id = randomUUID();
    plans.set(id, { root, rows, at: Date.now() });
    prune(plans);
    return {
      id,
      files: rows.map((row) => ({
        path: row.path,
        kind: row.before === null ? 'added' : row.after === null ? 'deleted' : 'modified',
      })),
    };
  }
  async function write(root, rows) {
    const applied = [];
    for (const row of rows) {
      try {
        if (busy()) throw Error('A task started; further file changes stopped.');
        const current = await inspect(root, row.path, true);
        if (current.hash !== hash(row.before)) throw Error('Newer disk edits prevent this change: ' + row.path);
        if (row.after === null) await fs.unlink(current.absolute);
        else {
          const temp = path.join(path.dirname(current.absolute), '.atlas-edit-' + randomUUID());
          try {
            await fs.writeFile(temp, row.after, { flag: 'wx', mode: row.modeAfter });
            await fs.chmod(temp, row.modeAfter);
            if ((await inspect(root, row.path)).hash !== hash(row.before)) throw Error('File changed during write.');
            await fs.rename(temp, current.absolute);
          } finally {
            await fs.unlink(temp).catch(() => {});
          }
        }
        applied.push(row.path);
      } catch (error) {
        return { files: applied, error: error.message };
      }
    }
    return { files: applied };
  }
  async function perform(root, request) {
    root = (await files.resolve(root, '.')).actual;
    prune(plans);
    prune(history);
    if (request.action === 'preview') return preview(root, request.edit);
    const map = request.action === 'undo' ? history : plans,
      plan = map.get(request.id);
    if (!plan || plan.root !== root) throw Error('Reviewed workspace edit expired.');
    if (request.action === 'file') {
      const row = plan.rows.find((row) => row.path === request.path);
      if (!row) throw Error('File is not in this preview.');
      return { path: row.path, before: row.before, after: row.after };
    }
    if (!['apply', 'undo'].includes(request.action)) throw Error('Unknown workspace edit action.');
    if (busy()) throw Error('Finish running work before changing files.');
    const rows =
        request.action === 'undo'
          ? plan.rows.map((row) => ({
              ...row,
              before: row.after,
              after: row.before,
              modeAfter: row.modeBefore,
              modeBefore: row.modeAfter,
            }))
          : plan.rows,
      pending = [];
    for (const row of rows) {
      const current = await inspect(root, row.path);
      if (request.action === 'undo' && current.hash === hash(row.after)) continue;
      if (current.hash !== hash(row.before)) throw Error('Newer disk edits prevent this change: ' + row.path);
      pending.push(row);
    }
    const id = randomUUID();
    if (request.action === 'apply') history.set(id, { ...plan, at: Date.now(), rows: [] });
    const result = await write(root, pending);
    if (request.action === 'apply') {
      history.get(id).rows = plan.rows.filter((row) => result.files.includes(row.path));
      plans.delete(request.id);
      prune(history);
      return { ...result, saved: !result.error, undoId: id };
    }
    if (!result.error) history.delete(request.id);
    return { ...result, saved: !result.error };
  }
  return {
    action(root, request) {
      const next = serial.then(() => perform(root, request));
      serial = next.catch(() => {});
      return next;
    },
  };
}
module.exports = { createWorkspaceEdits };
