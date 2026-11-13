const test = require('node:test'),
  assert = require('node:assert/strict');
const policy = require('../task-experience'),
  work = require('../work-overview'),
  activity = require('../activity-model');
test('allowance review requires an explicit choice, uses fresh main meters and never suggests an exhausted alternative', async () => {
  const now = 1000000,
    meter = (remainingPercent) => ({ updatedAt: now, windows: [{ remainingPercent, main: true }] });
  const usage = { codex: meter(5), claude: meter(70) };
  let prompts = 0;
  const options = {
    now,
    allowSwitch: true,
    ask: async ({ alternative }) => {
      prompts++;
      assert.equal(alternative, 'claude');
      return 'claude';
    },
  };
  assert.equal(await policy.reviewAllowance(usage, ['codex'], options), 'claude');
  await assert.rejects(
    policy.reviewAllowance(usage, ['codex'], { ...options, ask: async () => 'cancel' }),
    /cancelled/,
  );
  assert.equal(await policy.reviewAllowance(usage, ['codex'], { ...options, ask: async () => 'continue' }), 'codex');
  usage.claude.windows.push({ main: true, remainingPercent: 0 });
  await assert.rejects(
    policy.reviewAllowance(usage, ['codex'], {
      ...options,
      ask: async ({ alternative }) => {
        assert.equal(alternative, null);
        return 'claude';
      },
    }),
    /cancelled/,
  );
  usage.codex.stale = true;
  assert.equal(await policy.reviewAllowance(usage, ['codex'], options), 'codex');
  assert.equal(prompts, 1);
  assert.deepEqual(policy.lowUsage({ updatedAt: now - 300001, windows: [{ remainingPercent: 0 }] }, now), []);
  assert.deepEqual(
    policy.lowUsage(
      {
        updatedAt: now,
        windows: [
          { remainingPercent: null },
          { remainingPercent: 0, main: false },
          { remainingPercent: 0, resetsAt: now - 1 },
        ],
      },
      now,
    ),
    [],
  );
});
test('task cleanup is reversible, persists as JSON, cannot hide active approvals and returns changed failures to attention', () => {
  const job = { id: 'a', status: 'failed', statusText: 'Test failed', endedAt: 100 };
  policy.organize(job, 'dismiss-attention');
  assert.equal(work.bucket(JSON.parse(JSON.stringify(job))), 'history');
  job.statusText = 'A different failure';
  assert.equal(work.bucket(job), 'attention');
  policy.organize(job, 'archive');
  assert.equal(work.bucket(job), 'archived');
  policy.organize(job, 'unarchive');
  assert.equal(work.bucket(job), 'attention');
  assert.throws(() => policy.organize(job, 'archive', [{ jobId: 'a' }]), /pending approvals/);
  assert.throws(() => policy.organize({ ...job, status: 'running' }, 'archive'), /active work/);
  const archived = { id: 'done', status: 'completed', archived: true, endedAt: 100 };
  assert.equal(activity.overview([archived], [], '', 200).finished24h, 1);
  assert.equal(activity.overview([archived], [], '', 200).completed.length, 0);
  assert.equal(activity.overview([{ ...job, archived: true }], [{ jobId: 'a' }]).attention.length, 1);
});
test('handoff distinguishes model completion from executed checks and records missing evidence', () => {
  const unknown = policy.handoff({ status: 'completed', result: { output: 'All tests passed' } });
  assert.equal(unknown.passed, 0);
  assert.match(unknown.concerns[0], /No executed/);
  const result = policy.handoff(
    { status: 'completed', verification: { status: 'failed', results: [{ status: 'passed' }, { status: 'failed' }] } },
    [{ path: 'app.js' }],
  );
  assert.deepEqual(result.files, ['app.js']);
  assert.equal(result.failed, 1);
  assert.equal(result.passed, 1);
  assert.match(result.next, /unresolved/);
});
