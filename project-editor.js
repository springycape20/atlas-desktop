const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const version = (bytes, mode) => createHash('sha256').update(bytes).digest('hex') + ':' + (mode & 511);
function createProjectEditor({ files, busy = () => false }) {
  const plans = new Map(),
    history = new Map();
  let serial = Promise.resolve();
  async function read(root, name) {
    const file = await files.read(root, name);
    if (typeof file.text !== 'string') throw Error('Choose a UTF-8 text file under 256 KB.');
    return { path: file.path, text: (file.bom ? '\uFEFF' : '') + file.text, version: file.version, mode: file.mode };
  }
  function prune(map) {
    for (const [id, row] of map) if (Date.now() - row.createdAt > 3600000) map.delete(id);
    while (map.size > 20) map.delete(map.keys().next().value);
  }
  async function apply(root, rows) {
    if (busy()) throw Error('Finish or stop running tasks before editing project files.');
    for (const row of rows) {
      if (Buffer.byteLength(row.after) > 262144 || row.after.includes('\0'))
        throw Error('Edited text exceeds the file limit.');
      if ((await read(root, row.path)).version !== row.version)
        throw Error(row.path + ' changed on disk. Reload and review again.');
    }
    const undo = { root, rows: [], createdAt: Date.now() },
      id = randomUUID();
    history.set(id, undo);
    prune(history);
    try {
      for (const row of rows) {
        if (busy()) throw Error('A task started. Further writes were stopped.');
        const target = await files.resolve(root, row.path),
          current = await read(root, row.path);
        if (current.version !== row.version) throw Error(row.path + ' changed on disk.');
        const temp = path.join(path.dirname(target.actual), '.atlas-editor-' + randomUUID());
        try {
          await fs.writeFile(temp, row.after, { flag: 'wx', mode: current.mode });
          await fs.chmod(temp, current.mode);
          await files.resolve(root, row.path);
          if ((await read(root, row.path)).version !== row.version) throw Error(row.path + ' changed on disk.');
          await fs.rename(temp, target.actual);
          undo.rows.push({
            path: row.path,
            after: current.text,
            version: version(Buffer.from(row.after), current.mode),
          });
        } finally {
          await fs.unlink(temp).catch(() => {});
        }
      }
      return { saved: true, undoId: id, files: undo.rows.map((row) => row.path) };
    } catch (error) {
      if (!undo.rows.length) {
        history.delete(id);
        throw error;
      }
      return { saved: false, undoId: id, files: undo.rows.map((row) => row.path), error: error.message };
    }
  }
  async function action(root, request) {
    if (request.action === 'editor-read') return read(root, request.path);
    if (request.action === 'editor-save') {
      if (typeof request.text !== 'string') throw Error('Enter text to save.');
      const result = await apply(root, [{ path: request.path, after: request.text, version: request.version }]);
      return { ...result, file: await read(root, request.path) };
    }
    if (request.action === 'replace-preview') {
      const find = String(request.find || '');
      if (!find || find.length > 200 || /[\r\n]/.test(find))
        throw Error('Find text must be one line, 1–200 characters.');
      const replacement = String(request.replacement || '');
      if (replacement.length > 10000) throw Error('Replacement is too long.');
      const exclusions = String(request.exclusions || '')
        .split(',')
        .map((s) => s.trim().replaceAll('\\', '/').replace(/\/$/, ''))
        .filter(Boolean);
      const rows = [],
        queue = ['.'];
      let visited = 0,
        bytes = 0,
        limited = false;
      const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), request.matchCase ? 'g' : 'gi');
      while (queue.length && visited < 2000 && rows.length < 100 && bytes < 4 * 1024 * 1024) {
        const folder = await files.list(root, queue.shift());
        limited ||= folder.limited === true;
        for (const item of folder.entries) {
          if (++visited > 2000 || rows.length >= 100 || bytes >= 4 * 1024 * 1024) break;
          if (exclusions.some((prefix) => item.path === prefix || item.path.startsWith(prefix + '/'))) continue;
          if (item.directory) {
            if (item.path.split('/').length < 12) queue.push(item.path);
            else limited = true;
            continue;
          }
          let file;
          try {
            file = await read(root, item.path);
          } catch {
            continue;
          }
          bytes += Buffer.byteLength(file.text);
          let count = 0,
            resultBytes = Buffer.byteLength(file.text);
          const replacementBytes = Buffer.byteLength(replacement);
          const after = file.text.replace(regex, (match) => {
            count++;
            resultBytes += replacementBytes - Buffer.byteLength(match);
            if (resultBytes > 262144)
              throw Error('Replacement would exceed 256 KB in ' + file.path + '. Use a shorter replacement.');
            return replacement;
          });
          if (count && after !== file.text) rows.push({ ...file, after, count });
        }
      }
      const id = randomUUID();
      plans.set(id, { root, rows, createdAt: Date.now() });
      prune(plans);
      return {
        id,
        files: rows.map(({ path, count }) => ({ path, count })),
        limited: limited || queue.length > 0 || visited >= 2000 || rows.length >= 100 || bytes >= 4 * 1024 * 1024,
      };
    }
    if (request.action === 'replace-file' || request.action === 'replace-apply') {
      prune(plans);
      const plan = plans.get(request.id);
      if (!plan || plan.root !== root) throw Error('Preview expired. Preview replacements again.');
      if (request.action === 'replace-file') {
        const row = plan.rows.find((row) => row.path === request.path);
        if (!row) throw Error('File is outside this replacement preview.');
        return { path: row.path, before: row.text, after: row.after };
      }
      if (!Array.isArray(request.paths) || !request.paths.length) throw Error('Select files to replace.');
      const rows = plan.rows.filter((row) => request.paths.includes(row.path));
      if (rows.length !== new Set(request.paths).size) throw Error('Invalid replacement selection.');
      const result = await apply(root, rows);
      plans.delete(request.id);
      return result;
    }
    if (request.action === 'editor-undo') {
      prune(history);
      const entry = history.get(request.id);
      if (!entry || entry.root !== root)
        throw Error('Undo expired. Undo is kept locally for one hour in this session.');
      const result = await apply(root, entry.rows);
      history.delete(request.id);
      return result;
    }
    throw Error('Unknown editor action.');
  }
  return {
    action(root, request) {
      const next = serial.then(() => action(root, request));
      serial = next.catch(() => {});
      return next;
    },
  };
}
module.exports = { createProjectEditor };
