const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { createTaskQueue } = require('../task-queue');
async function until(fn) {
  for (let n = 0; n < 200; n++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('Condition did not become true.');
}
// A queue whose runs finish only when the test says so.
async function harness(t, { settled = async () => true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-queue-parallel-')),
    cwd = path.join(root, 'project');
  await fs.mkdir(cwd);
  const pending = new Map(),
    started = [];
  const queue = createTaskQueue({
    directory: root,
    settled,
    run: (row) =>
      new Promise((resolve, reject) => {
        started.push(row.prompt);
        pending.set(row.prompt, { resolve, reject });
      }),
  });
  // Let every run finish and its save land before the folder is removed.
  t.after(async () => {
    for (const run of pending.values()) run.resolve({ jobId: 'cleanup' });
    await until(async () => !(await queue.action()).items.some((row) => row.status === 'running'));
    await queue.close();
    await fs.rm(root, { force: true, recursive: true });
  });
  const add = (prompt, extra = {}) =>
    queue.action({ action: 'add', task: { cwd, prompt, provider: 'colab', ...extra } });
  const finish = (prompt, result = { jobId: prompt }) => pending.get(prompt).resolve(result);
  const state = () => queue.action();
  return { root, queue, add, finish, started, pending, state };
}

test('Colab tasks run side by side up to the limit, in queue order', async (t) => {
  const h = await harness(t);
  for (const name of ['a', 'b', 'c', 'd']) await h.add(name);
  await h.queue.action({ action: 'start', pauseBetween: false, concurrency: 3 });
  await until(() => h.started.length === 3);
  assert.deepEqual(h.started, ['a', 'b', 'c']);
  assert.equal((await h.state()).items.filter((row) => row.status === 'running').length, 3);
  h.finish('b');
  await until(() => h.started.length === 4);
  assert.equal(h.started[3], 'd');
  for (const name of ['a', 'c', 'd']) h.finish(name);
  await until(async () => (await h.state()).items.every((row) => row.status === 'completed'));
});
test('the default runs one task at a time, and Pause between tasks forces one at a time', async (t) => {
  const h = await harness(t);
  await h.add('a');
  await h.add('b');
  assert.equal((await h.state()).concurrency, 1);
  await h.queue.action({ action: 'start', pauseBetween: false });
  await until(() => h.started.length === 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(h.started, ['a']);
  h.finish('a');
  await until(() => h.started.length === 2);
  h.finish('b');
  const paused = await harness(t);
  await paused.add('a');
  await paused.add('b');
  await paused.queue.action({ action: 'start', pauseBetween: true, concurrency: 3 });
  await until(() => paused.started.length === 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(paused.started, ['a'], 'Pause between tasks means one at a time');
  paused.finish('a');
  await until(async () => (await paused.state()).paused === true);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(paused.started, ['a']);
});
test('Assistant tasks run alone: they wait for running tasks and block the ones below', async (t) => {
  const h = await harness(t);
  await h.add('colab one');
  await h.add('assistant', { provider: 'assistant' });
  await h.add('colab two');
  await h.queue.action({ action: 'start', pauseBetween: false, concurrency: 3 });
  await until(() => h.started.length === 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(h.started, ['colab one'], 'the Assistant task waits for the running Colab task');
  h.finish('colab one');
  await until(() => h.started.length === 2);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(h.started, ['colab one', 'assistant'], 'nothing starts beside an Assistant task');
  h.finish('assistant');
  await until(() => h.started.length === 3);
  h.finish('colab two');
});
test('a task can wait for the one above it to finish and be accepted or discarded', async (t) => {
  let accepted = false;
  const h = await harness(t, { settled: async (row) => row.prompt === 'base' && accepted });
  await h.add('base');
  await h.add('builds on base', { waitForPrevious: true });
  await h.add('independent');
  await h.queue.action({ action: 'start', pauseBetween: false, concurrency: 3 });
  await until(() => h.started.length === 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(h.started, ['base'], 'queue order is kept behind a waiting task');
  h.finish('base', { jobId: 'base', workspaceId: 'w1' });
  await until(async () => (await h.state()).items[0].status === 'completed');
  await h.queue.tick();
  assert.deepEqual(h.started, ['base'], 'finished but not yet accepted');
  accepted = true;
  void h.queue.tick();
  await until(() => h.started.length === 3);
  assert.deepEqual(h.started, ['base', 'builds on base', 'independent']);
  h.finish('builds on base');
  h.finish('independent');
});
test('a failure stops new tasks from starting while running ones finish', async (t) => {
  const h = await harness(t);
  for (const name of ['a', 'b', 'c']) await h.add(name);
  await h.queue.action({ action: 'start', pauseBetween: false, concurrency: 2 });
  await until(() => h.started.length === 2);
  h.pending.get('a').reject(Error('provider unavailable'));
  await until(async () => (await h.state()).paused === true);
  h.finish('b');
  await until(async () => (await h.state()).items[1].status === 'completed');
  await new Promise((r) => setTimeout(r, 30));
  const state = await h.state();
  assert.deepEqual(
    state.items.map((row) => row.status),
    ['failed', 'completed', 'queued'],
  );
  assert.deepEqual(h.started, ['a', 'b']);
});
test('waiting tasks can change whether they wait, and every running task is interrupted after a restart', async (t) => {
  const h = await harness(t);
  await h.add('a');
  await h.add('b');
  const b = (await h.state()).items[1];
  await h.queue.action({ action: 'wait', id: b.id, wait: true });
  assert.equal((await h.state()).items[1].waitForPrevious, true);
  await h.queue.action({ action: 'wait', id: b.id, wait: false });
  await h.queue.action({ action: 'start', pauseBetween: false, concurrency: 2 });
  await until(() => h.started.length === 2);
  await assert.rejects(h.queue.action({ action: 'wait', id: b.id, wait: true }), /Only waiting tasks/);
  await h.queue.close();
  const restarted = createTaskQueue({
    directory: h.root,
    run: async () => assert.fail('a restart stays paused'),
  });
  const state = await restarted.action();
  assert.equal(state.paused, true);
  assert.deepEqual(
    state.items.map((row) => row.status),
    ['interrupted', 'interrupted'],
  );
  assert.equal(state.concurrency, 2, 'the limit is remembered');
  await restarted.close();
  h.finish('a');
  h.finish('b');
});
