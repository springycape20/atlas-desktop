const { test } = require('node:test'),
  assert = require('node:assert/strict');
const { overview, elapsed } = require('../activity-model');
test('activity separates working from waiting, preserves evidence failures and counts completed work by time window', () => {
  const now = 100000000,
    jobs = [
      { id: 'working', status: 'running', startedAt: now - 1000, cwd: 'C:/one' },
      { id: 'waiting', status: 'running', startedAt: now - 2000, cwd: 'C:/one' },
      { id: 'done', status: 'completed', endedAt: now - 3000, cwd: 'C:/one' },
      { id: 'old', status: 'completed', endedAt: now - 86400001, cwd: 'C:/one' },
      { id: 'checks', status: 'completed', verification: { status: 'failed' }, cwd: 'C:/two' },
    ];
  const result = overview(jobs, [{ jobId: 'waiting' }], '', now);
  assert.deepEqual(
    result.active.map((j) => j.id),
    ['working'],
  );
  assert.deepEqual(
    result.attention.map((j) => j.id),
    ['waiting', 'checks'],
  );
  assert.equal(result.finished24h, 1);
  const scoped = overview(jobs, [{ jobId: 'waiting' }, { jobId: 'checks' }], 'c:/ONE/', now);
  assert.equal(scoped.pending.length, 1);
  assert.equal(scoped.attention.length, 1);
  assert.equal(elapsed({ startedAt: now - 61000 }, now), '1m 1s');
  assert.equal(elapsed({}, now), 'Time unavailable');
  const finished = overview(
    [
      { id: 'long', status: 'completed', startedAt: 1, endedAt: now - 1 },
      { id: 'short', status: 'completed', startedAt: now - 100, endedAt: now - 50 },
    ],
    [],
    '',
    now,
  );
  assert.equal(finished.completed[0].id, 'long', 'recent results follow completion time, including long-running tasks');
});
test('launch usage cache reads never start provider connections', async () => {
  let calls = 0;
  const service = require('../provider-usage').createProviderUsage({
    codex: async () => {
      calls++;
      return { rateLimits: { primary: { usedPercent: 20 } } };
    },
  });
  const empty = await service.read({ cachedOnly: true });
  assert.equal(calls, 0);
  assert.equal(empty.codex.remainingPercent, null);
  assert.equal(empty.claude.remainingPercent, null);
  await service.read({ refresh: true });
  const filled = await service.read({ cachedOnly: true });
  assert.equal(calls, 1);
  assert.equal(filled.codex.remainingPercent, 80);
});
