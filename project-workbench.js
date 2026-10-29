const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID } = require('node:crypto');
const { createProjectRootGuard } = require('./project-root');
async function findTool(name) {
  for (const folder of (process.env.PATH || '').split(path.delimiter)) {
    if (!path.isAbsolute(folder)) continue;
    for (const ext of process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : ['']) {
      const candidate = path.join(folder, name + ext);
      if (
        await fs.stat(candidate).then(
          (stat) => stat.isFile(),
          () => false,
        )
      )
        return candidate;
    }
  }
  throw Error('Tool not found on PATH.');
}
function createProjectWorkbench({ directory, tracker, files, probe = findTool }) {
  const guard = createProjectRootGuard(),
    manifest = path.join(directory, 'named-checkpoints.json');
  const previews = new Map();
  let serial = Promise.resolve();
  const read = async () => JSON.parse(await fs.readFile(manifest, 'utf8').catch(() => '[]'));
  async function action(request) {
    const cwd = await guard.assertProject(request.cwd);
    if (request.action === 'health') {
      const info = await require('./project-tools').detectProject(cwd),
        results = [];
      const tools = new Set(['git']);
      if (info.types.includes('Node.js')) (tools.add('node'), tools.add('npm'));
      if (info.types.includes('Python')) tools.add('python');
      if (info.types.includes('Rust')) tools.add('cargo');
      if (info.types.includes('Go')) tools.add('go');
      for (const tool of tools) {
        try {
          results.push({
            name: tool,
            status: 'found on PATH',
            detail: (await probe(tool, ['--version'], directory, { timeout: 5000 })).trim().slice(0, 200),
          });
        } catch {
          results.push({ name: tool, status: 'missing or unavailable', detail: 'Check installation and PATH.' });
        }
      }
      if (info.types.includes('Node.js'))
        results.push({
          name: 'Node dependencies',
          status: await fs.stat(path.join(cwd, 'node_modules')).then(
            () => 'present',
            () => 'missing',
          ),
          detail: 'Presence check only; dependencies may still be out of date.',
        });
      return {
        ...info,
        results,
        note: 'No project scripts, installs or network audits were run. Run checks from Project setup to verify behaviour.',
      };
    }
    const rows = await read();
    if (request.action === 'list') return rows.filter((row) => row.cwd === cwd);
    if (request.action === 'capture') {
      if (rows.length >= 100) throw Error('Checkpoint storage limit reached (100). Remove an old checkpoint first.');
      const row = {
        id: 'named-' + randomUUID(),
        cwd,
        name: String(request.name || 'Checkpoint')
          .trim()
          .slice(0, 100),
        createdAt: Date.now(),
      };
      await tracker.capture(row.id, cwd);
      rows.push(row);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(manifest + '.tmp', JSON.stringify(rows));
      await fs.rename(manifest + '.tmp', manifest);
      return row;
    }
    const row = rows.find((row) => row.id === request.id && row.cwd === cwd);
    if (!row) throw Error('Checkpoint not found for this project.');
    if (request.action === 'remove') {
      if (!/^(?:named-|undo-)[a-f0-9-]{36}$/.test(row.id)) throw Error('Invalid checkpoint identifier.');
      await fs.unlink(path.join(directory, 'changes', row.id + '.json')).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
      await fs.writeFile(manifest + '.tmp', JSON.stringify(rows.filter((item) => item.id !== row.id)));
      await fs.rename(manifest + '.tmp', manifest);
      previews.delete(row.id);
      return { removed: true };
    }
    if (request.action === 'report') return tracker.report(row.id, true);
    if (request.action === 'file') {
      try {
        await files.resolve(cwd, request.path);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      return tracker.file(row.id, request.path);
    }
    if (request.action === 'preview') {
      await tracker.seal(row.id);
      const selected = Array.isArray(request.files) ? request.files.slice(0, 1500) : undefined;
      const preview = await tracker.restorePreview(row.id, selected);
      for (const name of preview.files) {
        // Existing files must also pass current credential and denied-path rules.
        try {
          await files.resolve(cwd, name);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      previews.set(row.id, { token: preview.token, selected, files: preview.files });
      return preview;
    }
    if (request.action === 'restore') {
      const reviewed = previews.get(row.id);
      if (!reviewed || reviewed.token !== request.token) throw Error('Review the checkpoint again first.');
      for (const name of reviewed.files) {
        try {
          await files.resolve(cwd, name);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      previews.delete(row.id);
      const result = await tracker.restore(row.id, reviewed.token, reviewed.selected);
      const recovery = { id: result.backupId, cwd, name: 'Undo restore: ' + row.name, createdAt: Date.now() };
      rows.push(recovery);
      await fs.writeFile(manifest + '.tmp', JSON.stringify(rows));
      await fs.rename(manifest + '.tmp', manifest);
      return result;
    }
    throw Error('Unknown checkpoint action.');
  }
  return {
    action(request) {
      const next = serial.then(() => action(request));
      serial = next.catch(() => {});
      return next;
    },
  };
}
module.exports = { createProjectWorkbench };
