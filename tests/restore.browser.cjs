const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-restore-ui-'));
app.setPath('userData', temp);
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([
  { scheme: 'atlas', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.whenReady().then(async () => {
  try {
    const state = {
      localStorage: { 'atlas.fixture': 'restored', unrelated: 'refused' },
      colab: { chats: [{ id: 'fixture', title: 'Restored chat', messages: [] }], selected: 'fixture' },
    };
    protocol.handle('atlas', (request) => {
      const file = new URL(request.url).pathname;
      if (file === '/mock.js')
        return new Response(
          `localStorage.setItem('atlas.stale','remove');localStorage.setItem('other-app','preserve');window.atlas={rendererRestore:async request=>{if(request?.action==='complete'){localStorage.setItem('fixture-completed','true');return {ok:true}}return ${JSON.stringify(state)}}};`,
          { headers: { 'Content-Type': 'application/javascript' } },
        );
      if (file === '/restore-state.js')
        return new Response(fs.readFileSync(path.join(__dirname, '../restore-state.js')), {
          headers: { 'Content-Type': 'application/javascript' },
        });
      if (file === '/restore.html')
        return new Response(
          fs
            .readFileSync(path.join(__dirname, '../restore.html'), 'utf8')
            .replace('<head>', '<head><script src="/mock.js"></script>'),
          { headers: { 'Content-Type': 'text/html' } },
        );
      return new Response('<html><body>Restored application</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      });
    });
    const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await win.loadURL('atlas://app/restore.html');
    for (let n = 0; n < 100 && win.webContents.getURL() !== 'atlas://app/'; n++)
      await new Promise((r) => setTimeout(r, 50));
    assert.equal(win.webContents.getURL(), 'atlas://app/');
    assert.equal(await win.webContents.executeJavaScript("localStorage.getItem('fixture-completed')"), 'true');
    const actual = await win.webContents.executeJavaScript(
      `(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('atlas-colab-history',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const tx=db.transaction(['chats','meta']);const chats=tx.objectStore('chats').getAll(),meta=tx.objectStore('meta').get('state');return await new Promise((resolve,reject)=>{tx.oncomplete=()=>{db.close();resolve({chats:chats.result,meta:meta.result,storage:{...localStorage}})};tx.onerror=()=>reject(tx.error)})})()`,
    );
    assert.deepEqual(actual.chats, state.colab.chats);
    assert.deepEqual(actual.meta, { selected: 'fixture', migrated: true });
    assert.equal(actual.storage['atlas.fixture'], 'restored');
    assert.equal(actual.storage['atlas.stale'], undefined);
    assert.equal(actual.storage.unrelated, undefined);
    assert.equal(actual.storage['other-app'], 'preserve');
    console.log(
      'PASS: Restore bootstrap replaces ATLAS browser records and Colab IndexedDB before loading the application.',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
setTimeout(() => {
  console.error('Restore UI timed out');
  app.exit(1);
}, 20000).unref();
