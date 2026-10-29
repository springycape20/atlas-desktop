const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { createProjectFiles, referencePath } = require('../project-files');
test('project previews read bounded images/text but reject traversal, private paths, denied paths and escaping links', async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-files-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'project');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'hello.txt'), 'Hello project');
  await fs.writeFile(path.join(root, 'page.html'), '<script>evil()</script><h1>Page</h1>');
  await fs.writeFile(path.join(root, '.env'), 'SECRET');
  await fs.writeFile(path.join(temp, 'outside.txt'), 'Outside');
  const files = createProjectFiles({ denied: async () => [path.join(root, 'blocked.txt')] });
  await fs.writeFile(path.join(root, 'blocked.txt'), 'Denied');
  assert.equal((await files.read(root, 'hello.txt:2')).text, 'Hello project');
  assert.equal((await files.read(root, 'page.html')).kind, 'html');
  for (const reference of ['../outside.txt', '.env', 'blocked.txt', 'https://evil.invalid/a.png', 'hello.txt:secret'])
    await assert.rejects(files.read(root, reference));
  const list = await files.list(root);
  assert(!list.entries.some((row) => ['.env', 'blocked.txt'].includes(row.name)));
  await fs.symlink(temp, path.join(root, 'escape'), 'junction');
  await assert.rejects(files.read(root, 'escape/outside.txt'));
  await fs.writeFile(path.join(root, 'big.txt'), 'x'.repeat(262145));
  assert.match((await files.read(root, 'big.txt')).message, /too large/);
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3xkAAAAASUVORK5CYII=',
    'base64',
  );
  await fs.writeFile(path.join(root, 'preview.png'), png);
  assert.match((await files.read(root, 'preview.png')).preview, /^data:image\/png;base64,/);
  assert.equal(referencePath('src/app.js#L12'), 'src/app.js');
});
