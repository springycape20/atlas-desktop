const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createAtomicStore } = require('../atomic-store');
const { HistoryClient } = require('../history-client');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-perf-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir;
}

test('atomic saves coalesce bursts and flush the final snapshot', async t => {
  const dir = await temporary(t), file = path.join(dir, 'data.json');
  const store = createAtomicStore(file);
  const saves = [];
  for (let i = 0; i < 100; i++) saves.push(store.save({ value: i }));
  await Promise.all(saves); await store.flush();
  assert.deepEqual(JSON.parse(await fs.readFile(file)), { value: 99 });
  await store.save({ value: 100 }); await store.flush();
  assert.deepEqual(JSON.parse(await fs.readFile(file)), { value: 100 });
  assert.deepEqual(await fs.readdir(dir), ['data.json']);
});

test('assistant and provider state survives asynchronous save/flush', async t => {
  const dir = await temporary(t);
  const { createService } = require('../assistant-service');
  const { ProviderHealth } = require('../provider-health');
  const service = createService({ directory: dir, notify() {} });
  service.memory('save', { text: 'Prefer concise replies' });
  service.reminder('save', { title: 'Review', dueAt: Date.now() + 60000 });
  const health = new ProviderHealth(path.join(dir, 'health.json'));
  health.limited('codex', Error('retry in 5 minutes'));
  await Promise.all([service.flush(), health.flush()]);
  const restored = createService({ directory: dir, notify() {} });
  assert.equal(restored.memory('list')[0].text, 'Prefer concise replies');
  assert.equal(restored.reminder('list')[0].title, 'Review');
  assert.equal(new ProviderHealth(path.join(dir, 'health.json')).available('codex'), false);
  health.clear('codex'); await health.flush();
  assert.equal(new ProviderHealth(path.join(dir, 'health.json')).available('codex'), true);
});

test('history worker lists, searches and invalidates cached/compressed transcripts', async t => {
  const dir = await temporary(t), sessions = path.join(dir, '.codex', 'sessions');
  await fs.mkdir(sessions, { recursive: true });
  const file = path.join(sessions, 'example.jsonl');
  const transcript = text => [
    { type: 'session_meta', payload: { id: 'session-example', cwd: dir } },
    { type: 'response_item', payload: { role: 'user', content: text } },
    { type: 'response_item', payload: { role: 'assistant', phase: 'final_answer', content: 'Use the worker cache.' } }
  ].map(value => JSON.stringify(value)).join('\n');
  await fs.writeFile(file, transcript('Find the atlas performance discussion'));
  const client = new HistoryClient({ home: dir }); t.after(() => client.close());
  const list = await client.request('list', { provider: 'codex' });
  assert.equal(list.length, 1);
  const request = { provider: 'codex', id: list[0].id };
  assert.equal((await client.request('read', request)).turns.length, 2);
  assert.equal((await client.request('search', { prompt: 'find atlas performance' })).length, 1);
  await fs.writeFile(file, transcript('Changed conversation title and a longer message'));
  assert.match((await client.request('read', request)).title, /^Changed/);
  const zlib = require('node:zlib');
  if (zlib.zstdCompressSync) {
    await fs.writeFile(file + '.zst', zlib.zstdCompressSync(Buffer.from(transcript('Compressed conversation'))));
    assert.equal((await client.request('list', { provider: 'codex' })).length, 2);
  }
  await assert.rejects(client.request('read', { provider: 'codex', id: '../escape' }), /Invalid/);
  await fs.unlink(file);
  await assert.rejects(client.request('read', request), /could not be found/);
});

test('speech cancellation skips queued jobs and suppresses an in-flight result', async () => {
  const source = await fs.readFile(path.join(root, 'voice-worker.cjs'), 'utf8');
  let onMessage, release; const generated = [], results = [];
  const fakeTts = { async generate(text) {
    generated.push(text);
    if (text === 'old active') await new Promise(resolve => { release = resolve; });
    return { toWav: () => Buffer.from(text) };
  } };
  const context = vm.createContext({ Buffer, fakeTts, console, require(name) {
    if (name === 'node:worker_threads') return { workerData: { userData: '' }, parentPort: { on(event, listener) { onMessage = listener; }, postMessage(value) { results.push(value); } } };
    return require(name);
  } });
  vm.runInContext(source + '\nruntime = Promise.resolve(fakeTts);', context);
  onMessage({ id: 1, voice: 'bm_george', text: 'old active' }); await tick();
  onMessage({ id: 2, voice: 'bm_george', text: 'old queued' });
  onMessage({ type: 'cancel', ids: [1, 2] });
  onMessage({ id: 3, voice: 'bm_george', text: 'new reply' }); release(); await tick();
  assert.deepEqual(generated, ['old active', 'new reply']);
  assert.deepEqual(results.map(value => value.id), [3]);
  onMessage({ id: 4, voice: 'bm_george', text: 'new reply' }); await tick();
  assert.equal(generated.length, 2, 'short replies retain the warm cache');
});

