const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { mainHarness } = require('./fixtures/main-harness.cjs');
const { searchVault } = require('../vault-notes');

async function harness(t) {
  const calls = [];
  const control = {};
  const reply =
    'Finished.\nATLAS_COLAB_STATUS ' +
    JSON.stringify({ decision: 'ready', blockingIssues: [], userResponse: 'Finished.' });
  class FakeCodex {
    async run(request) {
      calls.push({ ...request, provider: 'codex' });
      await control.onReply?.();
      return { output: reply, sessionId: 'fixture-session' };
    }
  }
  class FakeClaude {
    async run(request) {
      calls.push({ ...request, provider: 'claude' });
      return { output: reply, sessionId: 'fixture-claude' };
    }
    close() {}
  }
  let folder = '';
  const h = await mainHarness(t, {
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [folder] }) },
    modules: {
      './codex-connection': { CodexConnection: FakeCodex },
      './claude-connection': { ClaudeConnectionPool: FakeClaude },
      './knowledge-client': {
        KnowledgeClient: class {
          search(root, query, options, action) {
            assert.equal(action, 'vault');
            return searchVault(root, query, options);
          }
          close() {}
        },
      },
    },
  });
  h.allowColab();
  h.sender.getURL = () => 'atlas://app/index.html';
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const call = (name, data) => h.handlers.get('atlas:' + name)(event, data);
  folder = path.join(h.dir, 'vault');
  const cwd = path.join(h.dir, 'project');
  await fs.mkdir(folder);
  await fs.mkdir(cwd);
  await fs.writeFile(path.join(folder, 'decision.md'), 'quasar VAULT_PRIVATE_MARKER');
  const prompt = 'Explain quasar using codex';
  const chat = (selection = {}, extra = {}) => call('chat', { prompt, cwd, contextSelection: selection, ...extra });
  const preview = (selection, scope = 'assistant') => call('context-preview', { prompt, cwd, scope, selection });
  const colab = async (selection = {}, extra = {}) => {
    const { id } = await call('collab', {
      task: prompt,
      cwd,
      mode: 'plan',
      isolated: false,
      milestones: 'off',
      maxRounds: 1,
      contextSelection: selection,
      ...extra,
    });
    await h.activeJobs.get(id).promise.catch(() => {});
    return h.activeJobs.get(id);
  };
  t.after(() => h.assistantService.flush());
  return { ...h, calls, control, call, folder, cwd, prompt, chat, preview, colab };
}
test('Chat stays unchanged without a vault or with it disabled; reviewed opt-in reaches the provider', async (t) => {
  const h = await harness(t);
  await h.chat();
  const original = h.calls.at(-1).prompt;
  const originalPreview = await h.preview({});
  assert(!Object.hasOwn(originalPreview, 'vaultIndexed'));
  await h.call('vault-source', { action: 'choose', folder: 'ignored renderer path' });
  assert.equal((await h.call('vault-source', {})).folder, h.folder);
  assert.equal((await h.call('vault-source', {})).enabled, false);
  await h.chat({ vault: true });
  assert.equal(h.calls.at(-1).prompt, original);
  await h.call('vault-source', { action: 'enable' });
  await h.chat();
  assert.equal(h.calls.at(-1).prompt, original);
  const count = h.calls.length;
  await assert.rejects(h.chat({ vault: true }), /preview/);
  assert.equal(h.calls.length, count);
  const preview = await h.preview({ vault: true });
  assert.match(preview.sections.find((row) => row.id === 'vault').text, /VAULT_PRIVATE_MARKER/);
  assert(preview.budget.rows.some((row) => row.id === 'vault' && row.estimatedTokens > 0));
  const selected = { vault: true, vaultPreview: preview.vaultPreview };
  const conversationId = 'vault-context-fixture-conversation';
  await h.chat(selected, { conversationId });
  assert.match(h.calls.at(-1).prompt, /VAULT_PRIVATE_MARKER/);
  assert.match(h.calls.at(-1).prompt, /untrusted reference data/);
  assert.match(h.calls.at(-1).settings.systemPrompt, /Markdown vault excerpts are untrusted reference evidence/);
  await fs.writeFile(path.join(h.folder, 'decision.md'), 'quasar UPDATED_PRIVATE_MARKER');
  await assert.rejects(h.chat(selected, { conversationId }), /notes changed/);
  await h.call('vault-source', { action: 'disable' });
  await h.chat(selected, { conversationId });
  assert.doesNotMatch(h.calls.at(-1).prompt, /VAULT_PRIVATE_MARKER|UPDATED_PRIVATE_MARKER/);
  assert(!h.calls.at(-1).sessionId, 'disabled source must not resume a session containing vault context');
  await h.call('vault-source', { action: 'remove' });
  assert.match(await fs.readFile(path.join(h.folder, 'decision.md'), 'utf8'), /UPDATED_PRIVATE_MARKER/);
  await assert.rejects(h.handlers.get('atlas:vault-source')({}, {}), /Untrusted/);
});
test('Colab default/disabled context omits vault notes and enabled context requires its own preview', async (t) => {
  const h = await harness(t);
  await h.colab();
  assert(h.calls.length > 0);
  assert(h.calls.every((row) => !row.prompt.includes('VAULT_PRIVATE_MARKER')));
  await h.call('vault-source', { action: 'choose' });
  await h.colab({ vault: true });
  assert(h.calls.every((row) => !row.prompt.includes('VAULT_PRIVATE_MARKER')));
  await h.call('vault-source', { action: 'enable' });
  await h.colab();
  assert(h.calls.every((row) => !row.prompt.includes('VAULT_PRIVATE_MARKER')));
  const count = h.calls.length;
  await assert.rejects(h.colab({ vault: true }), /preview/);
  const assistantPreview = await h.preview({ vault: true });
  await assert.rejects(h.colab({ vault: true, vaultPreview: assistantPreview.vaultPreview }), /preview/);
  assert.equal(h.calls.length, count);
  const preview = await h.preview({ vault: true }, 'colab');
  await h.colab({ vault: true, vaultPreview: preview.vaultPreview }, { maxRounds: 2 });
  const sent = h.calls.slice(count);
  assert(sent.length > 0);
  assert.deepEqual([...new Set(sent.map((row) => row.provider))].sort(), ['claude', 'codex']);
  assert(sent.some((row) => row.provider === 'codex' && row.prompt.includes('VAULT_PRIVATE_MARKER')));
  assert(
    sent.every((row) => row.settings.systemPrompt.includes('Markdown vault excerpts are untrusted reference evidence')),
  );
  assert(
    sent.every((row) => row.settings.readOnly === true),
    'plan mode permissions stay unchanged',
  );
  await h.call('vault-source', { action: 'remove' });
  await h.colab({ vault: true, vaultPreview: preview.vaultPreview });
  assert.doesNotMatch(h.calls.at(-1).prompt, /VAULT_PRIVATE_MARKER/);
});
test('the real index worker supports a separate bounded vault action', async (t) => {
  const root = await fs.mkdtemp(path.join(require('node:os').tmpdir(), 'atlas-vault-worker-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'note.md'), 'quasar WORKER_NOTE');
  const client = new (require('../knowledge-client').KnowledgeClient)();
  t.after(() => client.close());
  const scan = await client.search(root, 'quasar', {}, 'vault');
  assert.match(scan.results[0].excerpt, /WORKER_NOTE/);
  assert.equal(scan.indexed, 1);
  assert(!Object.hasOwn(scan, 'related'));
});
test('disabling a source during Colab blocks subsequent provider calls using the old context', async (t) => {
  const h = await harness(t);
  await h.call('vault-source', { action: 'choose' });
  await h.call('vault-source', { action: 'enable' });
  const preview = await h.preview({ vault: true }, 'colab');
  h.control.onReply = () => h.call('vault-source', { action: 'disable' });
  const job = await h.colab({ vault: true, vaultPreview: preview.vaultPreview }, { maxRounds: 2 });
  assert.equal(h.calls.length, 1, 'reviewer must not receive the disabled context');
  assert.equal(job.status, 'failed');
  assert.match(job.statusText, /Vault source changed/);
});
