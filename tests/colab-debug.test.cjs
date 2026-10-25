const test = require('node:test'),
  assert = require('node:assert/strict'),
  { createCollaboration, parseVerdict } = require('../collaboration'),
  graph = require('../colab-graph');
const status = (decision = 'ready', extra = {}) =>
  'Result\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision, blockingIssues: [], ...extra });
const reproduction = {
  steps: 'Add two items priced 0.1 and 0.2 to the cart',
  command: 'npm test -- cart',
  files: ['tests/cart.test.js'],
  observed: 'Total shows 0.30000000000000004',
  expected: 'Total shows 0.30',
};
function harness(outputs, checks = []) {
  const calls = [],
    prompts = [],
    settings = [],
    results = [...checks];
  let verifications = 0;
  const run = createCollaboration({
    progress() {},
    verify: async () => {
      verifications++;
      return results.length > 1 ? results.shift() : results[0] || null;
    },
    runProvider: async (provider, prompt, _cwd, passSettings) => {
      calls.push(provider);
      prompts.push(prompt);
      settings.push(passSettings);
      return { output: outputs[calls.length - 1] || status() };
    },
  });
  return { run, calls, prompts, settings, verifications: () => verifications };
}
const failing = { status: 'failed', results: [{ command: 'npm test', status: 'failed', exitCode: 1 }] },
  passing = { status: 'passed', results: [{ command: 'npm test', status: 'passed', exitCode: 0 }] };

test('debug reproduces first, then fixes, then confirms the reproduction passes', async () => {
  const h = harness([status('ready', { reproduction })], [failing, passing]);
  const result = await h.run({ task: 'Cart totals show rounding noise', mode: 'debug' });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['claude', 'codex', 'claude'], 'the reviewer reproduces, the builder fixes');
  assert.match(h.prompts[0], /reproducing a reported bug/);
  assert.match(h.prompts[0], /Do not fix the bug/);
  assert.equal(h.settings[0].readOnly, undefined, 'the reproducer may write a failing test');
  assert(h.prompts[1].includes('ATLAS checks before the fix: failed'));
  assert(h.prompts[1].includes('Total shows 0.30000000000000004'));
  assert.match(h.prompts[1], /Do not weaken, skip or delete the reproduction/);
  assert.match(h.prompts[2], /confirm the reproduction now passes/);
  assert(result.criteria.some((row) => row.id === 'REPRO' && row.text.includes('Total shows 0.30')));
});
test('a bug that cannot be reproduced stops before any fix', async () => {
  const blocked = harness([status('blocked')]);
  assert.equal((await blocked.run({ task: 'Cart totals', mode: 'debug' })).outcome, 'needs_attention');
  assert.deepEqual(blocked.calls, ['claude']);
  const vague = harness([status('ready')]);
  const result = await vague.run({ task: 'Cart totals', mode: 'debug' });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /not reproduced/);
  assert.deepEqual(vague.calls, ['claude']);
});
test('debug ignores competing proposals and starts from the reproduction', async () => {
  const h = harness([status('ready', { reproduction })], [failing, passing]);
  await h.run({ task: 'Cart totals', mode: 'debug', roles: 'proposals', rolesExplicit: true });
  assert.deepEqual(h.calls, ['claude', 'codex', 'claude']);
});
test('without configured checks the reproduction is marked as not confirmed by ATLAS', async () => {
  const h = harness([status('ready', { reproduction })]);
  await h.run({ task: 'Cart totals', mode: 'debug' });
  assert(h.prompts[1].includes('ATLAS checks before the fix: not configured'));
});
test('a pass limit below reproduce, fix and review says the debug run is incomplete', async () => {
  const h = harness([status('ready', { reproduction })], [failing]);
  const result = await h.run({ task: 'Cart totals', mode: 'debug', maxRounds: 2 });
  assert.equal(result.outcome, 'limit_reached');
  assert.match(result.limitation, /full 3-pass collaboration/);
});
test('reproduction details are bounded and empty ones are ignored', () => {
  const parsed = parseVerdict(status('ready', { reproduction: { ...reproduction, files: Array(20).fill('a.js') } }));
  assert.equal(parsed.reproduction.files.length, 10);
  assert.equal(parseVerdict(status('ready', { reproduction: { files: ['a.js'] } })).reproduction, null);
});
test('the task graph shows the reproduction feeding the fix', () => {
  const built = graph.build({
    task: 'Cart totals',
    reports: [
      { provider: 'claude', phase: 'reproduce', decision: 'ready', output: 'Reproduced' },
      { provider: 'codex', phase: 'build', decision: 'ready', output: 'Fixed' },
    ],
    state: {},
  });
  assert(built.nodes.some((node) => node.label?.startsWith('Reproduce bug')));
  assert(built.edges.some((edge) => edge.kind === 'reproduces'));
  assert(built.edges.some((edge) => edge.kind === 'informs'));
});
