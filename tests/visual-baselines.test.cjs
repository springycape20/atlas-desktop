const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { createVisualBaselines } = require('../visual-baselines');
test('visual baselines persist across store instances and are scoped to canonical projects', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-visual-store-')),
    a = path.join(root, 'a'),
    b = path.join(root, 'b');
  await fs.mkdir(a);
  await fs.mkdir(b);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = createVisualBaselines(root),
    bytes = Buffer.from('fixture image bytes');
  const row = await store.action({
    action: 'save',
    cwd: a,
    name: 'Before',
    url: 'http://127.0.0.1:5173/',
    size: { width: 100, height: 100 },
    bytes,
  });
  assert.equal((await createVisualBaselines(root).action({ action: 'list', cwd: a })).length, 1);
  assert.equal((await store.action({ action: 'list', cwd: b })).length, 0);
  assert.deepEqual((await store.action({ action: 'load', cwd: a, id: row.id })).bytes, bytes);
  await assert.rejects(store.action({ action: 'load', cwd: b, id: row.id }), /this project/);
  const file = path.join(root, 'visual-baselines.json'),
    data = JSON.parse(await fs.readFile(file));
  data[0].png = Buffer.from('changed').toString('base64');
  await fs.writeFile(file, JSON.stringify(data));
  await assert.rejects(store.action({ action: 'load', cwd: a, id: row.id }), /integrity/);
  await store.action({ action: 'remove', cwd: a, id: row.id });
  assert.equal((await store.action({ action: 'list', cwd: a })).length, 0);
});
test('visual baseline limits reject empty, oversized and excessive saved images', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-visual-limits-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = createVisualBaselines(root);
  await assert.rejects(store.action({ action: 'save', cwd: root, name: '', bytes: Buffer.from('x') }), /name/);
  await assert.rejects(
    store.action({ action: 'save', cwd: root, name: 'large', bytes: Buffer.alloc(8 * 1048576 + 1) }),
    /8 MiB/,
  );
  for (let i = 0; i < 20; i++)
    await store.action({
      action: 'save',
      cwd: root,
      name: 'Fixture ' + i,
      bytes: Buffer.from('x'),
      size: { width: 1, height: 1 },
      url: 'http://127.0.0.1/',
    });
  await assert.rejects(store.action({ action: 'save', cwd: root, name: 'extra', bytes: Buffer.from('x') }), /full/);
});
