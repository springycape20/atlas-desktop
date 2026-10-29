const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto'),
  asar = require('@electron/asar');
async function verify() {
  const directory = path.join(__dirname, '../dist/insights/win-unpacked'),
    archive = path.join(directory, 'resources/app.asar');
  const expected = [
    'LICENSE',
    'admin-panel/app.js',
    'admin-panel/index.html',
    'admin-panel/main.cjs',
    'admin-panel/preload.cjs',
    'admin-panel/store.cjs',
    'admin-panel/style.css',
    'admin-panel/window.cjs',
    'assets/beacon.png',
    'atomic-store.js',
    'docs/OFFLINE-INSIGHTS.md',
    'docs/STATISTICS-PRIVACY-ASSESSMENT.md',
    'statistics-report.js',
    'statistics-schema.js',
  ];
  for (const file of expected)
    assert(
      asar
        .extractFile(archive, path.join(...file.split('/')))
        .equals(fs.readFileSync(path.join(__dirname, '..', file))),
      'Packaged file differs: ' + file,
    );
  for (const raw of asar.listPackage(archive)) {
    const file = raw.replaceAll('\\', '/').replace(/^\//, '');
    assert(
      file === 'package.json' || expected.includes(file) || expected.some((name) => name.startsWith(file + '/')),
      'Unexpected packaged content: ' + file,
    );
  }
  const metadata = JSON.parse(asar.extractFile(archive, 'package.json'));
  assert.equal(metadata.main, 'admin-panel/main.cjs');
  assert.equal(metadata.name, 'atlas-insights');
  assert.equal(metadata.version, '0.1.0');
  for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html'])
    assert(fs.statSync(path.join(directory, name)).size > 1000);
  const exe = path.join(directory, 'ATLAS Insights.exe'),
    { getCurrentFuseWire, FuseV1Options } = require('@electron/fuses'),
    wire = await getCurrentFuseWire(exe);
  for (const name of ['RunAsNode', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments'])
    assert.equal(String.fromCharCode(wire[FuseV1Options[name]]), '0');
  for (const name of ['EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar'])
    assert.equal(String.fromCharCode(wire[FuseV1Options[name]]), '1');
  const headerHash = crypto.createHash('sha256').update(asar.getRawHeader(archive).headerString).digest('hex'),
    binary = fs.readFileSync(exe);
  assert(binary.includes(Buffer.from(headerHash)) || binary.includes(Buffer.from(headerHash, 'utf16le')));
  assert(fs.statSync(path.join(__dirname, '../dist/insights/ATLAS-Insights-0.1.0.exe')).size > 0);
  console.log(
    'Verified ATLAS Insights 0.1.0: exact source files, no user data/provider dependencies, Electron notices, binary fuses and ASAR hash.',
  );
}
verify().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
