const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('the app icon files exist and the Windows build uses the Beacon logo', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.build.win.icon, 'build/icon.ico');
  assert.equal(pkg.build.win.signAndEditExecutable, true, 'the build must set the icon on ATLAS.exe');
  const ico = await fs.readFile(path.join(root, pkg.build.win.icon));
  assert.deepEqual([...ico.subarray(0, 4)], [0, 0, 1, 0], 'an .ico header');
  const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, n) => ico[6 + 16 * n] || 256);
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
  for (const file of ['app-icon.png', 'beacon.png', 'beacon-working.png']) {
    const png = await fs.readFile(path.join(root, 'assets', file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', file);
  }
});
