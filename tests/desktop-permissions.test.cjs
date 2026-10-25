const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  { createDesktopPermissions, screenAction, validOwner } = require('../desktop-permissions');
test('chat desktop grants persist, revoke and never include shell, files or application launch', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-desktop-grants-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const first = createDesktopPermissions(directory);
  await first.grant('colab:one');
  await first.flush();
  const restored = createDesktopPermissions(directory);
  assert((await restored.get('colab:one')).id);
  assert.equal(await restored.get('colab:two'), null);
  await restored.revoke('colab:one');
  assert.equal(await createDesktopPermissions(directory).get('colab:one'), null);
  for (const name of ['Screenshot', 'Click', 'Type', 'Shortcut', 'Move']) assert(screenAction(name));
  for (const name of ['PowerShell', 'Registry', 'FileSystem', 'Clipboard']) assert(!screenAction(name));
  assert(screenAction('App', { mode: 'switch' }));
  assert(screenAction('App', { mode: 'resize' }));
  assert(!screenAction('App', { mode: 'launch_executable' }));
  assert(!screenAction('App', { mode: 'launch' }));
  assert(!validOwner('colab:undefined'));
  assert(!validOwner('colab:\n'));
  await assert.rejects(first.grant('invalid'));
});
test('corrupt permissions fail closed but explicit revocation recovers and notification failures do not retain access', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-corrupt-grants-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.writeFile(path.join(directory, 'desktop-permissions.json'), 'invalid');
  const permissions = createDesktopPermissions(directory, () => {
    throw Error('Window closed');
  });
  await assert.rejects(permissions.get('colab:one'));
  await permissions.revoke();
  assert.equal((await permissions.list()).length, 0);
  await permissions.grant('colab:one');
  await permissions.revoke();
  assert.equal((await createDesktopPermissions(directory).list()).length, 0);
});

test('repeated grants reuse one permission identity for concurrent providers', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-idempotent-grants-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const permissions = createDesktopPermissions(directory),
    grants = await Promise.all([permissions.grant('colab:one'), permissions.grant('colab:one')]);
  assert.equal(grants[0].id, grants[1].id);
  assert.equal((await permissions.list()).length, 1);
});
