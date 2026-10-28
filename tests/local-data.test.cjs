const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { requestReset, applyPendingReset } = require('../local-data');
test('local reset clears app records at next startup, preserves downloads and prevents legacy reimport', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-reset-'));
  t.after(async () => {
    assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(root, { recursive: true, force: true });
  });
  const data = path.join(root, 'ATLAS'),
    legacy = path.join(root, 'legacy');
  await fs.mkdir(path.join(data, 'IndexedDB'), { recursive: true });
  await fs.mkdir(path.join(data, 'tools'), { recursive: true });
  await fs.mkdir(legacy);
  await fs.writeFile(path.join(data, 'settings.json'), 'private');
  await fs.writeFile(path.join(data, 'IndexedDB', 'chats'), 'private');
  await fs.writeFile(path.join(data, 'tools', 'uvx.exe'), 'keep');
  await fs.writeFile(path.join(legacy, 'settings.json'), 'old private copy');
  if (process.platform === 'win32') await fs.symlink(legacy, path.join(data, 'outside-link'), 'junction');
  assert.equal(applyPendingReset(data, legacy), false);
  const externalMarker = path.join(root, 'external-marker.json');
  await fs.writeFile(externalMarker, '{"version":99}');
  await fs.link(externalMarker, path.join(data, '.data-reset-request-v1.json'));
  await fs.link(externalMarker, path.join(data, '.legacy-migration-v1.json'));
  requestReset(data);
  assert.equal(await fs.readFile(externalMarker, 'utf8'), '{"version":99}');
  assert.equal(await fs.readFile(path.join(data, 'settings.json'), 'utf8'), 'private');
  assert.equal(applyPendingReset(data, legacy), true);
  assert.equal(await fs.readFile(externalMarker, 'utf8'), '{"version":99}');
  await assert.rejects(fs.access(path.join(data, 'settings.json')));
  await assert.rejects(fs.access(path.join(data, 'IndexedDB')));
  assert.equal(await fs.readFile(path.join(data, 'tools', 'uvx.exe'), 'utf8'), 'keep');
  assert.equal((await require('../startup-lifecycle').migrateOnce(legacy, data)).skipped, true);
  assert.equal(await fs.readFile(path.join(legacy, 'settings.json'), 'utf8'), 'old private copy');
  assert.equal(applyPendingReset(data, legacy), false);
});

test('data-reset IPC rejects untrusted/busy requests and cancellation makes no reset request', async (t) => {
  let answer = 0,
    prompts = 0,
    relaunches = 0;
  const h = await require('./fixtures/main-harness.cjs').mainHarness(t, {
    dialog: {
      showMessageBox: async (_win, options) => {
        prompts++;
        assert.equal(options.defaultId, 0);
        return { response: answer };
      },
    },
    onRelaunch: () => relaunches++,
  });
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } };
  const reset = h.handlers.get('atlas:reset-local-data');
  await assert.rejects(reset({}), /Untrusted/);
  h.activeJobs.set('running', { status: 'running' });
  await assert.rejects(reset(event), /stop running tasks/);
  assert.equal(prompts, 0);
  h.activeJobs.clear();
  assert.equal((await reset(event)).cancelled, true);
  await assert.rejects(fs.access(path.join(h.paths.userData, '.data-reset-request-v1.json')));
  answer = 1;
  assert.equal((await reset(event)).restarting, true);
  assert.equal(relaunches, 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(h.paths.userData, '.data-reset-request-v1.json'))).version, 1);
});
