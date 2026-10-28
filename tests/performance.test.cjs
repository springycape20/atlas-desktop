const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createAtomicStore } = require('../atomic-store');
const { HistoryClient } = require('../history-client');
const { mainHarness } = require('./fixtures/main-harness.cjs');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-perf-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('atomic saves coalesce bursts and flush the final snapshot', async (t) => {
  const dir = await temporary(t),
    file = path.join(dir, 'data.json');
  const store = createAtomicStore(file);
  const saves = [];
  for (let i = 0; i < 100; i++) saves.push(store.save({ value: i }));
  await Promise.all(saves);
  await store.flush();
  assert.deepEqual(JSON.parse(await fs.readFile(file)), { value: 99 });
  await store.save({ value: 100 });
  await store.flush();
  assert.deepEqual(JSON.parse(await fs.readFile(file)), { value: 100 });
  assert.deepEqual(await fs.readdir(dir), ['data.json']);
});

test('assistant and provider state survives asynchronous save/flush', async (t) => {
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
  health.clear('codex');
  await health.flush();
  assert.equal(new ProviderHealth(path.join(dir, 'health.json')).available('codex'), true);
});

test('history worker lists, searches and invalidates cached/compressed transcripts', async (t) => {
  const dir = await temporary(t),
    sessions = path.join(dir, '.codex', 'sessions');
  await fs.mkdir(sessions, { recursive: true });
  const file = path.join(sessions, 'example.jsonl');
  const transcript = (text) =>
    [
      { type: 'session_meta', payload: { id: 'session-example', cwd: dir } },
      { type: 'response_item', payload: { role: 'user', content: text } },
      {
        type: 'response_item',
        payload: { role: 'assistant', phase: 'final_answer', content: 'Use the worker cache.' },
      },
    ]
      .map((value) => JSON.stringify(value))
      .join('\n');
  await fs.writeFile(file, transcript('Find the atlas performance discussion'));
  const client = new HistoryClient({ home: dir });
  t.after(() => client.close());
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

test('migration finds original package data despite the new product name', async (t) => {
  const h = await mainHarness(t);
  const legacy = path.join(h.paths.appData, 'atlas-local-desktop');
  await fs.mkdir(legacy, { recursive: true });
  await fs.mkdir(h.paths.userData, { recursive: true });
  await fs.writeFile(path.join(legacy, 'settings.json'), '{"codexModel":"saved-model"}');
  await fs.writeFile(path.join(legacy, 'conversations.json'), '[{"id":"saved-chat","turns":[]}]');
  await fs.writeFile(path.join(h.paths.userData, 'settings.json'), '{"codexModel":"new-model"}');
  await h.migrateLegacyUserData();
  assert.equal(JSON.parse(await fs.readFile(path.join(h.paths.userData, 'settings.json'))).codexModel, 'new-model');
  assert.equal(JSON.parse(await fs.readFile(path.join(h.paths.userData, 'conversations.json')))[0].id, 'saved-chat');
});

test('model catalog initializes a fresh connection before requesting models', async (t) => {
  let connected = false;
  class ColdConnection {
    async connect() {
      connected = true;
    }
    async request(method) {
      assert.equal(connected, true, 'catalog requires an initialized app-server');
      assert.equal(method, 'model/list');
      return { data: [{ id: 'available-model', displayName: 'Available model' }] };
    }
  }
  const h = await mainHarness(t, { modules: { './codex-connection': { CodexConnection: ColdConnection } } });
  h.setupIpc();
  const models = await h.handlers.get('atlas:model-catalog')(
    { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    'codex',
  );
  assert.equal(models.length, 1);
  assert.equal(models[0].id, 'available-model');
});

test('job retention preserves active/paused jobs and IPC emits only changes', async (t) => {
  const h = await mainHarness(t);
  for (let i = 0; i < 60; i++) h.activeJobs.set('done' + i, { id: 'done' + i, status: 'completed' });
  h.activeJobs.set('active', { id: 'active', status: 'running' });
  h.activeJobs.set('paused', { id: 'paused', status: 'paused' });
  assert.equal(h.jobSnapshots().length, 42);
  assert.equal(h.activeJobs.size, 42);
  h.emitJobs();
  h.emitJobs();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].upsert.length, 42);
  h.activeJobs.get('active').statusText = 'Working';
  h.emitJobs();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(h.updates[1].upsert.length, 1);
  assert.equal(h.updates[1].upsert[0].id, 'active');
  h.emitJobs();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(h.updates.length, 2);
  h.activeJobs.set('new', { id: 'new', status: 'completed' });
  h.emitJobs();
  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(h.updates[2].removed[0], 'done20');
});

test('concurrent conversation saves merge and cached reads are isolated', async (t) => {
  const h = await mainHarness(t);
  await Promise.all(['one', 'two'].map((id) => h.writeAtlasHistory([{ id, turns: [{ role: 'user', content: id }] }])));
  const history = await h.readAtlasHistory();
  assert.equal(history.length, 2);
  history[0].turns[0].content = 'unsaved';
  assert.notEqual((await h.readAtlasHistory())[0].turns[0].content, 'unsaved');
});

test('imported history persists provenance, deduplicates after saves and supplies follow-up context', async (t) => {
  const source = {
    id: 'c'.repeat(64),
    provider: 'codex',
    sessionId: 'original-client-session',
    title: 'Imported project plan',
    turns: [
      { role: 'user', content: 'The project uses SQLite and a blue interface.' },
      { role: 'assistant', content: 'I will use that plan.' },
    ],
  };
  let sent;
  class FakeHistory {
    async request(method) {
      if (method === 'read') return source;
      return [];
    }
    close() {}
  }
  class FakeCodex {
    async run(request) {
      sent = request;
      return { output: 'Continued the imported plan.', sessionId: 'new-atlas-session' };
    }
  }
  const h = await mainHarness(t, {
    modules: {
      './history-client': { HistoryClient: FakeHistory },
      './codex-connection': { CodexConnection: FakeCodex },
    },
  });
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    request = { action: 'import', chats: [{ provider: 'codex', id: source.id }] };
  const imported = await h.handlers.get('atlas:history-import')(event, request),
    id = imported.chats[0].id;
  await h.handlers.get('atlas:chat')(event, {
    requestId: 'import-followup',
    conversationId: id,
    prompt: 'Use Codex to continue that plan.',
    cwd: h.dir,
  });
  assert.match(sent.prompt, /SQLite and a blue interface/);
  assert.equal(sent.sessionId, '');
  const saved = (await h.readAtlasHistory()).find((chat) => chat.id === id);
  assert.equal(saved.importSource.sessionId, 'original-client-session');
  assert.equal(saved.sessions.codex, 'new-atlas-session');
  assert.equal(saved.turns.length, 4);
  const again = await h.handlers.get('atlas:history-import')(event, request);
  assert.equal(again.skipped, 1);
  assert.equal((await h.readAtlasHistory())[0].turns.length, 4);
  const disk = JSON.parse(await fs.readFile(path.join(h.paths.userData, 'conversations.json'), 'utf8'));
  assert.equal(disk[0].importSource.provider, 'codex');
});

test('shutdown waits for finishing jobs and flushes their latest state', async (t) => {
  const h = await mainHarness(t);
  const job = { id: 'shutdown-job', status: 'running' };
  let finish;
  job.promise = new Promise((resolve) => {
    finish = resolve;
  }).then(() => {
    job.status = 'paused';
    h.persistJobs();
  });
  job.interrupt = () => setTimeout(finish, 20);
  h.activeJobs.set(job.id, job);
  h.assistantService.memory('save', { text: 'Persist on exit' });
  let prevented = false;
  h.events.get('before-quit')({
    preventDefault() {
      prevented = true;
    },
  });
  await h.quit;
  assert.equal(prevented, true);
  const saved = JSON.parse(await fs.readFile(path.join(h.paths.userData, 'assistant-data.json')));
  assert.equal(saved.jobs[0].status, 'paused');
  assert.equal(saved.memories[0].text, 'Persist on exit');
});

test('saved task budgets include active runtime but exclude offline time', async (t) => {
  const h = await mainHarness(t);
  h.activeJobs.set('budget', {
    id: 'budget',
    status: 'running',
    budget: { usedMs: 2000, runStartedAt: Date.now() - 1000, maxRuntimeSeconds: 60 },
    checkpoints: [{ provider: 'codex', output: 'done' }],
  });
  const saved = h.jobSnapshots()[0];
  assert.ok(saved.budget.usedMs >= 3000 && saved.budget.usedMs < 5000);
  assert.equal(saved.budget.runStartedAt, null);
  assert.equal(saved.checkpoints[0].output, 'done');
  h.activeJobs.set('budget', { ...saved, status: 'paused' });
  assert.equal(h.jobSnapshots()[0].budget.usedMs, saved.budget.usedMs);
});

test('old task budgets do not block resuming and Colab-to-Assistant resumes are rejected', async (t) => {
  const h = await mainHarness(t);
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  h.activeJobs.set('spent', { id: 'spent', status: 'paused', budget: { usedMs: 60000, maxRuntimeSeconds: 60 } });
  await assert.rejects(
    h.handlers.get('atlas:chat')(event, { requestId: 'retry', resumeJobId: 'spent', maxRuntimeSeconds: 60 }),
    /Enter a prompt/,
  );
  assert.equal(h.activeJobs.get('retry').budget.maxRuntimeSeconds, null);
  h.activeJobs.set('colab', { id: 'colab', status: 'paused', collaboration: true });
  await assert.rejects(
    h.handlers.get('atlas:chat')(event, { requestId: 'wrong-mode', resumeJobId: 'colab' }),
    /open its Colab chat/,
  );
});

test('request timeout defaults and legacy settings migrate to unlimited', async (t) => {
  const h = await mainHarness(t);
  assert.equal((await h.readAppSettings()).timeoutSeconds, 0);
  await fs.mkdir(h.paths.userData, { recursive: true });
  const file = path.join(h.paths.userData, 'settings.json');
  await fs.writeFile(file, JSON.stringify({ timeoutSeconds: 180 }));
  assert.equal((await h.readAppSettings()).timeoutSeconds, 0);
  await fs.writeFile(file, JSON.stringify({ timeoutSeconds: 60, timeoutPolicyVersion: 1 }));
  assert.equal((await h.readAppSettings()).timeoutSeconds, 60);
});

test('saved Assistant turns keep attachment references without storing image bytes', async (t) => {
  const h = await mainHarness(t);
  await h.writeAtlasHistory([
    {
      id: 'photo-chat',
      turns: [
        {
          role: 'user',
          content: 'Inspect this photo',
          attachments: [
            {
              id: 'photo1',
              name: 'Screenshot.png',
              type: 'image',
              size: 123,
              preview: 'data:image/png;base64,private',
              bytes: [1, 2, 3],
            },
          ],
        },
        { role: 'user', content: 'Next question' },
      ],
    },
  ]);
  const data = JSON.parse(await fs.readFile(path.join(h.paths.userData, 'conversations.json')));
  assert.deepEqual(data[0].turns[0].attachments, [{ id: 'photo1', name: 'Screenshot.png', type: 'image', size: 123 }]);
  assert.deepEqual(data[0].turns[1].attachments, []);
  assert(!JSON.stringify(data).includes('base64'));
});

test('Assistant effort overrides the project, respects default, and survives resume', async (t) => {
  const received = [];
  class FakeCodex {
    async run({ settings }) {
      received.push(settings.effort);
      return { output: 'Verified effort routing.', sessionId: 'test-session' };
    }
  }
  const h = await mainHarness(t, { modules: { './codex-connection': { CodexConnection: FakeCodex } } });
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const profile = await h.handlers.get('atlas:projects')(event, {
    action: 'save',
    profile: { name: 'Test', cwd: h.dir, effort: 'high' },
  });
  const send = (id, extra) =>
    h.handlers.get('atlas:chat')(event, {
      requestId: id,
      prompt: 'Use Codex to check effort routing.',
      cwd: h.dir,
      profileId: profile.id,
      ...extra,
    });
  await send('override', { effort: 'low' });
  assert.equal(received.at(-1), 'low');
  assert.equal(h.activeJobs.get('override').request.effort, 'low');
  await send('default', { effort: '' });
  assert.equal(received.at(-1), 'high');
  h.activeJobs.set('paused-effort', {
    id: 'paused-effort',
    status: 'paused',
    provider: 'codex',
    request: { profileId: profile.id, attachments: [], effort: 'max' },
  });
  await send('resume', { resumeJobId: 'paused-effort' });
  assert.equal(received.at(-1), 'max');
  await send('reset', { resumeJobId: 'paused-effort', effort: '' });
  assert.equal(received.at(-1), 'high');
  const calls = received.length;
  await assert.rejects(send('invalid', { effort: 'unsupported' }), /supported effort/);
  assert.equal(received.length, calls);
});

test('preload forwards the Assistant effort as a string through IPC', async () => {
  let api, last;
  vm.runInNewContext(await fs.readFile(path.join(root, 'preload.js'), 'utf8'), {
    require: () => ({
      contextBridge: { exposeInMainWorld: (_name, value) => (api = value) },
      ipcRenderer: {
        invoke: (channel, payload) => {
          last = { channel, payload };
        },
      },
      webUtils: {},
    }),
  });
  api.chat({ prompt: 'Test', effort: 'max' });
  assert.equal(last.channel, 'atlas:chat');
  assert.equal(last.payload.effort, 'max');
  api.chat({ effort: { invalid: true } });
  assert.equal(last.payload.effort, undefined);
});

test('provider usage IPC requires the trusted app window', async (t) => {
  let reads = 0;
  const h = await mainHarness(t, {
    modules: {
      './provider-usage': {
        createProviderUsage: () => ({
          read: async () => {
            reads++;
            return { codex: { remainingPercent: 34 }, claude: { remainingPercent: 0 } };
          },
        }),
      },
    },
  });
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const read = h.handlers.get('atlas:provider-usage');
  await assert.rejects(read({ sender: {}, senderFrame: event.senderFrame }, {}), /Untrusted/);
  assert.equal(reads, 0);
  assert.equal((await read(event, {})).codex.remainingPercent, 34);
  assert.equal(reads, 1);
  await assert.rejects(h.handlers.get('atlas:provider-usage-open')(event, 'invalid'), /Choose Codex or Claude/);
});

test('Assistant starts the change snapshot before provider edits and exposes actual line counts', async (t) => {
  class EditingCodex {
    async run({ cwd }) {
      await fs.writeFile(path.join(cwd, 'app.js'), 'after\nnew line\n');
      return { output: 'Updated the file.', sessionId: 'test-session' };
    }
  }
  const h = await mainHarness(t, { modules: { './codex-connection': { CodexConnection: EditingCodex } } });
  h.setupIpc();
  await fs.writeFile(path.join(h.dir, 'app.js'), 'before\n');
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  await h.handlers.get('atlas:chat')(event, {
    requestId: 'changed-task',
    prompt: 'Use Codex to fix the file.',
    cwd: h.dir,
  });
  const report = await h.handlers.get('atlas:changes')(event, { jobId: 'changed-task' });
  assert.equal(report.ready, true);
  assert.equal(report.added, 2);
  assert.equal(report.removed, 1);
  assert.equal(report.files.length, 1);
  assert.equal(report.files[0].path, 'app.js');
  assert.equal(report.canEdit, true);
});

test('Assistant completion checks persist real results and checkpoint recovery is available through IPC', async (t) => {
  class EditingCodex {
    async run({ cwd }) {
      await fs.writeFile(path.join(cwd, 'app.js'), 'agent update\n');
      return { output: 'Updated.', sessionId: 'session' };
    }
  }
  const h = await mainHarness(t, { modules: { './codex-connection': { CodexConnection: EditingCodex } } });
  h.setupIpc();
  const cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  await fs.writeFile(path.join(cwd, 'app.js'), 'before\n');
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    profile = await h.handlers.get('atlas:projects')(event, {
      action: 'save',
      profile: { name: 'Checks', cwd, autoCheck: true, checkCommands: 'exit 3' },
    });
  const result = await h.handlers.get('atlas:chat')(event, {
    requestId: 'checked-task',
    prompt: 'Use Codex to fix app.js',
    cwd,
    profileId: profile.id,
  });
  assert.equal(result.verification.status, 'failed');
  assert.equal(result.verification.results[0].exitCode, 3);
  assert.equal(h.jobSnapshots().find((j) => j.id === 'checked-task').verification.status, 'failed');
  const changes = h.handlers.get('atlas:changes'),
    preview = await changes(event, { jobId: 'checked-task', action: 'restore-preview' });
  assert.deepEqual([...preview.files], ['app.js']);
  await changes(event, { jobId: 'checked-task', action: 'restore', token: preview.token });
  assert.equal(await fs.readFile(path.join(cwd, 'app.js'), 'utf8'), 'before\n');
  const recovery = await changes(event, { jobId: 'checked-task', action: 'restore-preview', recovery: true });
  await changes(event, { jobId: 'checked-task', action: 'restore', recovery: true, token: recovery.token });
  assert.equal(await fs.readFile(path.join(cwd, 'app.js'), 'utf8'), 'agent update\n');
});

test('stopping during completion checks preserves cancelled status rather than reporting completion', async (t) => {
  let checking;
  const started = new Promise((resolve) => (checking = resolve));
  class FakeCodex {
    async run() {
      return { output: 'Finished editing.', sessionId: 'session' };
    }
  }
  const h = await mainHarness(t, {
    modules: {
      './codex-connection': { CodexConnection: FakeCodex },
      './project-tools': {
        completionChecks: async (_project, _cwd, { signal }) => {
          checking();
          await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
          return { status: 'cancelled', results: [] };
        },
      },
    },
  });
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    promise = h.handlers.get('atlas:chat')(event, {
      requestId: 'stop-checks',
      prompt: 'Use Codex to review the file.',
      cwd: h.dir,
    });
  await started;
  const rejected = assert.rejects(promise, /Task stopped/);
  await h.handlers.get('atlas:jobs')(event, { action: 'stop', id: 'stop-checks' });
  await rejected;
  assert.equal(h.activeJobs.get('stop-checks').status, 'cancelled');
  assert.equal(h.activeJobs.get('stop-checks').verification.status, 'cancelled');
});

test('Colab attention outcomes are preserved in saved jobs and skip completion commands', async (t) => {
  let checkRuns = 0;
  const h = await mainHarness(t, {
    modules: {
      './collaboration': {
        normalizePassLimit: require('../collaboration').normalizePassLimit,
        createCollaboration: () => async () => ({
          output: 'Review is stalled.',
          outcome: 'needs_attention',
          limitation: 'Same blocker repeated.',
          passes: 6,
          usage: { reported: false },
        }),
      },
      './project-tools': {
        completionChecks: async () => {
          checkRuns++;
          return { status: 'passed', results: [] };
        },
      },
    },
  });
  h.setupIpc();
  h.allowColab();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    started = await h.handlers.get('atlas:collab')(event, { task: 'Fix a file', cwd: h.dir, isolated: false });
  await h.activeJobs.get(started.id).promise;
  const job = h.activeJobs.get(started.id);
  assert.equal(job.status, 'needs_attention');
  assert.equal(job.result.outcome, 'needs_attention');
  assert.equal(job.verification.status, 'not-checked');
  assert.equal(checkRuns, 0);
  assert(
    h.updates.some((update) => update.outcome === 'needs_attention' && update.limitation === 'Same blocker repeated.'),
  );
});
test('imported full histories remain intact on disk after Assistant follow-ups', async (t) => {
  const source = {
    id: 'd'.repeat(64),
    provider: 'claude',
    sessionId: 'long-import',
    title: 'Full project history',
    turns: Array.from({ length: 122 }, (_, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: i === 0 ? 'First message ' + 'x'.repeat(16000) : 'Historical message ' + i,
    })),
  };
  let sent;
  class FakeHistory {
    async request() {
      return source;
    }
    close() {}
  }
  class FakeCodex {
    async run(request) {
      sent = request;
      return { output: 'Follow-up result', sessionId: 'new-session' };
    }
  }
  const h = await mainHarness(t, {
    modules: {
      './history-client': { HistoryClient: FakeHistory },
      './codex-connection': { CodexConnection: FakeCodex },
    },
  });
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const result = await h.handlers.get('atlas:history-import')(event, {
    action: 'import',
    destination: 'assistant',
    chats: [{ provider: 'claude', id: source.id }],
  });
  await h.handlers.get('atlas:chat')(event, {
    requestId: 'long-import-followup',
    conversationId: result.chats[0].id,
    prompt: 'Use Codex to continue.',
    cwd: h.dir,
  });
  const disk = JSON.parse(await fs.readFile(path.join(h.paths.userData, 'conversations.json'), 'utf8'))[0];
  assert.equal(disk.turns.length, 124);
  assert.equal(disk.turns[0].content, source.turns[0].content);
  assert.equal(disk.turns.at(-1).content, 'Follow-up result');
  assert(!sent.prompt.includes('First message'));
  assert(sent.prompt.includes('Historical message 121'));
});
test('a Colab task that failed before workspace setup can resume with explicit direct editing', async (t) => {
  let worktreeAttempts = 0,
    runs = 0;
  const h = await mainHarness(t, {
    modules: {
      './workspace-service': {
        createWorkspaceService: () => ({
          profile: async () => null,
          attachmentContext: async () => '',
          createWorktree: async () => {
            worktreeAttempts++;
            throw Error('Isolated work starts from a clean Git checkout.');
          },
          flush: async () => {},
        }),
      },
      './collaboration': {
        normalizePassLimit: require('../collaboration').normalizePassLimit,
        createCollaboration: () => async (request) => {
          runs++;
          assert.equal(request.isolated, false);
          return { output: 'Ready in direct mode', outcome: 'completed', usage: { reported: false } };
        },
      },
    },
  });
  h.setupIpc();
  h.allowColab();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const first = await h.handlers.get('atlas:collab')(event, {
    task: 'Continue the current project',
    cwd: h.dir,
    isolated: true,
  });
  await assert.rejects(h.activeJobs.get(first.id).promise, /clean Git checkout/);
  assert.equal(h.activeJobs.get(first.id).status, 'failed');
  const next = await h.handlers.get('atlas:collab')(event, { resumeJobId: first.id, isolated: false });
  await h.activeJobs.get(next.id).promise;
  assert.equal(h.activeJobs.get(next.id).status, 'completed');
  assert.equal(worktreeAttempts, 1);
  assert.equal(runs, 1);
});
test('Colab efficiency options, stage evidence and saved reports pass through trusted IPC', async (t) => {
  let options;
  const h = await mainHarness(t, {
    modules: {
      './collaboration': {
        normalizePassLimit: require('../collaboration').normalizePassLimit,
        createCollaboration: (hooks) => async (request) => {
          options = request;
          const checks = await hooks.verify();
          assert(checks.status);
          await fs.writeFile(path.join(request.cwd, 'efficiency-test.js'), 'changed\n');
          assert((await hooks.reviewContext(1000)).includes('efficiency-test.js'));
          const report = {
            provider: 'codex',
            phase: 'build',
            output: 'Short report',
            state: {},
            usage: { inputTokens: 1, outputTokens: 2 },
          };
          report.reportPath = await hooks.saveReport(report, 0, 'Complete saved report');
          await hooks.checkpoint([report]);
          return { output: 'Done', outcome: 'completed', usage: { reported: true, inputTokens: 1, outputTokens: 2 } };
        },
      },
    },
  });
  h.setupIpc();
  h.allowColab();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const result = await h.handlers.get('atlas:collab')(event, {
    task: 'Build efficiently',
    cwd: h.dir,
    isolated: false,
    preset: 'economy',
    tokenWarning: 5000,
    reuseChecks: true,
    adaptiveEffort: true,
    brief: { criteria: 'Works offline' },
    effort: 'high',
    codexModel: 'manual-codex',
  });
  await h.activeJobs.get(result.id).promise;
  assert.equal(options.preset, 'economy');
  assert.equal(options.tokenWarning, 5000);
  assert.equal(options.effort, 'high');
  assert.equal(options.codexModel, 'manual-codex');
  assert.equal(options.brief.criteria, 'Works offline');
  const report = await h.handlers.get('atlas:collab-report')(event, { id: result.id, index: 0 });
  assert.equal(report.output, 'Complete saved report');
  await assert.rejects(h.handlers.get('atlas:collab-report')({ sender: {} }, { id: result.id, index: 0 }), /Untrusted/);
  await assert.rejects(
    h.handlers.get('atlas:collab-report')(event, { id: result.id, index: -1 }),
    /no longer available/,
  );
});
test('Colab follow-ups reuse their active isolated checkout rather than creating a new folder', async (t) => {
  let creations = 0,
    runs = 0;
  const h = await mainHarness(t, {
    modules: {
      './workspace-service': {
        createWorkspaceService: () => ({
          profile: async () => null,
          attachmentContext: async () => '',
          createWorktree: async () => {
            creations++;
            const cwd = path.join(h.dir, 'isolated');
            await fs.mkdir(cwd, { recursive: true });
            return { id: 'kept-workspace', cwd, state: 'active' };
          },
          tree: async (id) => ({ id, cwd: path.join(h.dir, 'isolated'), state: 'active' }),
          flush: async () => {},
        }),
      },
      './collaboration': {
        normalizePassLimit: require('../collaboration').normalizePassLimit,
        createCollaboration: () => async (request) => {
          runs++;
          const file = path.join(request.cwd, 'earlier.txt');
          if (runs === 1) await fs.writeFile(file, 'Previous task changes');
          else assert.equal(await fs.readFile(file, 'utf8'), 'Previous task changes');
          return { output: 'Done', outcome: 'completed' };
        },
      },
    },
  });
  h.setupIpc();
  h.allowColab();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const first = await h.handlers.get('atlas:collab')(event, {
    task: 'First task',
    chatId: 'same-chat',
    cwd: h.dir,
    isolated: true,
  });
  await h.activeJobs.get(first.id).promise;
  const second = await h.handlers.get('atlas:collab')(event, {
    task: 'Follow up',
    chatId: 'same-chat',
    cwd: h.dir,
    isolated: true,
    workspaceId: 'kept-workspace',
  });
  await h.activeJobs.get(second.id).promise;
  assert.equal(creations, 1);
  assert.equal(runs, 2);
  assert.equal(h.activeJobs.get(second.id).workspaceId, 'kept-workspace');
});
test('concurrent Colab starts cannot both claim the same chat during asynchronous workspace lookup', async (t) => {
  const h = await mainHarness(t, {
    modules: {
      './workspace-service': {
        createWorkspaceService: () => ({
          profile: async () => null,
          attachmentContext: async () => '',
          createWorktree: async () => ({ id: 'tree', cwd: h.dir }),
          flush: async () => {},
        }),
      },
      './collaboration': {
        normalizePassLimit: require('../collaboration').normalizePassLimit,
        createCollaboration: () => async () => ({ output: 'Done', outcome: 'completed' }),
      },
    },
  });
  h.setupIpc();
  h.allowColab();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    request = { task: 'Build', chatId: 'same-chat', cwd: h.dir, isolated: true };
  const results = await Promise.allSettled([
    h.handlers.get('atlas:collab')(event, request),
    h.handlers.get('atlas:collab')(event, request),
  ]);
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  assert.match(results.find((row) => row.status === 'rejected').reason.message, /already working/);
  await h.activeJobs.get(results.find((row) => row.status === 'fulfilled').value.id).promise;
});

