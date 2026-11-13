const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

test('task screens share one IPC listener and independently unsubscribe', () => {
  const ipcRenderer = new EventEmitter();
  ipcRenderer.invoke = async () => {};
  let api;
  vm.runInNewContext(fs.readFileSync(require.resolve('../preload.js'), 'utf8'), {
    require: () => ({
      ipcRenderer,
      contextBridge: { exposeInMainWorld: (_name, value) => (api = value) },
      webUtils: {},
    }),
  });
  const received = Array(20).fill(0);
  const off = received.map((_, index) => api.onJobs(() => received[index]++));
  assert.equal(ipcRenderer.listenerCount('atlas:jobs-changed'), 1);
  ipcRenderer.emit('atlas:jobs-changed', {}, { upsert: [] });
  assert.deepEqual(received, Array(20).fill(1));
  off[0]();
  off[0]();
  ipcRenderer.emit('atlas:jobs-changed', {}, { upsert: [] });
  assert.deepEqual(received, [1, ...Array(19).fill(2)]);
  off.forEach((unsubscribe) => unsubscribe());
  assert.equal(ipcRenderer.listenerCount('atlas:jobs-changed'), 0);
  const again = api.onJobs(() => received[0]++);
  ipcRenderer.emit('atlas:jobs-changed', {}, {});
  assert.equal(received[0], 2);
  again();
  assert.equal(ipcRenderer.listenerCount('atlas:jobs-changed'), 0);
});
