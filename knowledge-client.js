const { Worker } = require('node:worker_threads');
const path = require('node:path');
class KnowledgeClient {
  constructor() {
    this.pending = new Map();
    this.next = 0;
  }
  search(cwd, query, options, action = 'search') {
    clearTimeout(this.idle);
    if (!this.worker) {
      const worker = (this.worker = new Worker(path.join(__dirname, 'knowledge-worker.cjs')));
      worker.on('message', ({ id, value, error }) => {
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        error ? pending.reject(Error(error)) : pending.resolve(value);
        if (!this.pending.size) this.idle = setTimeout(() => this.close(), 120000).unref();
      });
      worker.on('error', (error) => this.close(error));
      worker.on('exit', () => {
        if (this.worker === worker) this.close(Error('Project index worker stopped.'));
      });
    }
    return new Promise((resolve, reject) => {
      const id = ++this.next;
      const timer = setTimeout(() => this.close(Error('Project index timed out.')), 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, cwd, query: String(query).slice(0, 20000), options, action });
    });
  }
  analyze(cwd, options) {
    return this.search(cwd, '', options, 'analyze');
  }
  close(error = Error('Project index closed.')) {
    clearTimeout(this.idle);
    const worker = this.worker;
    this.worker = null;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
    void worker?.terminate();
  }
}
module.exports = { KnowledgeClient };