async function mainHarness(t) {
  const dir = await temporary(t), events = new Map(), updates = [];
  let finished; const quit = new Promise(resolve => { finished = resolve; });
  const localRequire = createRequire(path.join(root, 'main.js'));
  const electron = {
    app: { on: (name, fn) => events.set(name, fn), whenReady: () => ({ then() {} }), getPath: () => dir, setPath() {}, setAppUserModelId() {}, quit: () => finished() },
    protocol: { registerSchemesAsPrivileged() {} }
  };
  const context = vm.createContext({ console, Buffer, process, URL, setTimeout, clearTimeout, setInterval, clearInterval, structuredClone,
    __dirname: root, require: name => name === 'electron' ? electron : localRequire(name), updates });
  const code = await fs.readFile(path.join(root, 'main.js'), 'utf8');
  vm.runInContext(code + `
    mainWindow = { isDestroyed: () => false, webContents: { send: (_event, patch) => updates.push(patch) } };
    assistantService = require('./assistant-service').createService({ directory: app.getPath('userData'), notify() {} });
    globalThis.harness = { activeJobs, jobSnapshots, emitJobs, writeAtlasHistory, readAtlasHistory, assistantService, persistJobs };
  `, context);
  return { ...context.harness, updates, events, quit, dir };
}

test('job retention preserves active/paused jobs and IPC emits only changes', async t => {
  const h = await mainHarness(t);
  for (let i = 0; i < 60; i++) h.activeJobs.set('done' + i, { id: 'done' + i, status: 'completed' });
  h.activeJobs.set('active', { id: 'active', status: 'running' });
  h.activeJobs.set('paused', { id: 'paused', status: 'paused' });
  assert.equal(h.jobSnapshots().length, 42); assert.equal(h.activeJobs.size, 42);
  h.emitJobs(); h.emitJobs(); await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(h.updates.length, 1); assert.equal(h.updates[0].upsert.length, 42);
  h.activeJobs.get('active').statusText = 'Working'; h.emitJobs();
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(h.updates[1].upsert.length, 1); assert.equal(h.updates[1].upsert[0].id, 'active');
  h.emitJobs(); await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(h.updates.length, 2);
  h.activeJobs.set('new', { id: 'new', status: 'completed' }); h.emitJobs();
  await new Promise(resolve => setTimeout(resolve, 90));
  assert.equal(h.updates[2].removed[0], 'done20');
});

test('concurrent conversation saves merge and cached reads are isolated', async t => {
  const h = await mainHarness(t);
  await Promise.all(['one', 'two'].map(id => h.writeAtlasHistory([{ id, turns: [{ role: 'user', content: id }] }])));
  const history = await h.readAtlasHistory(); assert.equal(history.length, 2);
  history[0].turns[0].content = 'unsaved';
  assert.notEqual((await h.readAtlasHistory())[0].turns[0].content, 'unsaved');
});

test('shutdown waits for finishing jobs and flushes their latest state', async t => {
  const h = await mainHarness(t);
  const job = { id: 'shutdown-job', status: 'running' };
  let finish;
  job.promise = new Promise(resolve => { finish = resolve; }).then(() => {
    job.status = 'paused'; h.persistJobs();
  });
  job.interrupt = () => setTimeout(finish, 20);
  h.activeJobs.set(job.id, job);
  h.assistantService.memory('save', { text: 'Persist on exit' });
  let prevented = false;
  h.events.get('before-quit')({ preventDefault() { prevented = true; } });
  await h.quit;
  assert.equal(prevented, true);
  const saved = JSON.parse(await fs.readFile(path.join(h.dir, 'assistant-data.json')));
  assert.equal(saved.jobs[0].status, 'paused');
  assert.equal(saved.memories[0].text, 'Persist on exit');
});
