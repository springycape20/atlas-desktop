const test = require('node:test'),
  assert = require('node:assert/strict'),
  { verificationBadge, completeStatus } = require('../verification-badge');
const checks = (status, results = []) => ({ status, results });
const completed = (extra = {}) => ({ outcome: 'completed', ...extra });
const milestone = (id, extra = {}) => ({ id, status: 'done', check: '', ...extra });

test('a task with no ATLAS checks is unverified and says why', () => {
  const badge = verificationBadge({
    verification: { status: 'not-checked', results: [], reason: 'Automatic checks are disabled for this project.' },
    result: completed(),
  });
  assert.equal(badge.level, 'unverified');
  assert.equal(badge.label, 'Unverified');
  assert.match(badge.reason, /only the reviewer accepted/);
  assert.match(badge.reason, /disabled for this project/);
  assert.equal(completeStatus(badge), 'Complete · unverified');
});
test('passing project checks verify the task, failing ones name the commands', () => {
  assert.equal(verificationBadge({ verification: checks('passed'), result: completed() }).level, 'passed');
  const failed = verificationBadge({
    verification: checks('failed', [
      { command: 'npm run lint', status: 'passed', exitCode: 0 },
      { command: 'npm test', status: 'failed', exitCode: 1 },
    ]),
    result: completed(),
  });
  assert.equal(failed.level, 'failed');
  assert.equal(failed.reason, 'Failed: npm test.');
  assert.equal(completeStatus(failed), 'Complete · checks failed');
});
test('a passing debug reproduction counts as ATLAS verification', () => {
  const badge = verificationBadge({
    verification: checks('not-checked'),
    result: completed({ reproduction: { after: { status: 'passed', exitCode: 0 } } }),
  });
  assert.equal(badge.level, 'passed');
  assert.match(badge.reason, /bug reproduction/);
});
test('milestone tasks are partly verified when some milestones had no check', () => {
  const result = completed({
    milestones: [
      milestone('M1', { check: 'npm test -- a', checkRun: { status: 'passed', exitCode: 0 } }),
      milestone('M2', { check: 'npm test -- b', checkRun: { status: 'passed', exitCode: 0 } }),
      milestone('M3'),
    ],
  });
  const partial = verificationBadge({ verification: checks('not-checked'), result });
  assert.equal(partial.level, 'partial');
  assert.match(partial.reason, /checks for M1, M2; M3 had no check/);
  assert.equal(completeStatus(partial), 'Complete · partly verified');
  assert.equal(
    verificationBadge({ verification: checks('passed'), result }).level,
    'passed',
    'project checks cover milestones without their own check',
  );
  const none = verificationBadge({
    verification: checks('not-checked'),
    result: completed({ milestones: [milestone('M1'), milestone('M2'), milestone('M3')] }),
  });
  assert.equal(none.level, 'unverified');
});
test('unfinished tasks and tasks that changed no files get no badge', () => {
  assert.equal(
    verificationBadge({ verification: checks('not-checked'), result: { outcome: 'needs_attention' } }),
    null,
  );
  assert.equal(verificationBadge({ verification: checks('not-checked'), result: completed(), changedFiles: 0 }), null);
  assert.equal(
    verificationBadge({ verification: checks('failed'), result: completed(), changedFiles: 0 }).level,
    'failed',
    'failed checks show even when nothing changed',
  );
  assert.equal(completeStatus(null), 'Complete');
  assert.equal(
    verificationBadge({ verification: checks('not-checked'), result: completed(), changedFiles: null }).level,
    'unverified',
    'an unknown change count still shows the badge',
  );
});
