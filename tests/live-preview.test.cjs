const test = require('node:test'),
  assert = require('node:assert/strict');
const { previewUrl } = require('../live-preview');
const { createLivePreview } = require('../live-preview');
test('live preview accepts only explicit local HTTP addresses without credentials', () => {
  for (const url of ['http://127.0.0.1:5173/', 'http://localhost:3000/test', 'http://[::1]:8080/'])
    assert(previewUrl(url));
  for (const url of [
    'https://example.com',
    'file:///C:/secret',
    'http://127.0.0.1.evil.test',
    'http://user:pass@localhost',
    'javascript:alert(1)',
    'http://192.168.1.2',
  ])
    assert.throws(() => previewUrl(url));
});
test('Vite startup requires approval and uses fixed loopback arguments without a shell', async (t) => {
  const fs = require('node:fs/promises'),
    path = require('node:path'),
    os = require('node:os'),
    { EventEmitter } = require('node:events');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-vite-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'node_modules/vite/bin'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules/vite/bin/vite.js'), '// fixture');
  const old = process.env.PATH;
  process.env.PATH = path.dirname(process.execPath);
  t.after(() => (process.env.PATH = old));
  let allowed = false;
  const calls = [];
  const service = createLivePreview({
    electron: {},
    directory: root,
    parent: () => null,
    approve: async () => allowed,
    spawnProcess: (exe, args, options) => {
      calls.push({ exe, args, options });
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      return child;
    },
  });
  assert.equal((await service.action({ action: 'start', cwd: root })).cancelled, true);
  assert.equal(calls.length, 0);
  allowed = true;
  await service.action({ action: 'start', cwd: root });
  assert.equal(calls.length, 1);
  assert(calls[0].args.includes('127.0.0.1'));
  assert(calls[0].args.includes('--strictPort'));
  assert.equal(calls[0].options.shell, undefined);
  await assert.rejects(service.action({ action: 'start', cwd: root }), /Stop/);
  service.dispose();
});
