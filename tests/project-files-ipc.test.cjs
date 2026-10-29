const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  { mainHarness } = require('./fixtures/main-harness.cjs');
test('project file IPC binds paths to recorded conversations and task workspaces, and attachments require an explicit action', async (t) => {
  const h = await mainHarness(t);
  h.setupIpc();
  const a = path.join(h.dir, 'project-a'),
    b = path.join(h.dir, 'project-b');
  await fs.mkdir(a);
  await fs.mkdir(b);
  await fs.writeFile(path.join(a, 'result.txt'), 'Project A');
  await fs.writeFile(path.join(b, 'result.txt'), 'Project B');
  const id = 'conversation-project-files';
  await h.writeAtlasHistory([{ id, cwd: a, turns: [], updatedAt: Date.now() }]);
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    call = (request) => h.handlers.get('atlas:project-file')(event, request);
  await assert.rejects(
    h.handlers.get('atlas:project-file')(
      { senderFrame: { url: 'https://evil.invalid' } },
      { cwd: a, path: 'result.txt' },
    ),
    /Untrusted/,
  );
  assert.equal((await call({ conversationId: id, cwd: b, path: 'result.txt' })).text, 'Project A');
  await assert.rejects(call({ conversationId: id, path: path.join(b, 'result.txt') }), /outside/);
  h.activeJobs.set('task-file', { id: 'task-file', cwd: b, colabChatId: 'colab-a', status: 'completed' });
  assert.equal((await call({ jobId: 'task-file', chatId: 'colab-a', cwd: a, path: 'result.txt' })).text, 'Project B');
  await assert.rejects(call({ jobId: 'task-file', chatId: 'colab-b', path: 'result.txt' }), /another Colab/);
  const attached = await call({ conversationId: id, action: 'attach', path: 'result.txt' });
  assert.equal(attached[0].name, 'result.txt');
  await h.assistantService.flush();
});
