const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { createBackupClient } = require('../backup-client');
test('real backup worker keeps the main loop responsive and produces a restorable archive', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-backup-worker-')),
    client = createBackupClient();
  t.after(async () => {
    client.dispose();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  await fs.writeFile(path.join(directory, 'records.json'), JSON.stringify({ text: 'fixture'.repeat(1000000) }));
  const running = client.create(directory, 'fixture', { localStorage: { fixture: 'value' } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(client.status().running, true);
  await assert.rejects(client.create(directory, 'fixture', {}), /already/);
  const bytes = await running,
    value = require('../local-backups').validate(bytes);
  assert.equal(value.files.length, 1);
  assert.equal(value.renderer.localStorage.fixture, 'value');
  assert.equal(client.status().phase, 'complete');
  assert.equal(client.status().files, 1);
  const recover = path.join(directory, 'recover');
  await fs.mkdir(recover);
  require('../local-backups').stageRestore(recover, bytes);
  require('../local-backups').applyPendingRestore(recover);
  assert.equal(
    await fs.readFile(path.join(recover, 'records.json'), 'utf8'),
    await fs.readFile(path.join(directory, 'records.json'), 'utf8'),
  );
});
test('backup cancellation and clone errors release the worker slot for another backup', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-backup-cancel-')),
    client = createBackupClient();
  t.after(async () => {
    client.dispose();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  await fs.writeFile(path.join(directory, 'small.json'), '{}');
  const first = client.create(directory, 'fixture', {});
  client.cancel();
  await assert.rejects(first, /cancelled/);
  assert.equal(client.status().running, false);
  await assert.rejects(client.create(directory, 'fixture', { invalid: () => {} }));
  const bytes = await client.create(directory, 'fixture', {});
  assert.equal(require('../local-backups').validate(bytes).files.length, 1);
});
test('worker preserves backup-limit errors without reading oversized source files', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-backup-limit-')),
    client = createBackupClient();
  t.after(async () => {
    client.dispose();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  const file = await fs.open(path.join(directory, 'large.json'), 'w');
  await file.truncate(257 * 1048576);
  await file.close();
  await assert.rejects(client.create(directory, 'fixture', {}), (error) => error.code === 'ATLAS_BACKUP_LIMIT');
});
