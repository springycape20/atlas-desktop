const fs = require('node:fs/promises'),
  path = require('node:path'),
  { createHash, randomUUID } = require('node:crypto');
function createTaskArchive(directory) {
  const folder = path.join(directory, 'task-evidence');
  const location = (id) => {
    if (!/^[\w-]{1,100}$/.test(id)) throw Error('Invalid task evidence identifier.');
    return path.join(folder, id + '.json');
  };
  async function read(id) {
    const record = JSON.parse(await fs.readFile(location(id), 'utf8'));
    const digest = createHash('sha256').update(JSON.stringify(record.evidence)).digest('hex');
    if (record.sha256 !== digest) throw Error('Saved task evidence failed its integrity check.');
    return { ...record.evidence, sha256: digest };
  }
  async function save(job, report, permitted = async () => true) {
    const safe = report ? { ...report, files: [] } : null;
    if (report) for (const row of report.files) if (await permitted(row.path)) safe.files.push(row);
    const evidence = {
      ...require('./workflow-evidence').taskEvidence({ ...job, endedAt: job.endedAt || Date.now() }, safe),
      capturedAt: Date.now(),
      source: 'completion archive',
      cwd: job.cwd,
      checkpoints: (job.checkpoints || []).map((row) => ({ phase: row.phase, provider: row.provider, at: row.at })),
      limitation:
        'Bounded task checkpoint coverage. This archive preserves the captured diff and checks; it is not a full project backup.',
    };
    // Keep archive size bounded and make omitted patches explicit.
    let total = 0;
    for (const row of evidence.diff?.files || []) {
      const size = Buffer.byteLength(JSON.stringify(row.hunks || []));
      total += size;
      if (size > 262144 || total > 4 * 1024 * 1024) {
        row.hunks = undefined;
        row.patchOmitted = true;
        evidence.diff.limited = true;
      }
    }
    const record = { evidence, sha256: createHash('sha256').update(JSON.stringify(evidence)).digest('hex') };
    await fs.mkdir(folder, { recursive: true });
    const temp = path.join(folder, '.' + job.id + '.' + randomUUID() + '.tmp');
    try {
      await fs.writeFile(temp, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
      // Link a complete record into place atomically without replacing an existing task archive.
      await fs.link(temp, location(job.id));
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
    const saved = await read(job.id);
    await fs.writeFile(
      path.join(folder, job.id + '.meta.json'),
      JSON.stringify({
        id: saved.id,
        title: saved.title,
        status: saved.status,
        provider: saved.provider,
        capturedAt: saved.capturedAt,
      }),
      { mode: 0o600 },
    );
    return saved;
  }
  async function list() {
    const names = await fs.readdir(folder).catch((error) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const rows = [];
    for (const name of names.filter((name) => /^[\w-]+\.json$/.test(name))) {
      try {
        const id = name.slice(0, -5);
        let row;
        try {
          row = JSON.parse(await fs.readFile(path.join(folder, id + '.meta.json'), 'utf8'));
          if (row.id !== id) throw Error('Mismatched metadata');
        } catch {
          row = await read(id);
        }
        rows.push({
          id: row.id,
          title: row.title,
          status: row.status,
          provider: row.provider,
          capturedAt: row.capturedAt,
        });
      } catch {}
    }
    return rows.sort((a, b) => b.capturedAt - a.capturedAt);
  }
  return {
    save,
    read,
    list,
    remove: async (id) => {
      await fs.unlink(location(id));
      await fs.unlink(path.join(folder, id + '.meta.json')).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    },
  };
}
module.exports = { createTaskArchive };
