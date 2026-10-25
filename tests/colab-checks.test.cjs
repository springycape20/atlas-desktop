const test = require('node:test'),
  assert = require('node:assert/strict'),
  { createCollaboration } = require('../collaboration');
const status = (decision = 'ready', issues = []) =>
  'Result\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision, blockingIssues: issues });
const failed = {
  status: 'failed',
  reportPath: '/reports/checks.json',
  results: [
    { command: 'npm run lint', status: 'passed', exitCode: 0 },
    { command: 'npm test', status: 'failed', exitCode: 1, output: 'not ok 3 - totals add up' },
  ],
};
const passed = { status: 'passed', results: [{ command: 'npm test', status: 'passed', exitCode: 0 }] };
function harness(checkResults, outputs = []) {
  const calls = [],
    prompts = [],
    checks = [...checkResults];
  let verifications = 0;
  const run = createCollaboration({
    progress() {},
    verify: async () => {
      verifications++;
      return checks.length > 1 ? checks.shift() : checks[0];
    },
    runProvider: async (provider, prompt) => {
      calls.push(provider);
      prompts.push(prompt);
      return { output: outputs[calls.length - 1] || status() };
    },
  });
  return { run, calls, prompts, verifications: () => verifications };
}

test('failing checks go back to the builder before any review pass', async () => {
  const h = harness([failed, passed]);
  const result = await h.run({ task: 'Fix the totals' });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['codex', 'codex', 'claude']);
  assert(h.prompts[1].includes('"id":"CHECKS"'));
  assert(h.prompts[1].includes('npm test'));
  assert(h.prompts[1].includes('not ok 3 - totals add up'));
  assert(!h.prompts[1].includes('npm run lint,'), 'only failing commands are named in the blocker');
  assert(h.prompts[2].includes('ATLAS CHECK EVIDENCE'));
});
test('passing checks add no extra pass and run only once before the review', async () => {
  const h = harness([passed]);
  assert.equal((await h.run({ task: 'Fix the totals' })).outcome, 'completed');
  assert.deepEqual(h.calls, ['codex', 'claude']);
  assert.equal(h.verifications(), 1);
});
test('checks that still fail after one retry go to the reviewer instead of looping', async () => {
  const h = harness([failed]);
  await h.run({ task: 'Fix the totals', maxRounds: 3 });
  assert.deepEqual(h.calls, ['codex', 'codex', 'claude']);
  assert(h.prompts[2].includes('"status":"failed"'), 'the reviewer sees the failing evidence');
});
test('a check retry keeps the reviewer blockers so later reviews stay in scope', async () => {
  const blocker = { id: 'F1', criterion: 'TASK', summary: 'Rounding is wrong', evidence: 'totals.js:12' };
  const h = harness(
    // checks run after each build or fix; the review that follows reuses that result
    [passed, failed, passed],
    [status(), status('changes_requested', [blocker]), status()],
  );
  const result = await h.run({ task: 'Fix the totals', maxRounds: 6 });
  assert.equal(result.outcome, 'completed');
  // build, review (F1), fix, checks fail -> check fix, review
  assert.deepEqual(h.calls, ['codex', 'claude', 'codex', 'codex', 'claude']);
  assert(h.prompts[3].includes('"id":"F1"') && h.prompts[3].includes('"id":"CHECKS"'));
});
test('analysis-only modes never run checks', async () => {
  const h = harness([failed]);
  await h.run({ task: 'Plan the totals fix', mode: 'plan' });
  assert.equal(h.verifications(), 0);
});
