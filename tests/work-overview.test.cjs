const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bucket, sameProject, summary, title } = require('../work-overview');
test('task views separate stopped and failed work from running and history', () => {
  assert.equal(bucket({ status: 'running' }), 'active');
  for (const status of ['paused', 'failed', 'needs_attention', 'limit_reached'])
    assert.equal(bucket({ status }), 'attention');
  assert.equal(bucket({ status: 'completed', verification: { status: 'failed' } }), 'attention');
  assert.equal(bucket({ status: 'cancelled' }), 'history');
});
test('project home includes isolated tasks through their original folder, without prefix collisions', () => {
  assert(sameProject({ originalCwd: 'C:\\Work\\App\\', cwd: 'C:/Trials/one' }, 'c:/work/app'));
  assert(!sameProject({ cwd: 'C:/Work/Application' }, 'c:/work/app'));
  assert(!sameProject({ cwd: '' }, ''));
  const result = summary(
    [
      { id: 'old', cwd: 'C:/a', status: 'completed', startedAt: 1 },
      { id: 'new', originalCwd: 'c:/A', status: 'running', startedAt: 2 },
      { cwd: 'C:/b', status: 'failed' },
    ],
    'C:/a',
  );
  assert.equal(result.active[0].id, 'new');
  assert.equal(result.history.length, 1);
  assert.equal(result.attention.length, 0);
});
test('task display title is compact and respects an explicit rename', () => {
  assert.equal(title({ title: '  Fix  updater\nrecovery ', prompt: 'long request' }), 'Fix updater recovery');
  assert.equal(title({ prompt: 'x'.repeat(200) }).length, 90);
});
