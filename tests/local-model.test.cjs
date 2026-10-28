const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { localBase, listModels, runLocalModel } = require('../local-model');
const { mainHarness } = require('./fixtures/main-harness.cjs');
test('local model connections accept only loopback and never follow redirects', async () => {
  assert.equal(localBase('http://localhost:11434/v1/'), 'http://127.0.0.1:11434/v1');
  assert.equal(localBase('http://[::1]:1234/v1'), 'http://[::1]:1234/v1');
  for (const address of [
    'https://example.com/v1',
    'http://192.168.1.2/v1',
    'http://localhost.evil/v1',
    'http://name:secret@localhost/v1',
    'http://localhost/v1?key=secret',
    'file:///v1',
  ])
    assert.throws(() => localBase(address));
  const ids = await listModels('http://localhost:1234/v1', {
    fetch: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:1234/v1/models');
      assert.equal(options.redirect, 'error');
      return new Response(JSON.stringify({ data: [{ id: 'local:8b' }, { id: '<bad>' }] }));
    },
  });
  assert.deepEqual(ids, ['local:8b']);
});
test('local chat streams text, accepts compatible JSON replies and rejects incomplete streams', async () => {
  let text = '';
  const result = await runLocalModel({
    base: 'http://127.0.0.1:1234/v1',
    model: 'local:8b',
    prompt: 'Hello',
    onText: (part) => {
      text += part;
    },
    fetch: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:1234/v1/chat/completions');
      assert.equal(options.redirect, 'error');
      assert.equal(JSON.parse(options.body).tools, undefined);
      assert.equal(options.headers.Authorization, undefined);
      return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      });
    },
  });
  assert.equal(result.output, 'Hello');
  assert.equal(text, 'Hello');
  const json = await runLocalModel({
    base: 'http://localhost:1234/v1',
    model: 'fixture',
    prompt: 'Hi',
    fetch: async () => new Response('{"choices":[{"message":{"content":"JSON reply"}}]}'),
  });
  assert.equal(json.output, 'JSON reply');
  await assert.rejects(
    runLocalModel({
      base: 'http://localhost:1234/v1',
      model: 'fixture',
      prompt: 'Hi',
      fetch: async () =>
        new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n', {
          headers: { 'content-type': 'text/event-stream' },
        }),
    }),
    /before completion/,
  );
  let fetched = false;
  await assert.rejects(
    runLocalModel({
      base: 'http://localhost:1234/v1',
      model: 'fixture',
      prompt: 'Hi',
      signal: AbortSignal.abort(),
      fetch: async () => {
        fetched = true;
      },
    }),
  );
  assert.equal(fetched, false);
});
test('local Assistant failures never fall back to cloud and local chat does not run project commands', async (t) => {
  let cloud = 0,
    checks = 0,
    fail = false;
  const local = require('../local-model');
  class FakeCloud {
    async run() {
      cloud++;
      throw Error('Unexpected cloud request');
    }
  }
  const h = await mainHarness(t, {
    modules: {
      './codex-connection': { CodexConnection: FakeCloud },
      './local-model': {
        ...local,
        runLocalModel: async () => {
          if (fail) throw Error('HTTP 429 usage limit');
          return { output: 'Local reply' };
        },
      },
      './project-tools': {
        completionChecks: async () => {
          checks++;
          return { status: 'passed', results: [] };
        },
        detectProject: async () => ({ checks: [] }),
      },
    },
  });
  h.allowColab();
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } };
  const call = (name, value) => h.handlers.get('atlas:' + name)(event, value);
  const cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  await assert.rejects(
    call('save-settings', {
      localModelEnabled: true,
      localModelBaseUrl: 'http://example.com/v1',
      localModel: 'fixture',
    }),
    /loopback/,
  );
  await call('save-settings', {
    localModelEnabled: true,
    localModelBaseUrl: 'http://127.0.0.1:1234/v1',
    localModel: 'fixture',
  });
  const result = await call('chat', { cwd, prompt: 'Explain the project' });
  assert.equal(result.provider, 'local');
  fail = true;
  await assert.rejects(call('chat', { cwd, prompt: 'Explain again' }), /429/);
  assert.equal(cloud, 0);
  assert.equal(checks, 0);
  assert.ok([...h.activeJobs.values()].every((job) => !job.changeId));
  await h.assistantService.flush();
});
