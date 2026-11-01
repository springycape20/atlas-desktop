const fs = require('node:fs/promises');
const { readFileSync, renameSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
// Returns undefined for no file, { value } for a good one, or { damaged: path } after moving a bad one
// aside so the next save cannot overwrite it. Other read errors, such as a locked file, are thrown: an
// empty result would let the next save replace records that are still there.
function readStored(file, valid = () => true) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    const value = JSON.parse(text);
    if (valid(value)) return { value };
  } catch {}
  const damaged = `${file}.damaged-${Date.now()}`;
  renameSync(file, damaged);
  return { damaged };
}
function createAtomicStore(file) {
  let pending,
    running = null,
    failure = null;
  async function drain() {
    while (pending !== undefined) {
      const text = pending;
      pending = undefined;
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
      running = Promise.resolve()
        .then(drain)
        .finally(() => {
          running = null;
        });
      // Callers can await errors; background saves must not become unhandled rejections.
      running.catch((error) => console.error('Could not save ' + path.basename(file), error.message));
    }
    return running;
  }
  async function flush() {
    if (running) await running;
    if (failure) throw failure;
  }
  return { save, flush };
}
module.exports = { createAtomicStore, readStored };
