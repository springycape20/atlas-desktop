const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}
class WhisperService {
  constructor(executable) {
    this.executable = executable;
    this.queue = Promise.resolve();
    this.waiting = 0;
    this.closed = false;
  }
  transcribe(wav, model) {
    if (this.closed) return Promise.reject(Error('Speech service is closed.'));
    if (this.waiting >= 4) return Promise.reject(Error('Speech recognition is busy. Please try again.'));
    this.waiting++;
    const operation = this.queue
      .then(async () => {
        if (this.closed) throw Error('Speech service is closed.');
        try {
          await this.ensureModel(model);
          const form = new FormData();
          form.append('file', new Blob([wav], { type: 'audio/wav' }), 'recording.wav');
          form.append('response_format', 'json');
          form.append('language', 'en');
          const response = await fetch(this.url + '/inference', {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(120000),
          });
          if (!response.ok) throw Error('Speech recognition failed: HTTP ' + response.status);
          const result = await response.json();
          if (typeof result.text !== 'string') throw Error('Invalid speech recognition response.');
          return result.text.trim();
        } catch (error) {
          await this.stopChild();
          throw error;
        }
      })
      .finally(() => {
        this.waiting--;
      });
    this.queue = operation.catch(() => {});
    return operation;
  }
  async ensureModel(model) {
    if (this.child && this.model === model && this.child.exitCode === null && !this.child.killed) return;
    await this.stopChild();
    if (this.closed) throw Error('Speech service is closed.');
    const port = await freePort(),
      route = '/' + randomUUID();
    if (this.closed) throw Error('Speech service is closed.');
    this.url = `http://127.0.0.1:${port}${route}`;
    const child = spawn(
      this.executable,
      [
        '-m',
        model,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--request-path',
        route,
        '-t',
        String(Math.min(8, Math.max(2, os.cpus().length - 1))),
        '-bs',
        '1',
        '-nt',
        '-l',
        'en',
        '--prompt',
        'Natural spoken English. Common product names include ATLAS, Claude Code, Codex, and ChatGPT.',
      ],
      { cwd: path.dirname(this.executable), windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.child = child;
    this.model = model;
    let error,
      log = '';
    child.stdout.on('data', () => {});
    child.stderr.on('data', (part) => {
      log = (log + part).slice(-2000);
    });
    child.on('error', (value) => {
      error = value;
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if (this.closed || child.killed) throw Error('Speech service stopped.');
      if (error) throw error;
      if (child.exitCode !== null) throw Error('Speech engine stopped: ' + log);
      try {
        const response = await fetch(this.url + '/health', { signal: AbortSignal.timeout(500) });
        if (response.ok && (await response.json()).status === 'ok') return;
      } catch {}
      await delay(100);
    }
    throw Error('Speech model took too long to load.');
  }
  async stopChild() {
    const child = this.child;
    this.child = null;
    this.model = null;
    if (!child || child.exitCode !== null) return;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
  }
  async close() {
    this.closed = true;
    await this.stopChild();
  }
}
module.exports = { WhisperService };
