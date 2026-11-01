const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path');
const { createScheduledTasks } = require('../scheduled-tasks');
const { mainHarness } = require('./fixtures/main-harness.cjs');
const HOUR = 3600000,
  DAY = 24 * HOUR;
function fixture(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-scheduled-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const clock = { at: 1000 * DAY },
    runs = [],
    state = { approved: true, approvals: [] };
  const make = () =>
    createScheduledTasks({
      directory,
      now: () => clock.at,
      approve: async (title, detail) => {
        state.approvals.push(detail);
        return state.approved;
      },
      start: async (row) => runs.push(row.id),
      ...options,
    });
  const tasks = make();
  const add = (item = {}) =>
    tasks.save({ prompt: 'Summarise the log', cwd: directory, schedule: 'daily', firstAt: clock.at + HOUR, ...item });
  return { directory, clock, runs, state, tasks, make, add };
}
test('a task needs approval, and the approval spells out the cost', async (t) => {
  const { tasks, state, add, runs, clock } = fixture(t);
  state.approved = false;
  assert.deepEqual(await add(), { cancelled: true });
  assert.deepEqual(tasks.list(), []);
  state.approved = true;
  await add();
  assert.match(state.approvals.at(-1), /uses your model accounts/);
  assert.match(state.approvals.at(-1), /cannot change files/);
  assert.equal(tasks.list()[0].allowEdits, false);
  clock.at += 2 * HOUR;
  await tasks.tick();
  assert.equal(runs.length, 1);
});
test('bad tasks are refused', async (t) => {
  const { add, directory, clock } = fixture(t);
  await assert.rejects(add({ prompt: '  ' }), /Enter a task/);
  await assert.rejects(add({ prompt: 'x'.repeat(20001) }), /Enter a task/);
  await assert.rejects(add({ schedule: 'minutely' }), /how often/);
  await assert.rejects(add({ schedule: 'constructor' }), /how often/);
  await assert.rejects(add({ firstAt: clock.at - 1 }), /future time/);
  await assert.rejects(add({ cwd: path.join(directory, 'missing') }), /working folder/);
  await assert.rejects(add({ cwd: 'relative' }), /working folder/);
});
test('a task runs when due and only then, and repeats on schedule', async (t) => {
  const { clock, runs, tasks, add } = fixture(t);
  await add();
  assert.equal(await tasks.tick(), false);
  clock.at += HOUR;
  assert.equal(await tasks.tick(), true);
  assert.equal(await tasks.tick(), false);
  assert.equal(runs.length, 1);
  assert.equal(tasks.list()[0].lastStatus, 'completed');
  clock.at += DAY;
  await tasks.tick();
  assert.equal(runs.length, 2);
});
test('a one-time task runs once and turns off', async (t) => {
  const { clock, runs, tasks, add } = fixture(t);
  await add({ schedule: 'once' });
  clock.at += HOUR;
  await tasks.tick();
  clock.at += 30 * DAY;
  await tasks.tick();
  assert.equal(runs.length, 1);
  assert.equal(tasks.list()[0].enabled, false);
});
test('missed runs are recorded and not caught up', async (t) => {
  const { clock, runs, tasks, add } = fixture(t);
  await add();
  clock.at += 10 * DAY;
  assert.equal(await tasks.tick(), false);
  assert.equal(runs.length, 0);
  const [row] = tasks.list();
  assert.equal(row.lastStatus, 'missed');
  assert(row.nextAt > clock.at);
  assert(row.nextAt - clock.at <= DAY);
});
test('a due task waits while other work runs, then runs', async (t) => {
  let busy = true;
  const { clock, runs, tasks, add } = fixture(t, { busy: () => busy });
  await add();
  clock.at += HOUR;
  assert.equal(await tasks.tick(), false);
  assert.equal(runs.length, 0);
  busy = false;
  clock.at += HOUR / 2;
  assert.equal(await tasks.tick(), true);
  assert.equal(runs.length, 1);
});
test('only one scheduled task runs at a time', async (t) => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const started = [];
  const { clock, tasks, add } = fixture(t, {
    start: async (row) => {
      started.push(row.id);
      await gate;
    },
  });
  await add();
  await add();
  clock.at += HOUR;
  const first = tasks.tick();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(await tasks.tick(), false);
  assert.equal(started.length, 1);
  release();
  await first;
  await tasks.tick();
  assert.equal(started.length, 2);
});
test('a blocked run is skipped with the reason and does not start', async (t) => {
  const { clock, runs, tasks, add } = fixture(t, { blocked: async () => 'Permission bypass is on.' });
  await add();
  clock.at += HOUR;
  assert.equal(await tasks.tick(), false);
  assert.equal(runs.length, 0);
  const [row] = tasks.list();
  assert.equal(row.lastStatus, 'skipped');
  assert.equal(row.lastError, 'Permission bypass is on.');
  assert(row.nextAt > clock.at);
});
test('three failures in a row turn a task off, and a success resets the count', async (t) => {
  let fail = true;
  const { clock, tasks, add } = fixture(t, {
    start: async () => {
      if (fail) throw Error('Login expired');
    },
  });
  await add();
  const run = async () => {
    clock.at += DAY;
    await tasks.tick();
    return tasks.list()[0];
  };
  clock.at -= DAY - HOUR;
  await run();
  assert.equal((await run()).failures, 2);
  fail = false;
  assert.equal((await run()).failures, 0);
  fail = true;
  await run();
  await run();
  const off = await run();
  assert.equal(off.enabled, false);
  assert.match(off.lastError, /Login expired Turned off after 3 failures/);
});
test('turning a task back on asks again and moves past times', async (t) => {
  const { clock, tasks, state, add } = fixture(t);
  await add();
  const { id } = tasks.list()[0];
  await tasks.setEnabled(id, false);
  clock.at += 10 * DAY;
  state.approved = false;
  assert.deepEqual(await tasks.setEnabled(id, true), { cancelled: true });
  assert.equal(tasks.list()[0].enabled, false);
  state.approved = true;
  await tasks.setEnabled(id, true);
  assert.equal(tasks.list()[0].enabled, true);
  assert(tasks.list()[0].nextAt > clock.at);
});
test('a scheduled run reaches the provider read only unless edits were allowed', async (t) => {
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
  const cwd = path.join(h.dir, 'project');
  fs.mkdirSync(cwd);
  fs.mkdirSync(h.paths.userData, { recursive: true });
  await h.handlers.get('atlas:save-settings')(
    { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    { routeMode: 'codex' },
  );
  const seeded = (id, allowEdits) => ({
    id,
    conversationId: id.padEnd(24, '0'),
    title: 'Fix the build',
    prompt: 'Fix the build',
    cwd,
    every: DAY,
    nextAt: Date.now() - 1000,
    allowEdits,
    enabled: true,
    failures: 0,
  });
  fs.writeFileSync(
    path.join(h.paths.userData, 'scheduled-tasks.json'),
    JSON.stringify([seeded('read-only-task', false), seeded('editing-task', true)]),
  );
  const tasks = h.scheduledTasks();
  assert.equal(await tasks.tick(), true);
  assert.equal(await tasks.tick(), true);
  assert.deepEqual(
    tasks.list().map((row) => [row.id, row.lastStatus]),
    [
      ['read-only-task', 'completed'],
      ['editing-task', 'completed'],
    ],
    JSON.stringify(tasks.list()),
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[0].settings.codexSandbox, 'read-only');
  assert.equal(calls[0].settings.readOnly, true);
  assert.equal(calls[1].settings.codexSandbox, 'workspace-write');
  assert.equal(calls[1].settings.readOnly, undefined);
});
test('tasks survive a restart, and a run cut short is not started again', async (t) => {
  const { clock, tasks, add, make, runs } = fixture(t, {
    start: () => new Promise(() => {}),
  });
  await add();
  clock.at += HOUR;
  void tasks.tick();
  await new Promise((resolve) => setTimeout(resolve, 30));
  await tasks.flush();
  const restarted = make();
  const [row] = restarted.list();
  assert.equal(row.lastStatus, 'interrupted');
  assert(row.nextAt > clock.at);
  assert.equal(await restarted.tick(), false);
  assert.equal(runs.length, 0);
});
