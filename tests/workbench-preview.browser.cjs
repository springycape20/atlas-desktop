const { app, BrowserWindow, WebContentsView, session, ipcMain, nativeImage } = require('electron');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  http = require('node:http'),
  assert = require('node:assert/strict');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
let server,
  other,
  service,
  owner,
  root,
  view,
  requests = 0;
const timer = setTimeout(() => {
  console.error('Dock preview timed out');
  app.exit(1);
}, 30000).unref();
app.whenReady().then(async () => {
  try {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-dock-preview-'));
    other = http.createServer((_req, res) => {
      requests++;
      res.end('outside');
    });
    await new Promise((r) => other.listen(0, '127.0.0.1', r));
    server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<h1>Docked project</h1><script>fetch("http://127.0.0.1:' + other.address().port + '").catch(()=>{});</script>',
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    owner = new BrowserWindow({ show: false, width: 1200, height: 800 });
    await owner.loadURL(
      'data:text/html,<title>ATLAS preview verification</title><body>Isolated preview verification</body>',
    );
    owner.setPosition(0, 0);
    owner.showInactive();
    service = require('../live-preview').createLivePreview({
      electron: {
        BrowserWindow,
        session,
        ipcMain,
        nativeImage,
        app,
        WebContentsView: class extends WebContentsView {
          constructor(options) {
            super(options);
            view = this;
          }
        },
      },
      directory: path.join(root, 'data'),
      parent: () => owner,
      approve: async () => false,
      importPaths: async () => [],
    });
    await service.action({ action: 'open', cwd: root, dock: true, url: 'http://127.0.0.1:' + server.address().port });
    assert.equal(BrowserWindow.getAllWindows().length, 1, 'Dock preview must not create another window');
    const bounds = await service.action({
      action: 'dock-layout',
      cwd: root,
      x: 600,
      y: 180,
      width: 550,
      height: 500,
      visible: true,
    });
    assert.deepEqual(view.getBounds(), bounds);
    assert.equal(view.getVisible(), true);
    const context = await view.webContents.executeJavaScript(
      '({node:typeof require,api:typeof atlas,title:document.querySelector("h1").textContent})',
    );
    assert.deepEqual(context, { node: 'undefined', api: 'undefined', title: 'Docked project' });
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(requests, 0, 'Outside origin requests must stay blocked');
    await service.action({ action: 'dock-layout', cwd: root, visible: false });
    assert.equal(view.getVisible(), false);
    assert.equal(view.getBounds().width, 550);
    const baseline = await service.action({ action: 'visual-baseline', cwd: root });
    assert.deepEqual(baseline.size, { width: 550, height: 500 });
    assert.equal(view.webContents.debugger.isAttached(), false);
    assert.equal(view.getVisible(), false);
    assert.deepEqual(view.getBounds(), bounds);
    await service.action({ action: 'close' });
    assert.equal((await service.action({ action: 'status' })).open, false);
    console.log(
      'PASS: Native embedded preview, isolated API boundary, same-origin restriction, layout, hide and close.',
    );
    clearTimeout(timer);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    service?.dispose();
    if (owner && !owner.isDestroyed()) owner.destroy();
    server?.close();
    other?.close();
    if (root) await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
    app.exit(process.exitCode || 0);
  }
});
