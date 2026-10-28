const test = require('node:test');
const assert = require('node:assert/strict');
const { recoverSavedJob } = require('../task-recovery');
test('crashed jobs recover paused with stages and file checkpoints, without replaying work', () => {
  const saved = {
    id: 'one',
    status: 'running',
    changeId: 'checkpoint',
    request: { task: 'Build' },
    checkpoints: [{ phase: 'build', output: 'Built' }],
    sessions: { codex: 'session' },
  };
  const value = recoverSavedJob(saved);
  assert.equal(value.status, 'paused');
  assert.match(value.recoveryNote, /has not replayed/);
  assert.equal(value.changeId, 'checkpoint');
  assert.deepEqual(value.checkpoints, saved.checkpoints);
  assert.equal(saved.status, 'running');
  assert.equal(recoverSavedJob({ status: 'completed', statusText: 'Done' }).statusText, 'Done');
});
