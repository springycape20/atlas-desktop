const fs = require('node:fs/promises'),
  path = require('node:path'),
  { randomUUID, createHash } = require('node:crypto');
function createVisualBaselines(directory) {
  const file = path.join(directory, 'visual-baselines.json'),
    store = require('./atomic-store').createAtomicStore(file);
  let serial = Promise.resolve();
  async function read() {
    const stat = await fs.stat(file).catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!stat) return [];
    if (stat.size > 24 * 1048576) throw Error('Visual baseline storage exceeds its limit.');
    const rows = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(rows)) throw Error('Invalid visual baseline store.');
    return rows;
  }
  async function action(request) {
    const cwd = await require('./project-root').createProjectRootGuard().assertProject(request.cwd),
      rows = await read();
    const summary = ({ png, ...row }) => row;
    if (request.action === 'list') return rows.filter((row) => row.cwd === cwd).map(summary);
    const row = rows.find((row) => row.id === request.id && row.cwd === cwd);
    if (request.action === 'load') {
      if (!row) throw Error('Choose a saved baseline for this project.');
      const bytes = Buffer.from(row.png, 'base64');
      if (bytes.length > 8 * 1048576 || createHash('sha256').update(bytes).digest('hex') !== row.sha256)
        throw Error('Saved baseline failed its integrity check.');
      return { ...summary(row), bytes };
    }
    if (request.action === 'remove') {
      if (!row) throw Error('Choose a saved baseline for this project.');
      await store.save(rows.filter((item) => item !== row));
      await store.flush();
      return { removed: true };
    }
    if (request.action === 'save') {
      const name = String(request.name || '')
          .trim()
          .slice(0, 100),
        bytes = Buffer.from(request.bytes || []);
      if (!name || !bytes.length || bytes.length > 8 * 1048576)
        throw Error('Enter a baseline name; screenshots must be under 8 MiB.');
      if (rows.length >= 20 || rows.reduce((sum, item) => sum + item.byteLength, 0) + bytes.length > 16 * 1048576)
        throw Error('Baseline storage is full (20 images / 16 MiB). Delete an old baseline first.');
      const saved = {
        id: randomUUID(),
        cwd,
        name,
        url: request.url,
        size: request.size,
        at: Date.now(),
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        png: bytes.toString('base64'),
      };
      await store.save([...rows, saved]);
      await store.flush();
      return summary(saved);
    }
    throw Error('Unknown visual baseline action.');
  }
  return {
    action(request) {
      const next = serial.then(() => action(request));
      serial = next.catch(() => {});
      return next;
    },
  };
}
module.exports = { createVisualBaselines };
