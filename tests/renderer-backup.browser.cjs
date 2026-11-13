const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-renderer-backup-'));
app.setPath('userData', temp);
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.whenReady().then(async () => {
  try {
    protocol.handle('atlas', () => new Response('<!doctype html><title>Backup boundary test</title>'));
    const win = new BrowserWindow({ show: false });
    await win.loadURL('atlas://app/');
    const source = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
    const capture = vm.runInNewContext(
      '(' + source.match(/async function rendererBackup\(\) \{[\s\S]*?\n\}/)[0] + ')',
      {
        mainWindow: win,
        assistantService: { flush: async () => {} },
        require: require('node:module').createRequire(path.join(root, 'main.js')),
      },
    );
    await win.webContents.executeJavaScript(
      `window.atlasColabHistory={flush:async()=>{},load:async()=>{throw new DOMException('History access was denied','SecurityError');}};void 0`,
    );
    await assert.rejects(
      capture(),
      (error) => typeof error.message === 'string' && /History access was denied/.test(error.message),
    );
    await win.webContents.executeJavaScript(
      `window.flushed=false;window.atlasColabHistory={flush:async()=>{await new Promise(r=>setTimeout(r,20));window.flushed=true;},load:async()=>{if(!flushed)throw Error('Snapshot raced pending saves');return {chats:[{id:'fixture',messages:[{content:'preserved'}]}],selected:'fixture'};}};localStorage.setItem('atlas-fixture','kept');localStorage.setItem('unrelated','excluded');`,
    );
    const snapshot = await capture();
    assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), {
      localStorage: { 'atlas-fixture': 'kept' },
      colab: { chats: [{ id: 'fixture', messages: [{ content: 'preserved' }] }], selected: 'fixture' },
    });
    // Exercise the complete install preparation boundary, including the real backup worker.
    const records = path.join(temp, 'records'),
      installed = path.join(temp, 'installed');
    fs.mkdirSync(records);
    fs.mkdirSync(installed);
    fs.writeFileSync(path.join(installed, path.basename(process.execPath)), 'fixture executable');
    fs.writeFileSync(path.join(records, 'settings.json'), '{}');
    const client = require('../backup-client').createBackupClient();
    try {
      const recovery = require('../update-recovery').createUpdateRecovery({
        directory: records,
        appRoot: installed,
        version: '1.0.0',
        isPackaged: true,
        approve: async () => true,
        backupData: async () => client.create(records, '1.0.0', await capture()),
      });
      const updater = new (require('node:events').EventEmitter)();
      let installs = 0;
      updater.checkForUpdates = async () => updater.emit('update-available', { version: '1.1.0' });
      updater.downloadUpdate = async () => updater.emit('update-downloaded', { version: '1.1.0' });
      updater.quitAndInstall = () => installs++;
      const updates = require('../app-updates').createAppUpdates({
        app: { isPackaged: true, getVersion: () => '1.0.0' },
        updater,
        prepareRecovery: () => recovery.prepare(),
      });
      await updates.action({ action: 'check' });
      await updates.action({ action: 'download' });
      await win.webContents.executeJavaScript(
        `window.savedLoad=atlasColabHistory.load;atlasColabHistory.load=async()=>{throw new DOMException('Temporary history read failure','InvalidStateError');};void 0`,
      );
      await assert.rejects(updates.action({ action: 'install' }), /Temporary history read failure/);
      assert.equal((await updates.action()).status, 'downloaded');
      assert.equal(installs, 0);
      assert.equal(await recovery.status(), null);
      await win.webContents.executeJavaScript('atlasColabHistory.load=window.savedLoad;void 0');
      await updates.action({ action: 'install' });
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(installs, 1);
      const row = await recovery.status();
      const backup = require('../local-backups').validate(fs.readFileSync(row.data));
      assert.deepEqual(backup.renderer, JSON.parse(JSON.stringify(snapshot)));
      assert.equal(fs.readFileSync(row.executable, 'utf8'), 'fixture executable');
    } finally {
      client.dispose();
    }
    console.log('PASS: Renderer backup preserves data, waits for saves and transports readable DOM failures.');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
setTimeout(() => app.exit(2), 20000).unref();
