const { parentPort } = require('node:worker_threads');
parentPort.once('message', ({ directory, version, renderer }) => {
  try {
    const bytes = require('./local-backups').createBackup(directory, version, renderer, {
      progress: (value) => parentPort.postMessage({ progress: value }),
    });
    parentPort.postMessage({ bytes });
  } catch (error) {
    parentPort.postMessage({ error: { message: error.message, code: error.code } });
  }
  parentPort.close();
});
