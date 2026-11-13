function createAppUpdates({
  app,
  updater,
  notify = () => {},
  busy = () => false,
  fetchRelease = defaultFetch,
  prepareRecovery = async () => {},
  readPreferences = async () => ({}),
}) {
  const version = app.getVersion(),
    source = !app.isPackaged;
  let state = { status: 'idle', currentVersion: version, source },
    pending;
  const set = (value) => {
    state = { ...state, ...value };
    notify({ ...state });
  };
  const installFailure = (error) => {
    const message =
      'Update not installed. ' +
      errorMessage(error, 'The recovery backup could not be prepared.') +
      ' ATLAS has not restarted. The downloaded update is still available; retry or open GitHub Releases.';
    set({ status: 'downloaded', error: message });
    return Error(message);
  };
  if (!source) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('checking-for-update', () => set({ status: 'checking', error: '' }));
    updater.on('update-available', (info) =>
      set({ status: 'available', version: info.version, percent: 0, error: '' }),
    );
    updater.on('update-not-available', () => set({ status: 'current', error: '' }));
    updater.on('download-progress', (info) => set({ status: 'downloading', percent: Math.round(info.percent) }));
    updater.on('update-downloaded', (info) =>
      set({ status: 'downloaded', version: info.version, percent: 100, error: '' }),
    );
    updater.on('error', (error) =>
      state.status === 'installing' ? installFailure(error) : set({ status: 'error', error: readable(error) }),
    );
  }
  async function action(request = {}) {
    if (!request.action || request.action === 'status') return { ...state };
    if (pending) return pending;
    if (request.action === 'install') {
      if (source || state.status !== 'downloaded') throw Error('Download an update before restarting.');
      if (busy()) throw Error('Finish or stop running tasks before installing the update.');
    }
    if (request.action === 'download' && (source || state.status !== 'available'))
      throw Error('Check for an available installed-app update first.');
    if (!['check', 'download', 'install', 'configure'].includes(request.action)) throw Error('Unknown update action.');
    pending = Promise.resolve().then(async () => {
      try {
        if (request.action === 'install') {
          await prepareRecovery();
          if (busy()) throw Error('Work started while recovery was being prepared. Stop it before installing.');
          set({ status: 'installing', error: '' });
          setImmediate(() => {
            try {
              updater.quitAndInstall(false, true);
            } catch (error) {
              installFailure(error);
            }
          });
        } else if (request.action === 'download') {
          set({ status: 'downloading', percent: 0, error: '' });
          await updater.downloadUpdate();
        } else if (request.action === 'check' && source) {
          set({ status: 'checking', error: '' });
          const release = await fetchRelease();
          set({
            status: newer(release.tag_name, version) ? 'source-available' : 'source',
            version: String(release.tag_name || '').replace(/^v/, ''),
            url: 'https://github.com/springycape20/atlas-desktop/releases/latest',
          });
        } else if (request.action === 'check') await updater.checkForUpdates();
        if (!source && state.status === 'available' && (await readPreferences()).autoDownloadUpdates === true) {
          set({ status: 'downloading', percent: 0, error: '' });
          await updater.downloadUpdate();
        }
      } catch (error) {
        if (request.action === 'install') throw installFailure(error);
        set({ status: 'error', error: readable(error) });
      } finally {
        pending = null;
      }
      return { ...state };
    });
    return pending;
  }
  return { action };
}
function readable(error) {
  return (
    'Update check/download failed. ' +
    errorMessage(error, 'No error details were returned.') +
    ' Try again, or open GitHub Releases.'
  );
}
function errorMessage(error, fallback) {
  const message = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : '';
  return message.trim() && message.trim() !== '[object Object]' ? message.slice(0, 500) : fallback;
}
function newer(tag, current) {
  const parse = (v) =>
    /^v?(\d+)\.(\d+)\.(\d+)$/
      .exec(v || '')
      ?.slice(1)
      .map(Number);
  const a = parse(tag),
    b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
async function defaultFetch() {
  const response = await fetch('https://api.github.com/repos/springycape20/atlas-desktop/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('GitHub returned ' + response.status);
  return response.json();
}
module.exports = { createAppUpdates, newer };
