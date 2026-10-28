const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createWorkflowTemplates, workflowProject } = require('../workflow-templates');
test('workflow templates persist edits, preserve starters and do not mutate project checks', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-workflows-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = createWorkflowTemplates(directory);
  const starters = await service.action();
  assert.equal(starters.length, 4);
  await service.action({
    action: 'save',
    template: {
      name: 'My bug workflow',
      task: 'Fix a bug',
      checks: ' npm test \n\n npm run lint ',
      mode: 'debug',
      criteria: 'Works',
    },
  });
  const rows = await createWorkflowTemplates(directory).action();
  const saved = rows.find((row) => !row.builtin);
  assert.equal(saved.checks, 'npm test\nnpm run lint');
  assert.equal(saved.mode, 'debug');
  const original = { autoCheck: false, checkCommands: 'old check' };
  assert.deepEqual(workflowProject(original, saved.checks), { autoCheck: true, checkCommands: saved.checks });
  assert.equal(original.checkCommands, 'old check');
  await service.action({ action: 'delete', id: saved.id });
  assert.equal((await service.action()).length, 4);
  await assert.rejects(service.action({ action: 'save', template: { name: 'Empty' } }), /name and task/);
});
