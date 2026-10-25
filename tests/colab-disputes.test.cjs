const test = require('node:test'),
  assert = require('node:assert/strict'),
  { createCollaboration, parseVerdict } = require('../collaboration');
const status = (decision = 'ready', issues = [], extra = {}) =>
  'Result\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision, blockingIssues: issues, ...extra });
const f1 = { id: 'F1', criterion: 'TASK', summary: 'Add retry logic', evidence: 'client.js:40 has no retry' };
const f2 = { id: 'F2', criterion: 'TASK', summary: 'Rename the helper', evidence: 'utils.js:3' };
const dispute = { disputes: [{ id: 'F1', reason: 'The API client already retries in transport.js:12.' }] };
function harness(outputs) {
  const calls = [],
    prompts = [];
  let saved = [];
  const run = createCollaboration({
    progress() {},
    checkpoint: async (rows) => (saved = rows),
    runProvider: async (provider, prompt) => {
      calls.push(provider);
      prompts.push(prompt);
      return { output: outputs[calls.length - 1] || status() };
    },
  });
  return { run, calls, prompts, saved: () => saved };
}

test('disputes carry the builder reason, and bare disputed IDs still parse', () => {
  assert.deepEqual(parseVerdict(status('ready', [], dispute)).disputes, dispute.disputes);
  const legacy = parseVerdict(status('ready', [], { disputedIssueIds: ['F2'] }));
  assert.deepEqual(legacy.disputed, ['F2']);
  assert.deepEqual(legacy.disputes, [{ id: 'F2', reason: '' }]);
});
test('the reviewer sees the builder reason and can withdraw the blocker', async () => {
  const h = harness([status(), status('changes_requested', [f1]), status('ready', [], dispute), status()]);
  const result = await h.run({ task: 'Make the client reliable', maxRounds: 6 });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['codex', 'claude', 'codex', 'claude']);
  assert(h.prompts[3].includes('DISPUTED BLOCKERS'));
  assert(h.prompts[3].includes('already retries in transport.js:12'));
  assert(h.prompts[3].includes('either withdraw it'));
});
test('a blocker the reviewer upholds after reading the dispute pauses for the user', async () => {
  const upheld = { ...f1, evidence: 'transport.js:12 retries only GET; POST in client.js:40 still has none' };
  const h = harness([
    status(),
    status('changes_requested', [f1]),
    status('ready', [], dispute),
    status('changes_requested', [upheld]),
  ]);
  const result = await h.run({ task: 'Make the client reliable', maxRounds: 8 });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /disagree on 1 blocker/);
  assert.deepEqual(result.dispute.issues, [
    {
      id: 'F1',
      criterion: 'TASK',
      summary: 'Add retry logic',
      builderReason: 'The API client already retries in transport.js:12.',
      reviewerEvidence: upheld.evidence,
    },
  ]);
  assert.equal(h.calls.length, 4, 'no further passes run without a ruling');
});
async function paused(extraBlocker) {
  const issues = extraBlocker ? [f1, f2] : [f1];
  const first = harness([
    status(),
    status('changes_requested', issues),
    status('ready', [], dispute),
    status('changes_requested', issues),
  ]);
  await first.run({ task: 'Make the client reliable', maxRounds: 10 });
  return first.saved();
}
test('resuming a dispute requires a ruling for every disputed blocker', async () => {
  const saved = await paused();
  const h = harness([]);
  await assert.rejects(
    h.run({ task: 'Make the client reliable', maxRounds: 10, checkpoints: saved }),
    /Choose who is right/,
  );
  assert.equal(h.calls.length, 0);
});
test('ruling for the builder drops the blocker, the reviewer is told, and re-raising it is ignored', async () => {
  const h = harness([status('changes_requested', [f1])]);
  const result = await h.run({
    task: 'Make the client reliable',
    maxRounds: 10,
    checkpoints: await paused(),
    rulings: { F1: 'builder' },
  });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['claude'], 'no open blockers remain, so the reviewer reviews straight away');
  assert(h.prompts[0].includes('USER RULINGS'));
  assert(h.prompts[0].includes('"decision":"not required"'));
});
test('ruling for the reviewer sends the blocker back to the builder as required', async () => {
  const h = harness([status(), status()]);
  const result = await h.run({
    task: 'Make the client reliable',
    maxRounds: 10,
    checkpoints: await paused(),
    rulings: { F1: 'reviewer' },
  });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['codex', 'claude']);
  assert(h.prompts[0].includes('"decision":"required, must be fixed"'));
  assert(h.prompts[0].includes('"id":"F1"'));
});
test('an undisputed blocker in the same review stays open after a ruling', async () => {
  const h = harness([status(), status()]);
  await h.run({
    task: 'Make the client reliable',
    maxRounds: 10,
    checkpoints: await paused(true),
    rulings: { F1: 'builder' },
  });
  assert.deepEqual(h.calls, ['codex', 'claude'], 'the builder still fixes F2');
  assert(h.prompts[0].includes('"id":"F2"'));
  assert(!h.prompts[0].includes('OPEN BLOCKING ISSUES: [{"id":"F1"'));
});
