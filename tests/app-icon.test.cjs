const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { mainHarness } = require('./fixtures/main-harness.cjs');
const root = path.resolve(__dirname, '..');
const settle = () => new Promise((resolve) => setTimeout(resolve, 90));

test('the taskbar Beacon turns orange while any job runs and white when the last one ends', async (t) => {
  const h = await mainHarness(t),
    shown = () => h.icons.map((icon) => path.basename(icon));
  h.activeJobs.set('done', { id: 'done', status: 'completed' });
  h.emitJobs();
  await settle();
  assert.deepEqual(shown(), [], 'finished jobs leave the white icon alone');
  h.activeJobs.set('reply', { id: 'reply', status: 'running' });
  h.emitJobs();
  await settle();
  h.activeJobs.set('colab', { id: 'colab', status: 'running', collaboration: true });
  h.emitJobs();
  await settle();
  assert.deepEqual(shown(), ['app-icon-working.png'], 'a second job keeps it orange without resetting it');
  h.activeJobs.get('reply').status = 'completed';
  h.emitJobs();
  await settle();
  assert.deepEqual(shown(), ['app-icon-working.png'], 'one job still running');
  h.activeJobs.get('colab').status = 'paused';
  h.emitJobs();
  await settle();
  assert.deepEqual(shown(), ['app-icon-working.png', 'app-icon.png'], 'a paused task is not working');
});

test('the app icon files exist and the Windows build uses the white Beacon', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.build.win.icon, 'build/icon.ico');
  assert.equal(pkg.build.win.signAndEditExecutable, true, 'the build must set the icon on ATLAS.exe');
  const ico = await fs.readFile(path.join(root, pkg.build.win.icon));
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0], 'an .ico header');
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, n) => ico[6 + 16 * n] || 256);
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
  for (const file of ['app-icon.png', 'app-icon-working.png', 'beacon.png', 'beacon-working.png']) {
    const png = await fs.readFile(path.join(root, 'assets', file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', file);
  }
});
