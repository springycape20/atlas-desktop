// Runs in Electron because its fs treats .asar files as folders, which plain Node tests cannot show.
const { app } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:original-fs');
const os = require('node:os');
const path = require('node:path');
const { createUpdateRecovery } = require('../update-recovery');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-update-recovery-'));
  try {
    const appRoot = path.join(temp, 'installed'),
      directory = path.join(temp, 'data'),
      executable = path.basename(process.execPath);
    fs.mkdirSync(path.join(appRoot, 'resources', 'nested'), { recursive: true });
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(appRoot, executable), 'executable');
    fs.writeFileSync(path.join(appRoot, 'resources', 'app.asar'), 'not a real archive');
    fs.writeFileSync(path.join(appRoot, 'resources', 'nested', 'file.txt'), 'nested');
    const options = {
      directory,
      appRoot,
      version: '1.0.0',
      isPackaged: true,
      approve: async () => true,
      backupData: async () => Buffer.from('backup'),
    };
    const row = await createUpdateRecovery(options).prepare();
    const copy = path.join(row.folder, 'app');
    assert.equal(fs.readFileSync(path.join(copy, 'resources', 'app.asar'), 'utf8'), 'not a real archive');
    assert.equal(fs.readFileSync(path.join(copy, 'resources', 'nested', 'file.txt'), 'utf8'), 'nested');
    assert.equal(fs.readFileSync(row.data, 'utf8'), 'backup');
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'update-recovery.json'))).folder, row.folder);

    // A failed copy must not leave gigabytes behind or replace the working recovery record.
    await assert.rejects(
      createUpdateRecovery({
        ...options,
        backupData: async () => {
          throw Error('backup failed');
        },
      }).prepare(),
      /backup failed/,
    );
    assert.deepEqual(fs.readdirSync(path.join(directory, 'update-recovery')), [path.basename(row.folder)]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'update-recovery.json'))).folder, row.folder);
    // A valid archive is the installed case: copy the built one when there is one.
    const built = path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar');
    if (fs.existsSync(built)) {
      fs.copyFileSync(built, path.join(appRoot, 'resources', 'app.asar'));
      const real = await createUpdateRecovery(options).prepare();
      assert.ok(fs.readFileSync(built).equals(fs.readFileSync(path.join(real.folder, 'app', 'resources', 'app.asar'))));
    }
    console.log('PASS: Update recovery copies app.asar as a file and removes failed copies.');
    fs.rmSync(temp, { recursive: true, force: true });
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
setTimeout(() => {
  console.error('Update recovery test timed out');
  app.exit(1);
}, 30000).unref();
