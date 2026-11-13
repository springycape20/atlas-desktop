const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  vm = require('node:vm');
test('the production preload carries reviewed context and exclusions through Assistant IPC', async () => {
  let api, call;
  vm.runInNewContext(await fs.readFile(path.join(__dirname, '../preload.js'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_n, v) => (api = v) },
      ipcRenderer: { invoke: async (...args) => (call = args), on() {}, removeListener() {} },
      webUtils: {},
    }),
  });
  await api.chat({
    prompt: 'question',
    cwd: 'C:/demo',
    contextSelection: {
      vault: true,
      vaultPreview: 'receipt',
      vaultPaths: ['a.md'],
      files: ['private.js'],
      history: false,
    },
  });
  assert.equal(call[0], 'atlas:chat');
  assert.equal(call[1].contextSelection.vaultPreview, 'receipt');
  assert.equal(call[1].contextSelection.history, false);
  assert.deepEqual(Array.from(call[1].contextSelection.vaultPaths), ['a.md']);
});
test('explicit note references retain note guards and make unrelated notes ineligible', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-note-reference-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'wanted.md'), 'Unrelated vocabulary, explicitly selected');
  await fs.writeFile(path.join(root, 'other.md'), 'quasar quasar');
  const scan = await require('../vault-notes').searchVault(root, 'quasar', { included: ['wanted.md'] });
  assert.deepEqual(
    scan.results.map((r) => r.path),
    ['wanted.md'],
  );
  const excluded = await require('../vault-notes').searchVault(root, 'quasar', {
    included: ['wanted.md'],
    excluded: ['wanted.md'],
  });
  assert.equal(excluded.results.length, 0);
  assert(excluded.truncated);
  const selected = require('../context-selection').selection({
    vaultPaths: ['wanted.md', '../secret.md', '.private/note.md', 'x.txt', 'wanted.md'],
  });
  assert.deepEqual(selected.vaultPaths, ['wanted.md']);
});
test('changing selected notes invalidates the prior review receipt', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-note-receipt-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'notes');
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'a.md'), 'quasar');
  const source = require('../vault-source').createVaultSource(path.join(root, 'data'), {
    search: require('../vault-notes').searchVault,
  });
  await source.configure('choose', folder);
  await source.configure('enable');
  const preview = await source.context(
    'quasar',
    { vault: true, vaultPaths: ['a.md'] },
    { preview: true, scope: 'assistant' },
  );
  await assert.rejects(
    source.context('quasar', { vault: true, vaultPaths: [], vaultPreview: preview.token }, { scope: 'assistant' }),
    /Refresh/,
  );
});
