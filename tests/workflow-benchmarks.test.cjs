const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { createWorkflowBenchmarks, summary } = require('../workflow-benchmarks');
async function fixture(t, runTask) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-benchmark-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5 }));
  let allow = true,
    digest = 'fixed-digest',
    forks = 0,
    busy = false;
  const calls = [],
    profiles = [],
    approvals = [];
  const service = createWorkflowBenchmarks({
    directory,
    version: 'fixture',
    sessions: {
      action: async (r) =>
        r.action === 'list'
          ? { snapshots: [{ id: 'fixed', digest }] }
          : { id: 'trial-' + ++forks, cwd: path.join(directory, 'trial-' + forks) },
    },
    workspace: {
      profile: async () => ({}),
      profiles: async (r) => {
        profiles.push(r.profile);
        return { ...r.profile, id: 'profile-' + profiles.length };
      },
    },
    approve: async (...args) => {
      approvals.push(args);
      return allow;
    },
    busy: () => busy,
    runTask: async (r) => {
      calls.push(r);
      return runTask
        ? runTask(r)
        : {
            jobId: 'job-' + calls.length,
            configurationMatched: true,
            verification: { status: 'passed', results: [{ command: r.testCase.checks, status: 'passed' }] },
            usage: calls.length === 1 ? { inputTokens: 20, outputTokens: 5 } : null,
          };
    },
  });
  const save = (extra) =>
    service.action({
      action: 'save',
      checkpointId: 'fixed',
      name: 'Fixed work',
      cases: [{ name: 'Repair', task: 'Fix fixture only', criteria: 'Check passes', checks: 'node check.cjs' }],
      configs: [{ name: 'Codex', provider: 'codex', model: 'fixture-model' }],
      ...extra,
    });
  return {
    service,
    save,
    directory,
    calls,
    profiles,
    approvals,
    setAllow: (v) => (allow = v),
    setDigest: (v) => (digest = v),
    setBusy: (v) => (busy = v),
    forks: () => forks,
  };
}
test('benchmarks save passively then execute fixed cases/configurations in fresh trials', async (t) => {
  const f = await fixture(t),
    suite = await f.save();
  assert.equal(f.calls.length, 0);
  assert.equal(f.forks(), 0);
  assert.equal(f.approvals.length, 0);
  assert.equal(suite.configs[0].limits.seconds, 600);
  const result = await f.service.action({ action: 'run', id: suite.id, repeat: 2 });
  assert.equal(f.calls.length, 2);
  assert.notEqual(f.calls[0].trial.cwd, f.calls[1].trial.cwd);
  assert.equal(f.profiles[0].codexModel, 'fixture-model');
  assert.equal(f.profiles[1].checkCommands, 'node check.cjs');
  assert.deepEqual(f.calls[0].testCase, f.calls[1].testCase);
  assert.match(f.approvals[0][1], /600 seconds.*8 ATLAS attempts/);
  assert.equal(result.summary[0].checksPassed, 2);
  assert.equal(result.summary[0].knownUsageRuns, 1);
  assert.equal(result.summary[0].inputTokens, 20);
  const state = await f.service.action({ action: 'status' });
  assert.equal(state.active, null);
  assert.equal(state.runs[0].checkpointDigest, 'fixed-digest');
  assert.equal(state.runs[0].environment.providerVersion, null);
});
test('benchmark approval denial, bounds, busy work and changed checkpoints never invoke providers', async (t) => {
  const f = await fixture(t),
    suite = await f.save();
  f.setAllow(false);
  assert.deepEqual(await f.service.action({ action: 'run', id: suite.id }), { cancelled: true });
  f.setAllow(true);
  f.setDigest('changed');
  await assert.rejects(f.service.action({ action: 'run', id: suite.id }), /checkpoint changed/);
  f.setDigest('fixed-digest');
  f.setBusy(true);
  await assert.rejects(f.service.action({ action: 'run', id: suite.id }), /Finish other work/);
  f.setBusy(false);
  await assert.rejects(f.service.action({ action: 'run', id: suite.id, repeat: 6 }), /1–5/);
  await assert.rejects(
    f.save({ configs: [{ name: 'bad', provider: 'codex', model: 'model; command' }] }),
    /model identifier/,
  );
  assert.equal(f.calls.length, 0);
});
test('benchmark cancellation awaits active task and stops later cases; mutations blocked while active', async (t) => {
  let entered, cancelled;
  const started = new Promise((r) => (entered = r)),
    stopped = new Promise((r) => (cancelled = r));
  const f = await fixture(t, async ({ signal }) => {
    entered();
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    cancelled();
    throw Error('aborted fixture');
  });
  const suite = await f.save(),
    running = f.service.action({ action: 'run', id: suite.id, repeat: 2 });
  await started;
  await assert.rejects(f.save(), /Stop the active/);
  await assert.rejects(f.service.action({ action: 'run', id: suite.id }), /Finish other work/);
  await f.service.action({ action: 'cancel' });
  await stopped;
  assert.equal((await running).cancelled, true);
  const state = await f.service.action({ action: 'status' });
  assert.equal(state.runs.length, 1);
  assert.equal(state.runs[0].status, 'cancelled');
  assert.equal(state.active, null);
});
test('archived suites retain readable results and cannot run again; interrupted runs are not replayed', async (t) => {
  const f = await fixture(t),
    suite = await f.save();
  await f.service.action({ action: 'run', id: suite.id });
  await f.service.action({ action: 'remove-suite', id: suite.id });
  assert.equal((await f.service.action({ action: 'summary', id: suite.id }))[0].runs, 1);
  await assert.rejects(f.service.action({ action: 'run', id: suite.id }), /Choose a suite/);
  const state = await f.service.action({ action: 'status' });
  state.runs[0].status = 'running';
  await fs.writeFile(path.join(f.directory, 'workflow-benchmarks.json'), JSON.stringify(state));
  let replayed = false;
  const reopened = createWorkflowBenchmarks({
    directory: f.directory,
    runTask: () => {
      replayed = true;
    },
  });
  const restored = await reopened.action({ action: 'status' });
  assert.equal(restored.runs[0].status, 'interrupted');
  assert.equal(replayed, false);
});
test('benchmark summaries separate missing usage and substituted configurations from passed checks', () => {
  const row = {
    caseName: 'case',
    config: { name: 'config' },
    durationMs: 4,
    verification: { status: 'passed', results: [{}] },
  };
  const value = summary([
    { ...row, configurationMatched: false },
    { ...row, usage: { inputTokens: 1 } },
  ])[0];
  assert.equal(value.checksPassed, 1);
  assert.equal(value.knownUsageRuns, 0);
  assert.equal(value.inputTokens, null);
});
