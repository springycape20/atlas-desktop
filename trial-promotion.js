const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID, createHash } = require('node:crypto');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function createTrialPromotion({ directory, files, busy = () => false, approve = async () => false }) {
  const plans = new Map(),
    undoFile = path.join(directory, 'trial-promotions.json'),
    store = require('./atomic-store').createAtomicStore(undoFile);
  let serial = Promise.resolve();
  const readUndo = async () =>
    JSON.parse(
      await fs.readFile(undoFile, 'utf8').catch((e) => {
        if (e.code === 'ENOENT') return '[]';
        throw e;
      }),
    );
  async function target(root, name, create = false) {
    if (path.relative(root, await fs.realpath(root)) !== '') throw Error('Project root changed since preview.');
    if (
      !require('./project-files').allowed(name) ||
      path.isAbsolute(name) ||
      name.split(/[\\/]/).some((part) => !part || part === '..' || part === '.')
    )
      throw Error('Unsafe promotion path.');
    let parent = root;
    for (const part of name.split('/').slice(0, -1)) {
      const next = path.join(parent, part);
      try {
        await files.resolve(root, path.relative(root, next));
        if ((await fs.lstat(next)).isSymbolicLink()) throw Error('Promotion does not follow symbolic links.');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        if (create) {
          await fs.mkdir(next);
          await files.resolve(root, path.relative(root, next));
          if ((await fs.lstat(next)).isSymbolicLink()) throw Error('Promotion does not follow symbolic links.');
        }
      }
      parent = next;
    }
    const absolute = path.join(root, name);
    try {
      const value = await files.read(root, name);
      if ((await fs.lstat(absolute)).isSymbolicLink()) throw Error('Promotion does not replace symbolic links.');
      if (typeof value.text !== 'string' || value.bom)
        throw Error('Promotion supports UTF-8 text files without a byte-order mark, under 256 KB.');
      return { absolute, text: value.text, hash: hash(Buffer.from(value.text)), mode: value.mode };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      return { absolute, text: null, hash: null, mode: 0o600 };
    }
  }
  async function preview({ source, trial, base }) {
    if (busy()) throw Error('Finish active work before reviewing promotion.');
    const names = [...new Set([...base.rows.map((r) => r.path), ...trial.rows.map((r) => r.path)])],
      a = new Map(base.rows.map((r) => [r.path, r.sha256])),
      b = new Map(trial.rows.map((r) => [r.path, r.sha256])),
      rows = [];
    for (const name of names) {
      if (a.get(name) === b.get(name)) continue;
      if (rows.length >= 100) throw Error('Promotion is limited to 100 changed files.');
      try {
        const before = await target(source, name),
          after = await target(trial.cwd, name);
        const conflict = before.hash !== (a.get(name) || null) && before.hash !== after.hash;
        rows.push({
          path: name,
          before: before.text,
          after: after.text,
          sourceHash: before.hash,
          trialHash: after.hash,
          mode: before.mode,
          conflict,
          alreadyApplied: before.hash === after.hash,
          patch: require('diff')
            .createTwoFilesPatch('original/' + name, 'trial/' + name, before.text || '', after.text || '')
            .slice(0, 20000),
        });
      } catch (error) {
        rows.push({ path: name, unsupported: true, conflict: true, reason: error.message });
      }
    }
    if (
      rows.reduce((sum, row) => sum + Buffer.byteLength(row.before || '') + Buffer.byteLength(row.after || ''), 0) >
      2 * 1048576
    )
      throw Error('Promotion preview exceeds 2 MiB. Narrow the trial changes.');
    const id = randomUUID();
    plans.set(id, { source, trial: trial.cwd, rows, at: Date.now() });
    while (plans.size > 10) plans.delete(plans.keys().next().value);
    return { id, source, files: rows.map(({ before, after, sourceHash, trialHash, mode, ...row }) => row) };
  }
  async function applyRows(root, rows) {
    const applied = [];
    for (const row of rows) {
      if (busy()) return { applied, error: 'A task started; remaining writes stopped.' };
      try {
        const current = await target(root, row.path, true);
        if (current.hash !== row.expected) throw Error('File changed since preview: ' + row.path);
        if (row.text === null) await fs.unlink(current.absolute);
        else {
          const temp = path.join(path.dirname(current.absolute), '.atlas-promotion-' + randomUUID());
          try {
            await fs.writeFile(temp, row.text, { flag: 'wx', mode: row.mode });
            if ((await target(root, row.path)).hash !== row.expected) throw Error('File changed during promotion.');
            await fs.rename(temp, current.absolute);
          } finally {
            await fs.unlink(temp).catch(() => {});
          }
        }
        applied.push(row.path);
      } catch (error) {
        return { applied, error: error.message };
      }
    }
    return { applied };
  }
  async function action(request) {
    if (request.action === 'list')
      return (await readUndo()).map(({ rows, ...row }) => ({ ...row, files: rows.length }));
    if (request.action === 'forget') {
      const rows = await readUndo();
      await store.save(rows.filter((row) => row.id !== request.id));
      await store.flush();
      return { removed: true };
    }
    if (busy()) throw Error('Finish active work before promoting or undoing.');
    if (request.action === 'apply') {
      const plan = plans.get(request.id);
      if (!plan || Date.now() - plan.at > 600000) throw Error('Promotion preview expired. Review again.');
      if (
        !Array.isArray(request.paths) ||
        !request.paths.length ||
        new Set(request.paths).size !== request.paths.length
      )
        throw Error('Select files to promote.');
      const rows = request.paths.map((name) => plan.rows.find((row) => row.path === name));
      if (rows.some((row) => !row || row.conflict || row.unsupported || row.alreadyApplied))
        throw Error('Conflicting, unsupported or unchanged files cannot be selected.');
      for (const row of rows) {
        if (
          (await target(plan.source, row.path)).hash !== row.sourceHash ||
          (await target(plan.trial, row.path)).hash !== row.trialHash
        )
          throw Error('Source or trial changed. Review promotion again.');
      }
      if (
        !(await approve(
          'Apply selected trial files?',
          plan.source +
            '\n\n' +
            request.paths.join('\n') +
            '\n\nOnly these text files change. An undo record is kept. Git history is unchanged.',
        ))
      )
        return { cancelled: true };
      const undo = await readUndo();
      if (undo.length >= 20) throw Error('Forget an old promotion undo record first (20 maximum).');
      const record = {
        id: randomUUID(),
        source: plan.source,
        at: Date.now(),
        rows: rows.map((row) => ({ path: row.path, text: row.before, expected: row.trialHash, mode: row.mode })),
      };
      undo.push(record);
      await store.save(undo);
      await store.flush();
      // Recheck after approval and durable undo creation, before the first write.
      for (const row of rows)
        if (
          (await target(plan.source, row.path)).hash !== row.sourceHash ||
          (await target(plan.trial, row.path)).hash !== row.trialHash
        )
          throw Error('Files changed during review. Nothing was applied.');
      const result = await applyRows(
        plan.source,
        rows.map((row) => ({ path: row.path, text: row.after, expected: row.sourceHash, mode: row.mode })),
      );
      plans.delete(request.id);
      record.rows = record.rows.filter((row) => result.applied.includes(row.path));
      await store.save(undo);
      await store.flush();
      return { ...result, undoId: record.id };
    }
    if (request.action === 'undo') {
      const undo = await readUndo(),
        row = undo.find((row) => row.id === request.id);
      if (!row) throw Error('Promotion undo record unavailable.');
      const remaining = [];
      for (const file of row.rows) {
        const current = await target(row.source, file.path);
        if (current.hash === (file.text === null ? null : hash(Buffer.from(file.text)))) continue;
        if (current.hash !== file.expected) throw Error('Newer edits prevent undo: ' + file.path);
        remaining.push(file);
      }
      if (
        !(await approve('Undo this trial promotion?', row.source + '\n' + row.rows.map((file) => file.path).join('\n')))
      )
        return { cancelled: true };
      const result = await applyRows(row.source, remaining);
      if (!result.error) {
        await store.save(undo.filter((item) => item !== row));
        await store.flush();
      }
      return result;
    }
    throw Error('Unknown promotion action.');
  }
  return {
    preview,
    action(request) {
      const next = serial.then(() => action(request));
      serial = next.catch(() => {});
      return next;
    },
  };
}
module.exports = { createTrialPromotion };
