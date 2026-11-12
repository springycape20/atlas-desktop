const path = require('node:path');
function createBackupClient({ Worker = require('node:worker_threads').Worker } = {}) {
  let active,
    disposed = false,
    state = { running: false, phase: 'idle', files: 0, bytes: 0 };
  function create(directory, version, renderer) {
    if (disposed) return Promise.reject(Error('Backup service is closed.'));
    if (active) return Promise.reject(Error('Another backup is already in progress.'));
    const worker = new Worker(path.join(__dirname, 'backup-worker.cjs'));
    state = { running: true, phase: 'collecting', files: 0, bytes: 0, startedAt: Date.now() };
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error, bytes) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        active = null;
        state = {
          ...state,
          running: false,
          phase: error ? 'failed' : 'complete',
          endedAt: Date.now(),
          error: error?.message || '',
        };
        void worker.terminate();
        if (error) reject(error);
        else resolve(Buffer.from(bytes));
      };
      const timer = setTimeout(() => finish(Error('Backup exceeded the five-minute time limit.')), 300000).unref();
      active = { cancel: () => finish(Error('Backup cancelled.')) };
      worker.on('message', (message) => {
        if (done) return;
        if (message.progress) state = { ...state, ...message.progress, running: true };
        else if (message.error) finish(Object.assign(Error(message.error.message), { code: message.error.code }));
        else if (message.bytes) finish(null, message.bytes);
      });
      worker.once('error', finish);
      worker.once('exit', (code) => {
        if (!done) finish(Error('Backup worker exited before completion (' + code + ').'));
      });
      try {
        worker.postMessage({ directory, version, renderer });
      } catch (error) {
        finish(error);
      }
    });
  }
  return {
    create,
    status: () => ({ ...state }),
    cancel: () => active?.cancel(),
    dispose: () => {
      disposed = true;
      active?.cancel();
    },
  };
}
module.exports = { createBackupClient };
