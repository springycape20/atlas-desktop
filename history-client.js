const { Worker } = require('node:worker_threads');
const path = require('node:path');
class HistoryClient {
  constructor(workerData) { this.workerData = workerData; this.pending = new Map(); this.counter = 0; }
  request(method, args) {
    if (!this.worker) {
      const worker = new Worker(path.join(__dirname, 'history-worker.cjs'), { workerData: this.workerData });
      this.worker = worker;
      const fail = error => {
        if (this.worker !== worker) return;
        this.worker = null;
        for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
        this.pending.clear(); void worker.terminate();
      };
      worker.on('message', result => {
        const p = this.pending.get(result.id); if (!p) return;
        clearTimeout(p.timer); this.pending.delete(result.id);
        result.error ? p.reject(Error(result.error)) : p.resolve(result.value);
      });
      worker.on('error', fail); worker.on('exit', () => fail(Error('History worker stopped.')));
      this.fail = fail;
    }
    return new Promise((resolve, reject) => {
      const id = ++this.counter;
      const timer = setTimeout(() => this.fail(Error('History operation timed out.')), 60000);
      this.pending.set(id, { resolve, reject, timer }); this.worker.postMessage({ id, method, args });
    });
  }
  close() { if (this.worker) this.fail(Error('ATLAS closed.')); }
}
module.exports = { HistoryClient };
