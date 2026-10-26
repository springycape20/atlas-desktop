const test = require('node:test'),
  assert = require('node:assert/strict'),
  { createCollaboration } = require('../collaboration'),
  graph = require('../colab-graph');
const status = (decision = 'ready', issues = [], extra = {}) =>
  'Result\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision, blockingIssues: issues, ...extra });
const blocker = (id) => ({ id, criterion: 'TASK', summary: 'Required fix ' + id, evidence: 'cart.js:12 ' + id });
// Reviews return the given outputs in order; builds always succeed. Sessions are numbered per call.
function harness(reviewOutputs) {
  const calls = [],
    queue = [...reviewOutputs];
  const run = createCollaboration({
    progress() {},
    runProvider: async (provider, prompt, _cwd, _settings, session) => {
      calls.push({ provider, prompt, session });
      if (provider === 'claude') return { output: queue.shift() || status(), sessionId: 'review-' + calls.length };
      return { output: status() };
    },
    checkpoint: async (reports) => (run.saved = reports),
  });
  return { run, calls, reviews: () => calls.filter((call) => call.provider === 'claude') };
}

test('a task approved on its first review completes without an extra pass', async () => {
  const h = harness([status()]);
  const result = await h.run({ task: 'Fix totals' });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(
    h.calls.map((call) => call.provider),
    ['codex', 'claude'],
  );
});
test('approval after a fix cycle is confirmed by one fresh reviewer that checks the whole task', async () => {
  const h = harness([
    status('changes_requested', [blocker('F1')]),
    status('ready'),
    status('ready', [], { userResponse: 'Totals are fixed and verified as a whole' }),
  ]);
  const result = await h.run({ task: 'Fix totals' });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(
    h.calls.map((call) => call.provider),
    ['codex', 'claude', 'codex', 'claude', 'claude'],
  );
  const [first, resumed, fresh] = h.reviews();
  assert.equal(first.session, '');
  assert.equal(resumed.session, 'review-2', 'the review after the fix resumes its own session');
  assert.equal(fresh.session, '', 'the acceptance review starts a fresh session');
  assert.match(fresh.prompt, /have not seen earlier reviews/);
  assert.doesNotMatch(fresh.prompt, /inspect only the open issues/);
  assert.equal(result.output, 'Totals are fixed and verified as a whole');
  assert.equal(h.run.saved.at(-1).acceptance, true);
  const built = graph.build({ task: 'Fix totals', reports: h.run.saved });
  assert.equal(built.nodes.find((node) => node.id === 'pass:4').label, 'Final review · 5');
});
test('the fresh reviewer may raise new blockers once; its own session decides after the fix', async () => {
  const h = harness([
    status('changes_requested', [blocker('F1')]),
    status('ready'),
    status('changes_requested', [blocker('F2')]),
    status('ready'),
  ]);
  const result = await h.run({ task: 'Fix totals' });
  assert.equal(result.outcome, 'completed', 'a new blocker from the fresh review is not treated as scope creep');
  assert.deepEqual(
    h.calls.map((call) => call.provider),
    ['codex', 'claude', 'codex', 'claude', 'claude', 'codex', 'claude'],
  );
  const reviews = h.reviews();
  assert.equal(reviews[3].session, 'review-5', 'the review after its fix continues the fresh session');
  assert.match(h.calls[5].prompt, /"id":"F2"/);
  assert.doesNotMatch(reviews[3].prompt, /have not seen earlier reviews/, 'there is no second fresh round');
});
test('after the fresh review, new blockers again need regression evidence', async () => {
  const h = harness([
    status('changes_requested', [blocker('F1')]),
    status('ready'),
    status('changes_requested', [blocker('F2')]),
    status('changes_requested', [blocker('F3')]),
  ]);
  const result = await h.run({ task: 'Fix totals' });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /new issue outside the agreed fix list.*F3/);
});
test('a pass limit that cuts off the fresh review says so', async () => {
  const h = harness([status('changes_requested', [blocker('F1')]), status('ready')]);
  const result = await h.run({ task: 'Fix totals', maxRounds: 4 });
  assert.equal(result.outcome, 'limit_reached');
  assert.match(result.limitation, /fresh acceptance review of the whole task did not run/);
});
test('milestone tasks keep their own final review and get no second fresh round', async () => {
  const plan = ['Model', 'API', 'Docs'].map((title) => ({ title, criteria: [title + ' works'] }));
  const outputs = [
    status('changes_requested', [blocker('F1')]), // M1 review, after the plan review below
  ];
  const calls = [];
  let reviewCount = 0;
  const run = createCollaboration({
    progress() {},
    runProvider: async (provider, prompt, _cwd, _settings, session) => {
      calls.push({ provider, prompt, session });
      if (provider === 'codex')
        return { output: calls.length === 1 ? status('ready', [], { milestones: plan }) : status() };
      reviewCount++;
      // plan review, then M1 review asks for a fix, then everything is approved
      return { output: reviewCount === 2 ? outputs[0] : status(), sessionId: 'review-' + calls.length };
    },
  });
  const result = await run({ task: 'Store totals in cents across model, API and docs' });
  assert.equal(result.outcome, 'completed');
  const finals = calls.filter((call) => /have not seen earlier reviews/.test(call.prompt));
  assert.equal(finals.length, 0, 'no fix-cycle fresh review inside milestone tasks');
  assert.equal(
    calls.filter((call) => /final acceptance review of a task built in milestones/.test(call.prompt)).length,
    1,
  );
});
test('a task saved before its fresh review resumes with a fresh reviewer, not the old session', async () => {
  const h = harness([status('ready', [], { userResponse: 'Confirmed after resume' })]);
  const result = await h.run({
    task: 'Fix totals',
    checkpoints: [
      {
        provider: 'claude',
        phase: 'review',
        output: 'Approved the fix',
        state: {
          phase: 'review',
          criteria: [{ id: 'TASK', text: 'Fix totals' }],
          openIssues: [],
          stalls: 0,
          artifact: 0,
          outcome: '',
          reason: '',
          reviewed: true,
          reviewSession: 'old-review',
          freshReview: true,
          freshReviewDone: true,
          finalReviewSession: '',
        },
      },
    ],
  });
  assert.equal(result.outcome, 'completed');
  assert.equal(h.reviews().length, 1, 'only the fresh review runs, then the task completes');
  assert.equal(h.reviews()[0].session, '');
  assert.match(h.reviews()[0].prompt, /have not seen earlier reviews/);
});
