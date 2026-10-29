const path = require('node:path'),
  { pathToFileURL } = require('node:url');
function createAdminWindow({ electron, directory, store, show = true }) {
  const { BrowserWindow, ipcMain, dialog, session } = electron;
  const index = path.join(__dirname, 'index.html'),
    url = pathToFileURL(index).href;
  const isolated = session.fromPartition('atlas-insights-local');
  const files = new Set(
    [
      index,
      path.join(__dirname, 'app.js'),
      path.join(__dirname, 'style.css'),
      path.join(__dirname, '../statistics-schema.js'),
      path.join(__dirname, '../assets/beacon.png'),
    ].map((file) => pathToFileURL(file).href),
  );
  isolated.webRequest.onBeforeRequest((request, callback) => callback({ cancel: !files.has(request.url) }));
  isolated.setPermissionCheckHandler(() => false);
  isolated.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  isolated.on('will-download', (event) => event.preventDefault());
  const win = new BrowserWindow({
    title: 'ATLAS Insights · Local reports',
    width: 1280,
    height: 860,
    minWidth: 600,
    minHeight: 540,
    show,
    backgroundColor: '#111214',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      session: isolated,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  const trusted = (event) =>
    event.sender === win.webContents &&
    event.senderFrame === win.webContents.mainFrame &&
    event.senderFrame.url === url;
  ipcMain.removeHandler('atlas-insights:action');
  ipcMain.handle('atlas-insights:action', async (event, request = {}) => {
    if (!trusted(event)) throw Error('Untrusted admin window.');
    if (request.action === 'list') return store.action({ action: 'list' });
    if (request.action === 'import') {
      const selected = await dialog.showOpenDialog(win, {
        title: 'Import voluntarily shared statistics reports',
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'ATLAS statistics reports', extensions: ['json'] }],
      });
      if (selected.canceled) return { cancelled: true };
      return store.action({ action: 'import', paths: selected.filePaths });
    }
    if (['remove', 'clear'].includes(request.action)) {
      const result = await dialog.showMessageBox(win, {
        type: 'warning',
        message:
          request.action === 'clear'
            ? 'Delete all imported reports from this admin app?'
            : 'Delete this report receipt from this admin app?',
        detail:
          'Original shared files, messages and backups are separate copies. Delete those separately when appropriate.',
        buttons: ['Cancel', 'Delete'],
        defaultId: 0,
        cancelId: 0,
      });
      if (result.response !== 1) return { cancelled: true };
      return store.action({ action: request.action, id: request.id });
    }
    if (request.action === 'export') {
      const summary = await store.action({ action: 'summary' }),
        result = await dialog.showSaveDialog(win, {
          title: 'Save aggregate statistics summary',
          defaultPath: 'atlas-insights-summary.json',
          filters: [{ name: 'Aggregate summary', extensions: ['json'] }],
        });
      if (result.canceled || !result.filePath) return { cancelled: true };
      // Summary is computed from validated counters, never raw imported strings.
      const atomic = require('../atomic-store').createAtomicStore(result.filePath);
      await atomic.save(summary);
      await atomic.flush();
      return { saved: true };
    }
    throw Error('Unknown admin action.');
  });
  win.on('closed', () => ipcMain.removeHandler('atlas-insights:action'));
  void win.loadFile(index);
  return win;
}
module.exports = { createAdminWindow };
