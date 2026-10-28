const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createTaskQueue } = require('../task-queue');
const { batchItems } = require('../parallel-batches');
test('parallel batches wait for every isolated task before starting integration', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-batch-'));
  const calls = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const queue = createTaskQueue({
    directory: root,
    run: async (row) => {
      calls.push(row);
      if (row.provider === 'colab') await gate;
      return { workspaceId: row.id };
    },
  });
  t.after(async () => {
    release();
    await queue.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const state = await queue.action({
    action: 'add-batch',
    cwd: root,
    tasks: ['Add one', 'Add two'],
    checks: 'npm test',
  });
  assert.equal(state.paused, true);
  assert.equal(state.items.length, 3);
  await queue.action({ action: 'start', pauseBetween: false, concurrency: 2 });
  for (let i = 0; i < 200 && calls.length < 2; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls.length, 2);
  assert.ok(calls.every((row) => row.provider === 'colab'));
  release();
  for (let i = 0; i < 400 && calls.length < 3; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(calls[2].provider, 'integration');
  assert.deepEqual(
    calls[2].sourceWorkspaces,
    calls.slice(0, 2).map((row) => row.id),
  );
  assert.equal(calls[2].workflowChecks, 'npm test');
});
test('parallel batches require integration checks and bounded independent tasks', () => {
  assert.throws(() => batchItems({ tasks: ['one', 'two'] }, 'C:/project'), /integration check/);
  assert.throws(() => batchItems({ tasks: ['one'], checks: 'test' }, 'C:/project'), /2–8/);
});
