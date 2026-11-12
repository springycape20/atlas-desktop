// Exercise worker startup through the actual packaged ASAR, not the source tree.
const { app } = require('electron');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  assert = require('node:assert/strict');
app.disableHardwareAcceleration();
const temporary = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'atlas-packaged-backup-'));
app.setPath('userData', path.join(temporary, 'profile'));
app.whenReady().then(async () => {
  const directory = path.join(temporary, 'records');
  await fs.mkdir(directory);
  let client;
  try {
    const archive = path.resolve(__dirname, '../dist/win-unpacked/resources/app.asar');
    client = require(path.join(archive, 'backup-client.js')).createBackupClient();
    await fs.writeFile(path.join(directory, 'records.json'), JSON.stringify({ fixture: 'Packaged backup worker' }));
    const bytes = await client.create(directory, 'fixture', { localStorage: { fixture: 'renderer' } }),
      value = require(path.join(archive, 'local-backups.js')).validate(bytes);
    assert.equal(value.files.length, 1);
    assert.equal(JSON.parse(Buffer.from(value.files[0].data, 'base64')).fixture, 'Packaged backup worker');
    assert.equal(value.renderer.localStorage.fixture, 'renderer');
    assert.equal(client.status().running, false);
    console.log('PASS: Packaged ASAR backup worker starts and creates a verified local-record archive.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    client?.dispose();
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    app.exit(process.exitCode || 0);
  }
});
setTimeout(() => {
  console.error('Packaged backup worker timed out');
  app.exit(1);
}, 20000).unref();
