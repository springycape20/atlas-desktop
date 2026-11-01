const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { createAutoBackups } = require('../auto-backups');
const { createBackup, validate, collect } = require('../local-backups');
const DAY = 86400000;
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-auto-backup-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const clock = { at: Date.UTC(2026, 0, 1) };
  return {
    directory,
    clock,
    backups: createAutoBackups({
      directory,
      now: () => clock.at,
      make: async () => Buffer.from('copy ' + clock.at),
      ...options,
    }),
  };
}
const names = async (directory) => fs.readdir(path.join(directory, 'auto-backups')).catch(() => []);
test('automatic backups run once a day and keep only the newest copies', async (t) => {
  const { directory, clock, backups } = await fixture(t, { keep: 2 });
  assert.equal(await backups.tick(), true);
  assert.equal(await backups.tick(), false);
  clock.at += DAY - 1;
  assert.equal(await backups.tick(), false);
  for (let day = 0; day < 3; day++) {
    clock.at += DAY;
    assert.equal(await backups.tick(), true);
  }
  const kept = await names(directory);
  assert.equal(kept.length, 2);
  assert.equal(await fs.readFile(path.join(directory, 'auto-backups', kept.sort()[1]), 'utf8'), 'copy ' + clock.at);
  const status = await backups.status();
  assert.equal(status.lastAt, clock.at);
  assert.equal(status.copies, 2);
});
test('automatic backups can be turned off and wait while work is running', async (t) => {
  let busy = true;
  const { directory, backups } = await fixture(t, { busy: () => busy });
  assert.equal(await backups.tick(), false);
  busy = false;
  await backups.setEnabled(false);
  assert.equal((await backups.status()).enabled, false);
  assert.equal(await backups.tick(), false);
  assert.deepEqual(await names(directory), []);
  await backups.setEnabled(true);
  assert.equal(await backups.tick(), true);
});
test('a failed automatic backup is reported, leaves no partial file and keeps earlier copies', async (t) => {
  let fail = false;
  const { directory, clock, backups } = await fixture(t, {
    make: async () => {
      if (fail) throw Error('over the limit');
      return Buffer.from('good');
    },
  });
  await backups.tick();
  const before = await names(directory);
  const lastAt = (await backups.status()).lastAt;
  fail = true;
  clock.at += DAY;
  await assert.rejects(backups.tick(), /over the limit/);
  assert.deepEqual(await names(directory), before);
  const status = await backups.status();
  assert.equal(status.lastError, 'over the limit');
  assert.equal(status.lastAt, lastAt);
  assert.equal(await backups.tick(), false, 'does not retry until the next day');
  fail = false;
  clock.at += DAY;
  assert.equal(await backups.tick(), true);
  assert.equal((await backups.status()).lastError, '');
});
test('pruning never touches other files in the backup folder', async (t) => {
  const { directory, clock, backups } = await fixture(t, { keep: 1 });
  await fs.mkdir(path.join(directory, 'auto-backups'));
  await fs.writeFile(path.join(directory, 'auto-backups', 'my-own-copy.atlas-backup'), 'keep');
  await backups.tick();
  clock.at += DAY;
  await backups.tick();
  const kept = await names(directory);
  assert.equal(kept.length, 2);
  assert(kept.includes('my-own-copy.atlas-backup'));
});
test('a real automatic backup restores, and backups are not nested inside each other', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-auto-real-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'workspace.json'), '{"chats":1}');
  const backups = createAutoBackups({
    directory,
    make: async () => createBackup(directory, '1.0.0', { localStorage: {} }),
  });
  await backups.tick();
  assert(!collect(directory).some((row) => row.path.startsWith('auto-backups/')));
  const [name] = await names(directory);
  const value = validate(await fs.readFile(path.join(directory, 'auto-backups', name)));
  assert(value.files.some((row) => row.path === 'workspace.json'));
});
