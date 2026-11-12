const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { attach, clean, createTaskBudgets } = require('../task-budgets');
function job(limits, budget = {}, clock = {}) {
  const controller = new AbortController(),
    value = { signal: controller.signal, budget };
  const api = attach(value, { enabled: true, ...limits }, () => controller.abort(), clock);
  return { value, api };
}
test('task budgets reserve before each ATLAS invocation and preserve counters on resume', () => {
  const first = job({ providerCalls: 2 });
  first.api.before('one');
  first.api.before('two');
  assert.throws(() => first.api.before('three'), /provider-call budget/);
  assert.equal(first.value.budget.calls, 2);
  assert.equal(first.value.stopped, 'paused');
  assert.equal(first.value.signal.aborted, true);
  const resumed = job({ providerCalls: 2 }, first.value.budget);
  assert.throws(() => resumed.api.before('four'), /provider-call budget/);
  assert.equal(resumed.value.budget.calls, 2);
});
test('repair and outgoing estimate limits reject work before incrementing counters', () => {
  const repair = job({ repairAttempts: 0 });
  repair.api.before('initial');
  assert.throws(() => repair.api.before('repair', { repair: true }), /Repair-attempt/);
  assert.equal(repair.value.budget.repairs, 0);
  assert.equal(repair.value.budget.calls, 1);
  const text = job({ estimatedTokens: 2 });
  text.api.before('12345');
  assert.equal(text.value.budget.estimatedTokens, 2);
  assert.throws(() => text.api.before('1'), /outgoing text/);
  assert.equal(text.value.budget.calls, 1);
});
test('duration limit includes prior runtime, aborts idle work and disposes timer', () => {
  let fire, delay, cleared;
  const f = job(
    { seconds: 10 },
    { usedMs: 3000, runStartedAt: 1000 },
    {
      now: () => 2000,
      setTimer: (fn, ms) => {
        fire = fn;
        delay = ms;
        return 7;
      },
      clearTimer: (id) => {
        cleared = id;
      },
    },
  );
  assert.equal(delay, 7000);
  f.api.before('allowed');
  fire();
  assert.equal(f.value.signal.aborted, true);
  assert.throws(() => f.api.before('late'), /duration budget/);
  f.api.dispose();
  assert.equal(cleared, 7);
  const expired = job({ seconds: 1 }, { usedMs: 1100 }, { setTimer: () => 1, clearTimer() {} });
  assert.throws(() => expired.api.before('late'), /duration/);
});
test('disabled budgets measure invocations without imposing limits and usage remains partial', () => {
  const f = job({ enabled: false, providerCalls: 1, repairAttempts: 0, estimatedTokens: 1 });
  f.api.before('123456789', { repair: true });
  f.api.before('again');
  f.api.record({ usage: { inputTokens: 10, outputTokens: 3 } });
  f.api.record({ usage: { inputTokens: 2 } });
  f.api.record(null);
  assert.equal(f.value.budget.calls, 2);
  assert.equal(f.value.budget.reportedInput, 12);
  assert.equal(f.value.budget.reportedOutput, 3);
  assert.equal(f.value.budget.usageComplete, false);
  assert.equal(f.value.signal.aborted, false);
  const partial = job({ enabled: false });
  partial.api.record({ usage: { inputTokens: 2, outputTokens: 3, complete: false } });
  assert.equal(partial.value.budget.usageComplete, false);
});
test('project budget settings are validated, persisted and isolated; no-project chat defaults off', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-budgets-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5 }));
  const cwd = path.join(directory, 'project');
  await fs.mkdir(cwd);
  const service = createTaskBudgets(directory);
  assert.equal((await service.action({})).enabled, false);
  assert.throws(() => clean({ seconds: -1 }), /Invalid/);
  assert.throws(() => clean({ providerCalls: 1.5 }), /Invalid/);
  assert.equal(clean({ repairAttempts: '0' }).repairAttempts, 0);
  await service.action({ action: 'save', cwd, limits: { enabled: true, seconds: 20 } });
  assert.equal((await createTaskBudgets(directory).action({ cwd })).seconds, 20);
  await assert.rejects(service.action({ action: 'save', cwd: os.tmpdir(), limits: {} }), /dedicated project/);
});
