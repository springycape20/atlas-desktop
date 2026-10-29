const electron = require('electron'),
  path = require('node:path'),
  { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, dialog } = electron;
app.setName('ATLAS statistics prototype');
app.setPath('userData', path.join(__dirname, '../.statistics-demo/client'));
app.whenReady().then(async () => {
  const index = path.join(__dirname, 'demo.html'),
    url = pathToFileURL(index).href;
  const win = new BrowserWindow({
    title: 'ATLAS statistics · synthetic local prototype',
    width: 920,
    height: 850,
    webPreferences: {
      preload: path.join(__dirname, 'demo-preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  const allowed = new Set(
    [
      index,
      path.join(__dirname, 'demo-ui.js'),
      path.join(__dirname, 'demo.css'),
      path.join(__dirname, '../automatic-statistics-ui.js'),
    ].map((file) => pathToFileURL(file).href),
  );
  win.webContents.session.webRequest.onBeforeRequest((request, callback) =>
    callback({ cancel: !allowed.has(request.url) }),
  );
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win.webContents.session.setPermissionCheckHandler(() => false);
  const service = require('../automatic-statistics').createAutomaticStatistics({
    directory: app.getPath('userData'),
    version: require('../package.json').version,
    localDemo: true,
    config: {
      enabled: true,
      endpoint: 'http://127.0.0.1:43127/v1/reports',
      operator: 'Local prototype; synthetic task counters only',
      privacyUrl: 'Local guide: docs/AUTOMATIC-STATISTICS.md',
      contact: 'You operate both local windows; no hosted recipient',
      noticeVersion: 'local-demo-1',
    },
    jobs: () =>
      Array.from({ length: 15 }, (_, index) => ({
        status: index < 10 ? 'completed' : 'failed',
        endedAt: Date.now(),
        collaboration: true,
        verification: { status: 'passed' },
      })),
  });
  ipcMain.handle('atlas:demo-statistics', async (event, request) => {
    if (
      event.sender !== win.webContents ||
      event.senderFrame !== win.webContents.mainFrame ||
      event.senderFrame.url !== url
    )
      throw Error('Untrusted demo window.');
    if (request?.action === 'delete') {
      const answer = await dialog.showMessageBox(win, {
        message: 'Turn off and delete submitted local prototype reports?',
        buttons: ['Cancel', 'Request deletion'],
        defaultId: 0,
        cancelId: 0,
      });
      if (answer.response !== 1) return service.action({ action: 'status' });
      return service.action({ ...request, confirmed: true });
    }
    return service.action(request);
  });
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void service.stop().finally(() => app.quit());
  });
  await win.loadFile(index);
});
app.on('window-all-closed', () => app.quit());
