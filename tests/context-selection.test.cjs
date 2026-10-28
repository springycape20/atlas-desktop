const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { mainHarness } = require('./fixtures/main-harness.cjs');
test('Assistant context exclusions affect the actual provider request and start a fresh session', async (t) => {
  const calls = [];
  class FakeCodex {
    async run(request) {
      calls.push(request);
      return { output: 'fixture reply', sessionId: 'fixture-session' };
    }
  }
  const h = await mainHarness(t, { modules: { './codex-connection': { CodexConnection: FakeCodex } } });
  h.allowColab();
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } };
  const call = (name, request) => h.handlers.get('atlas:' + name)(event, request);
  const cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  const profile = await call('projects', {
    action: 'save',
    profile: { name: 'Fixture', cwd, instructions: 'PROJECT_PRIVATE_MARKER' },
  });
  h.assistantService.memory('save', { text: 'MEMORY_PRIVATE_MARKER' });
  const id = 'context-fixture-conversation';
  await h.writeAtlasHistory([
    {
      id,
      title: 'Fixture',
      cwd,
      sessions: { codex: 'old-session' },
      turns: [{ role: 'user', content: 'HISTORY_PRIVATE_MARKER' }],
    },
  ]);
  await call('chat', {
    prompt: 'Explain this project using codex',
    cwd,
    conversationId: id,
    profileId: profile.id,
    contextSelection: { instructions: false, memories: false, history: false, attachments: false },
  });
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0].prompt, /(?:PROJECT|MEMORY|HISTORY)_PRIVATE_MARKER/);
  assert.ok(!calls[0].sessionId);
  const preview = await call('context-preview', {
    prompt: 'Explain project',
    cwd,
    profileId: profile.id,
    conversationId: id,
    selection: { instructions: false },
  });
  assert.equal(preview.sections[0].included, false);
  assert.match(preview.sections[0].text, /PROJECT_PRIVATE_MARKER/);
  await assert.rejects(h.handlers.get('atlas:context-preview')({}, { cwd }), /Untrusted/);
  await h.assistantService.flush();
});
