const test = require('node:test'),
  assert = require('node:assert/strict'),
  { runReproduction, failsAsExpected, passes, summarize } = require('../reproduction-runner');
function harness({
  choice = 'Allow',
  policy = null,
  result = { status: 'failed', exitCode: 1, output: 'not ok' },
} = {}) {
  const asked = [],
    ran = [];
  return {
    asked,
    ran,
    options: {
      cwd: 'C:\\work\\cart',
      project: { checkCommands: 'npm run lint\nnpm test\n' },
      ask: async (request) => {
        asked.push(request);
        return choice;
      },
      assess: policy ? async () => policy : undefined,
      runner: async (command, cwd, options) => {
        ran.push({ command, cwd, options });
        return { command, ...result };
      },
    },
  };
}

test('a configured check command runs without asking', async () => {
  const h = harness();
  const run = await runReproduction(' npm test ', { ...h.options, phase: 'before' });
  assert.equal(h.asked.length, 0);
  assert.equal(h.ran[0].command, 'npm test');
  assert.equal(h.ran[0].cwd, 'C:\\work\\cart');
  assert.equal(run.approval, 'configured check');
  assert.equal(run.phase, 'before');
  assert(failsAsExpected(run));
});
test('other commands ask for approval with the exact command and folder', async () => {
  const h = harness({ policy: { auto: false, reason: 'This command runs code.' } });
  const run = await runReproduction('npm test -- cart', h.options);
  assert.equal(h.asked.length, 1);
  assert.equal(h.asked[0].title, 'Run the bug reproduction?');
  assert(h.asked[0].details.includes('Command: npm test -- cart'));
  assert(h.asked[0].details.includes('Folder: C:\\work\\cart'));
  assert(h.asked[0].details.includes('This command runs code.'));
  assert.equal(run.approval, 'approved');
  assert.equal(h.ran[0].command, 'npm test -- cart');
});
test('approval details match before and after the fix so one Allow covers both runs', async () => {
  const h = harness();
  await runReproduction('npm test -- cart', { ...h.options, phase: 'before' });
  await runReproduction('npm test -- cart', { ...h.options, phase: 'after' });
  assert.equal(h.asked[0].details, h.asked[1].details);
  assert.equal(h.asked[0].title, h.asked[1].title);
});
test('a declined reproduction is not run', async () => {
  for (const choice of ['Deny', null]) {
    const h = harness({ choice });
    const run = await runReproduction('npm test -- cart', h.options);
    assert.equal(run.status, 'denied');
    assert.equal(h.ran.length, 0);
  }
});
test('commands the routine policy accepts run in their scoped form without asking', async () => {
  const scoped = "Set-Location -LiteralPath 'C:\\work\\cart'; Get-Content 'out.txt'";
  const h = harness({ policy: { auto: true, arguments: { command: scoped } } });
  const run = await runReproduction('Get-Content out.txt', h.options);
  assert.equal(h.asked.length, 0);
  assert.equal(h.ran[0].command, scoped);
  assert.equal(run.command, 'Get-Content out.txt', 'the original command is what the task records');
  assert.equal(run.approval, 'routine command policy');
});
test('a reproduction without a command is reported instead of run', async () => {
  const h = harness();
  const run = await runReproduction('   ', h.options);
  assert.equal(run.status, 'missing');
  assert.equal(h.ran.length + h.asked.length, 0);
});
test('a stopped task does not ask for approval', async () => {
  const h = harness(),
    controller = new AbortController();
  controller.abort();
  const run = await runReproduction('npm test -- cart', { ...h.options, signal: controller.signal });
  assert.equal(run.status, 'cancelled');
  assert.equal(h.asked.length, 0);
});
test('only a real non-zero exit counts as reproducing the bug', () => {
  assert(failsAsExpected({ status: 'failed', exitCode: 1 }));
  assert(!failsAsExpected({ status: 'failed', exitCode: null }), 'a command that could not start');
  assert(!failsAsExpected({ status: 'timed-out', exitCode: 1 }), 'a hang is not a failing exit');
  assert(!failsAsExpected({ status: 'passed', exitCode: 0 }));
  assert(passes({ status: 'passed', exitCode: 0 }));
  assert(!passes({ status: 'cancelled', exitCode: 0 }));
});
test('saved run summaries are bounded', () => {
  const saved = summarize(
    { phase: 'after', status: 'failed', exitCode: 2, approval: 'approved', output: 'x'.repeat(10000) },
    'abc',
  );
  assert.equal(saved.output.length, 2000);
  assert.equal(saved.fingerprint, 'abc');
  assert.equal(saved.exitCode, 2);
});
