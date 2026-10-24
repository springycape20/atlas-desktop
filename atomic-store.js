const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
function createAtomicStore(file) {
  let pending, running = null, failure = null;
  async function drain() {
    while (pending !== undefined) {
      const text = pending; pending = undefined;
      const temp = `${file}.${randomUUID()}.tmp`;
      try {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(temp, text, 'utf8');
        await fs.rename(temp, file);
        failure = null;
      } catch (error) {
        failure = error;
        await fs.unlink(temp).catch(() => {});
        throw error;
      }
    }
  }
  function save(value) {
    pending = JSON.stringify(value);
    if (!running) {
      running = Promise.resolve().then(drain).finally(() => { running = null; });
      // Callers can await errors; background saves must not become unhandled rejections.
      running.catch(error => console.error('Could not save ' + path.basename(file), error.message));
    }
    return running;
  }
  async function flush() { if (running) await running; if (failure) throw failure; }
  return { save, flush };
}
module.exports = { createAtomicStore };
