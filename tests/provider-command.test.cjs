const test = require('node:test'),
  assert = require('node:assert/strict'),
  { runProviderCommand } = require('../provider-command'),
  { runReproduction } = require('../reproduction-runner');
function options(asked, ran, extra = {}) {
  return {
    cwd: 'C:\\work\\cart',
    project: { checkCommands: 'npm test' },
    ask: async (request) => {
      asked.push(request);
      return 'Allow';
    },
    runner: async (command) => {
      ran.push(command);
      return { command, status: 'passed', exitCode: 0 };
    },
    ...extra,
  };
}

test('each kind of provider command explains itself in its approval request', async () => {
  const asked = [],
    ran = [];
  await runProviderCommand('npm test -- totals', {
    ...options(asked, ran),
    phase: 'M2',
    title: 'Run the milestone check?',
    purpose: 'ATLAS runs this check for milestone M2.',
  });
  await runReproduction('npm test -- totals', options(asked, ran));
  assert.equal(asked[0].title, 'Run the milestone check?');
  assert(asked[0].details.startsWith('ATLAS runs this check for milestone M2.'));
  assert.equal(asked[1].title, 'Run the bug reproduction?');
  assert.notEqual(asked[0].details, asked[1].details, 'approving one kind never approves the other');
  assert.deepEqual(ran, ['npm test -- totals', 'npm test -- totals']);
});
test('a configured check runs without asking whatever the command is for', async () => {
  const asked = [],
    ran = [];
  const run = await runProviderCommand('npm test', { ...options(asked, ran), phase: 'M1' });
  assert.equal(asked.length, 0);
  assert.equal(run.approval, 'configured check');
  assert.equal(run.phase, 'M1');
});
test('a missing command is reported instead of run', async () => {
  const asked = [],
    ran = [];
  const run = await runProviderCommand('', options(asked, ran));
  assert.equal(run.status, 'missing');
  assert.equal(asked.length + ran.length, 0);
});
