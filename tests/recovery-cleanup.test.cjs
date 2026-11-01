const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { createRecoveryCleanup } = require('../recovery-cleanup');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-recovery-cleanup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const make = async (name, age = 0) => {
    const folder = path.join(root, name);
    await fs.mkdir(path.join(folder, 'app'), { recursive: true });
    await fs.writeFile(path.join(folder, 'app', 'ATLAS.exe'), 'x'.repeat(10));
    const at = new Date(Date.now() - age * 1000);
    await fs.utimes(folder, at, at);
    return folder;
  };
  return { root, make };
}
const names = (rows) => rows.map((row) => row.name).sort();
test('recovery cleanup offers old copies but not the rollback target or newest records', async (t) => {
  const { root, make } = await fixture(t);
  await make('update-recovery/old', 100);
  const current = await make('update-recovery/current', 50);
  await make('recovery-backups/earlier', 100);
  await make('recovery-backups/latest', 0);
  await fs.writeFile(path.join(root, 'update-recovery.json'), JSON.stringify({ folder: current }));
  const cleanup = createRecoveryCleanup(root, { runningFrom: path.join(root, 'elsewhere', 'ATLAS.exe') });
  const rows = await cleanup.inspect();
  assert.deepEqual(names(rows), ['recovery-backups/earlier', 'update-recovery/old']);
  assert.equal(rows[0].bytes, 10);
  assert.deepEqual(await cleanup.remove(['update-recovery/old']), { removed: 1 });
  await assert.rejects(fs.stat(path.join(root, 'update-recovery', 'old')));
  assert(await fs.stat(current));
  assert(await fs.stat(path.join(root, 'recovery-backups', 'earlier')));
});
test('recovery cleanup refuses anything it did not offer', async (t) => {
  const { root, make } = await fixture(t);
  const current = await make('update-recovery/current');
  await make('update-recovery/old', 100);
  await fs.writeFile(path.join(root, 'update-recovery.json'), JSON.stringify({ folder: current }));
  const cleanup = createRecoveryCleanup(root, { runningFrom: path.join(root, 'elsewhere', 'ATLAS.exe') });
  for (const name of ['update-recovery/current', '../outside', 'update-recovery/old/../current', 'changes'])
    await assert.rejects(cleanup.remove([name]), /changed/);
  await assert.rejects(cleanup.remove([]), /Choose/);
  assert(await fs.stat(current));
});
test('recovery cleanup keeps the copy ATLAS is running from', async (t) => {
  const { root, make } = await fixture(t);
  const running = await make('update-recovery/running', 100);
  await make('update-recovery/old', 100);
  const cleanup = createRecoveryCleanup(root, { runningFrom: path.join(running, 'app', 'ATLAS.exe') });
  assert.deepEqual(names(await cleanup.inspect()), ['update-recovery/old']);
});
test('recovery cleanup offers no app copies when the rollback record is unreadable', async (t) => {
  const { root, make } = await fixture(t);
  await make('update-recovery/one', 100);
  await fs.writeFile(path.join(root, 'update-recovery.json'), '{"folder":');
  const cleanup = createRecoveryCleanup(root, { runningFrom: path.join(root, 'elsewhere', 'ATLAS.exe') });
  assert.deepEqual(await cleanup.inspect(), []);
});
test('recovery cleanup does not follow a linked folder', async (t) => {
  const { root, make } = await fixture(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-recovery-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.writeFile(path.join(outside, 'keep.txt'), 'keep');
  await make('update-recovery/old', 100);
  await fs.symlink(outside, path.join(root, 'update-recovery', 'old', 'link'), 'junction');
  await fs.symlink(outside, path.join(root, 'update-recovery', 'linked'), 'junction');
  const cleanup = createRecoveryCleanup(root, { runningFrom: path.join(root, 'elsewhere', 'ATLAS.exe') });
  const rows = await cleanup.inspect();
  assert.deepEqual(names(rows), ['update-recovery/old']);
  assert.equal(rows[0].bytes, 10);
  await cleanup.remove(['update-recovery/old']);
  assert.equal(await fs.readFile(path.join(outside, 'keep.txt'), 'utf8'), 'keep');
});
