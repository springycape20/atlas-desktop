const { app, BrowserWindow, session } = require('electron'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { createLivePreview } = require('../live-preview');
app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});
let service,
  server,
  remote,
  temp,
  windowRef,
  remoteRequests = 0;
const timeout = setTimeout(() => {
  console.error('Live preview test timed out');
  app.exit(1);
}, 45000).unref();
app.whenReady().then(async () => {
  try {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-live-ui-'));
    const cwd = path.join(temp, 'project');
    await fs.mkdir(cwd);
    remote = http.createServer((_req, res) => {
      remoteRequests++;
      res.end('remote');
    });
    await new Promise((r) => remote.listen(0, '127.0.0.1', r));
    const remoteUrl = 'http://127.0.0.1:' + remote.address().port;
    server = http.createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<html><body style="font:24px system-ui;padding:40px;background:#eceff0"><h1>ATLAS preview test</h1><button id="target" style="font:inherit;padding:20px">Change this button</button><script>window.previewScriptRan=true;fetch(' +
          JSON.stringify(remoteUrl) +
          ').catch(()=>{});</script></body></html>',
      );
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    let imported = 0;
    service = createLivePreview({
      electron: {
        session,
        BrowserWindow: class extends BrowserWindow {
          constructor(options) {
            super({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true } });
            windowRef = this;
          }
        },
      },
      directory: path.join(temp, 'data'),
      parent: () => null,
      approve: async () => false,
      importPaths: async (names) => {
        assert((await fs.stat(names[0])).size > 100);
        imported++;
        return [{ id: 'screenshot', name: 'preview.png' }];
      },
    });
    const url = 'http://127.0.0.1:' + server.address().port;
    await service.action({ action: 'open', cwd, url });
    const isolation = await windowRef.webContents.executeJavaScript(
      '({node:typeof require,api:typeof atlas,scripts:previewScriptRan})',
    );
    assert.deepEqual(isolation, { node: 'undefined', api: 'undefined', scripts: true });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(remoteRequests, 0);
    assert.equal(
      await windowRef.webContents.executeJavaScript(
        "navigator.permissions.query({name:'camera'}).then(value=>value.state)",
      ),
      'denied',
    );
    await service.action({ action: 'inspect', cwd });
    await windowRef.webContents.executeJavaScript('document.getElementById("target").click()');
    const capture = await service.action({ action: 'capture', cwd });
    assert.equal(capture.selected.selector, 'button#target');
    assert.equal(capture.attachments[0].id, 'screenshot');
    assert.equal(imported, 1);
    const out = path.join(__dirname, '..', '.handover', 'workbench-previews');
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(out, 'live-preview.png'), (await windowRef.webContents.capturePage()).toPNG());
    await assert.rejects(service.action({ action: 'capture', cwd: temp }), /Switch back/);
    service.dispose();
    server.close();
    remote.close();
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
    console.log(
      'PASS: real live preview scripts, sandbox isolation, cross-origin request blocking, element selection, screenshot attachment and project ownership.',
    );
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    service?.dispose();
    server?.close();
    remote?.close();
    app.exit(1);
  }
});