test('failed Colab graphs clear active nodes and survive trusted job snapshots and disk storage', async (t) => {
  const graph = require('../colab-graph');
  const h = await mainHarness(t, {
    modules: {
      './collaboration': {
        normalizePassLimit: require('../collaboration').normalizePassLimit,
        createCollaboration: (hooks) => async (request) => {
          await hooks.graphChanged(graph.build({ task: request.task, active: { phase: 'build', provider: 'codex' } }));
          throw Error('Provider disconnected');
        },
      },
    },
  });
  h.setupIpc();
  h.allowColab();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const started = await h.handlers.get('atlas:collab')(event, {
    task: 'Build graph test',
    cwd: h.dir,
    isolated: false,
  });
  await assert.rejects(h.activeJobs.get(started.id).promise, /Provider disconnected/);
  const job = (await h.handlers.get('atlas:jobs')(event)).find((row) => row.id === started.id);
  assert.equal(job.graph.outcome, 'failed');
  assert(!job.graph.nodes.some((node) => node.status === 'running'));
  assert.equal(job.graph.nodes.find((node) => node.id === 'task').status, 'failed');
  const disk = JSON.parse(await fs.readFile(path.join(h.paths.userData, 'assistant-data.json'), 'utf8'));
  assert.equal(disk.jobs.find((row) => row.id === started.id).graph.outcome, 'failed');
  const resumed = await h.handlers.get('atlas:collab')(event, { resumeJobId: started.id });
  await assert.rejects(h.activeJobs.get(resumed.id).promise, /Provider disconnected/);
  assert.equal(h.activeJobs.get(resumed.id).graphRunId, job.graphRunId);
  assert(h.activeJobs.get(resumed.id).graph.revision > job.graph.revision);
  h.emitJobs();
  await new Promise((resolve) => setTimeout(resolve, 90));
  const patch = h.updates.filter((value) => Array.isArray(value.upsert)).at(-1);
  assert(patch);
  for (const row of patch.upsert)
    assert(!Object.hasOwn(row, 'graph'), 'Frequent job updates must not retransmit graphs');
});
