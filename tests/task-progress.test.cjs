const test = require('node:test'),
  assert = require('node:assert/strict'),
  { progress } = require('../task-progress');
test('progress estimates need comparable successful samples, show waiting and stop predicting beyond observed duration', () => {
  const active = { id: 'a', provider: 'codex', status: 'running', startedAt: 10000, prompt: 'Work' };
  assert.equal(progress([active], [], 11000)[0].estimate, null);
  const samples = [10000, 20000, 30000, 40000].map((duration, index) => ({
    id: index,
    status: 'completed',
    provider: 'codex',
    startedAt: 1,
    endedAt: 1 + duration,
  }));
  const task = progress([...samples, active], [{ jobId: 'a', title: 'Run check?' }], 11000)[0];
  assert.equal(task.estimate.samples, 4);
  assert.deepEqual(task.waiting, ['Run check?']);
  assert.equal(progress([...samples, active], [], 100000)[0].estimate.outsideRange, true);
  assert.equal(
    progress(samples.map((row) => ({ ...row, provider: 'claude' })).concat(active), [], 11000)[0].estimate,
    null,
  );
});
