const test = require('node:test'),
  assert = require('node:assert/strict'),
  { mainHarness } = require('./fixtures/main-harness.cjs');
test('new capability IPC rejects untrusted callers and saves only validated model preferences', async (t) => {
  const h = await mainHarness(t, { modules: { './hardware-check': { check: async (size) => ({ size }) } } });
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } };
  for (const name of ['hardware-check', 'task-plans', 'task-progress'])
    await assert.rejects(
      async () => h.handlers.get('atlas:' + name)({ senderFrame: { url: 'https://evil.invalid' } }, {}),
      /Untrusted/,
    );
  const save = h.handlers.get('atlas:save-settings'),
    get = h.handlers.get('atlas:get-settings');
  await save(event, { modelRoutingEnabled: true, fastCodexModel: 'fixture-fast', strongClaudeModel: 'fixture-strong' });
  const settings = await get(event);
  assert.equal(settings.fastCodexModel, 'fixture-fast');
  assert.equal(settings.modelRoutingEnabled, true);
  const plan = await h.handlers.get('atlas:task-plans')(event, {
    action: 'save',
    plan: { cwd: h.dir, task: 'A task', steps: 'Inspect then implement', criteria: 'Checks pass' },
  });
  assert.equal(plan.approved, false);
  assert.deepEqual(await h.handlers.get('atlas:hardware-check')(event, { modelGiB: 4 }), { size: 4 });
  assert.equal((await h.handlers.get('atlas:task-progress')(event)).length, 0);
});
test('ordinary profile edits preserve the saved environment recipe', async (t) => {
  const fs = require('node:fs/promises'),
    os = require('node:os'),
    path = require('node:path'),
    { createWorkspaceService } = require('../workspace-service');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-env-profile-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const service = createWorkspaceService(root);
  const saved = await service.profiles({
    action: 'save',
    profile: {
      cwd: root,
      name: 'Demo',
      environmentCommands: 'npm ci',
      environmentTools: 'Node',
      environmentPrompt: true,
    },
  });
  const edited = await service.profiles({ action: 'save', profile: { id: saved.id, cwd: root, name: 'Renamed' } });
  assert.equal(edited.environmentCommands, 'npm ci');
  assert.equal(edited.environmentPrompt, true);
});
