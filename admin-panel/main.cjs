const electron = require('electron'),
  path = require('node:path');
const { app } = electron;
app.setName('ATLAS Insights');
app.setPath('userData', path.join(app.getPath('appData'), 'atlas-insights'));
if (process.platform === 'win32') app.setAppUserModelId('com.springycape.atlas.insights');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let win;
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    const directory = app.getPath('userData'),
      store = require('./store.cjs').createReportStore(directory);
    win = require('./window.cjs').createAdminWindow({ electron, directory, store });
  });
  app.on('window-all-closed', () => app.quit());
}
