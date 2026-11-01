const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readStored } = require('../atomic-store');
const { createService } = require('../assistant-service');
const backups = require('../local-backups');
const { createUpdateRecovery } = require('../update-recovery');

function folder(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-data-safety-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function sparse(file, size) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const handle = fs.openSync(file, 'w');
  fs.ftruncateSync(handle, size);
  fs.closeSync(handle);
}

test('readStored moves a damaged file aside and leaves a good or unreadable one in place', (t) => {
  const dir = folder(t),
    file = path.join(dir, 'store.json');
  assert.equal(readStored(file), undefined);
  fs.writeFileSync(file, '[1]');
  assert.deepEqual(readStored(file, Array.isArray), { value: [1] });
  fs.writeFileSync(file, '{"a":1}');
  const wrongShape = readStored(file, Array.isArray);
  assert.equal(fs.readFileSync(wrongShape.damaged, 'utf8'), '{"a":1}');
  assert.equal(fs.existsSync(file), false);
  fs.writeFileSync(file, '[{"id"');
  assert.equal(fs.readFileSync(readStored(file).damaged, 'utf8'), '[{"id"');
  // A read that fails for another reason must not look like an empty store.
  fs.mkdirSync(file);
  assert.throws(() => readStored(file), /EISDIR/);
  assert.equal(fs.statSync(file).isDirectory(), true);
});

test('a damaged assistant file does not stop start-up and is kept', (t) => {
  const dir = folder(t),
    file = path.join(dir, 'assistant-data.json');
  fs.writeFileSync(file, '{"memories":[{"id"');
  let kept;
  const service = createService({ directory: dir, notify() {}, onDamaged: (value) => (kept = value) });
  assert.deepEqual(service.memory('list'), []);
  assert.equal(fs.readFileSync(kept, 'utf8'), '{"memories":[{"id"');
});

test('an assistant file with the wrong list shapes is treated as damaged', (t) => {
  for (const content of ['{"reminders":null}', '{"memories":"text"}', '{"reminders":[null]}', '{"jobs":{}}']) {
    const dir = folder(t),
      file = path.join(dir, 'assistant-data.json');
    fs.writeFileSync(file, content);
    let kept;
    const service = createService({ directory: dir, notify() {}, onDamaged: (value) => (kept = value) });
    service.tick();
    assert.deepEqual(service.memory('list'), []);
    assert.equal(fs.readFileSync(kept, 'utf8'), content);
  }
});

test('a restore request with nothing staged reports once, then clears', (t) => {
  const dir = folder(t);
  fs.writeFileSync(path.join(dir, '.restore-pending.json'), JSON.stringify({ id: 'gone', expected: [] }));
  assert.throws(() => backups.applyPendingRestore(dir), /ENOENT/);
  assert.equal(backups.applyPendingRestore(dir), false);
  fs.writeFileSync(path.join(dir, '.restore-pending.json'), '{"id"');
  assert.throws(() => backups.applyPendingRestore(dir), SyntaxError);
  assert.equal(backups.applyPendingRestore(dir), false);
});

test('backups accept a single large file and name the limit they enforce', (t) => {
  const dir = folder(t);
  sparse(path.join(dir, 'attachments', 'video.bin'), 33 * 1024 * 1024);
  fs.writeFileSync(path.join(dir, 'conversations.json'), '[]');
  assert.equal(backups.validate(backups.createBackup(dir, '1', {})).files.length, 2);
  sparse(path.join(dir, 'attachments', 'huge.bin'), 257 * 1024 * 1024);
  assert.throws(
    () => backups.createBackup(dir, '1', {}),
    (error) => error.code === 'ATLAS_BACKUP_LIMIT' && /256 MiB/.test(error.message),
  );
});

function recoveryFixture(t, options) {
  const dir = folder(t),
    appRoot = path.join(dir, 'app'),
    directory = path.join(dir, 'records');
  fs.mkdirSync(appRoot);
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(appRoot, path.basename(process.execPath)), 'fixture executable');
  return {
    directory,
    recovery: createUpdateRecovery({ directory, appRoot, version: '1.0.0', isPackaged: true, ...options }),
  };
}
const overLimit = async () => {
  throw Object.assign(Error('over the limit'), { code: 'ATLAS_BACKUP_LIMIT' });
};

test('records over the backup limit can still update, with approval, and roll back without a restore', async (t) => {
  const asked = [],
    events = [];
  const { recovery } = recoveryFixture(t, {
    approve: async (title) => asked.push(title),
    backupData: overLimit,
    restoreData: async () => events.push('restore'),
    launch: async () => events.push('launch'),
  });
  const row = await recovery.prepare();
  assert.equal(row.data, null);
  assert.equal(asked.length, 2);
  assert.match(asked[1], /without backing up/);
  await recovery.rollback();
  assert.deepEqual(events, ['launch']);
  assert.match(asked[2], /^Launch the preserved version\?$/);
});

test('declining the update without a backup cancels it and leaves no copy', async (t) => {
  let answers = 0;
  const { recovery, directory } = recoveryFixture(t, {
    approve: async () => ++answers === 1,
    backupData: overLimit,
  });
  await assert.rejects(recovery.prepare(), /over the limit/);
  assert.deepEqual(fs.readdirSync(path.join(directory, 'update-recovery')), []);
  assert.equal(await recovery.status(), null);
});

test('other backup failures still stop the update', async (t) => {
  const asked = [];
  const { recovery } = recoveryFixture(t, {
    approve: async (title) => asked.push(title),
    backupData: async () => {
      throw Error('disk full');
    },
  });
  await assert.rejects(recovery.prepare(), /disk full/);
  assert.equal(asked.length, 1);
});
