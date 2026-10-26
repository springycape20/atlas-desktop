const test = require('node:test'),
  assert = require('node:assert/strict'),
  { createCollaboration, parseVerdict } = require('../collaboration'),
  { runReproduction } = require('../reproduction-runner'),
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
const fail = { status: 'failed', exitCode: 1, output: 'not ok 1 - cart total' },
  pass = { status: 'passed', exitCode: 0, output: 'ok 1 - cart total' };
// ATLAS runs each reproduction through the real runner; only the process result is faked.
function harness(outputs, runs = [], { choice = 'Allow', fingerprint = null } = {}) {
  const calls = [],
    prompts = [],
    settings = [],
    reproduced = [],
    asked = [],
    queue = [...runs];
  const run = createCollaboration({
    progress() {},
    fingerprint: async () => (fingerprint ? { complete: true, value: fingerprint } : null),
    reproduce: (command, phase) =>
      runReproduction(command, {
        cwd: 'C:\\work\\cart',
        phase,
        project: { checkCommands: 'npm run lint' },
        ask: async (request) => {
          asked.push(request);
          return choice;
        },
        runner: async (value) => {
          reproduced.push({ command: value, phase });
          return { command: value, ...(queue.length > 1 ? queue.shift() : queue[0]) };
        },
      }),
    runProvider: async (provider, prompt, _cwd, passSettings) => {
      calls.push(provider);
      prompts.push(prompt);
      settings.push(passSettings);
      return { output: outputs[calls.length - 1] || status() };
    },
  });
  return { run, calls, prompts, settings, reproduced, asked };
}

test('debug reproduces first, ATLAS confirms it fails, then the fix must make it pass', async () => {
  const h = harness([status('ready', { reproduction })], [fail, pass]);
  const result = await h.run({ task: 'Cart totals show rounding noise', mode: 'debug' });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['claude', 'codex', 'claude'], 'the reviewer reproduces, the builder fixes');
  assert.deepEqual(h.reproduced, [
    { command: 'npm test -- cart', phase: 'before' },
    { command: 'npm test -- cart', phase: 'after' },
  ]);
  assert.match(h.prompts[0], /reproducing a reported bug/);
  assert.match(h.prompts[0], /Do not fix the bug/);
  assert.equal(h.settings[0].readOnly, undefined, 'the reproducer may write a failing test');
  assert(h.prompts[1].includes('ATLAS ran the command before the fix: failed, exit 1'));
  assert(h.prompts[1].includes('Total shows 0.30000000000000004'));
  assert.match(h.prompts[1], /Do not weaken, skip or delete the reproduction/);
  assert(h.prompts[2].includes('latest ATLAS run after the fix: passed, exit 0'));
  assert.match(h.prompts[2], /ATLAS reran the reproduction after the fix and it passed/);
  assert(result.criteria.some((row) => row.id === 'REPRO' && row.text.includes('Total shows 0.30')));
  assert.equal(result.reproduction.before.exitCode, 1);
  assert.equal(result.reproduction.after.exitCode, 0);
});
test('an unconfigured reproduction command asks with identical details before and after the fix', async () => {
  const h = harness([status('ready', { reproduction })], [fail, pass]);
  await h.run({ task: 'Cart totals', mode: 'debug' });
  assert.equal(h.asked.length, 2, 'this fake answers each ask; the real manager remembers Allow');
  assert.equal(h.asked[0].details, h.asked[1].details);
  assert(h.asked[0].details.includes('Command: npm test -- cart'));
});
test('a reproduction that passes before any fix stops before the build', async () => {
  const h = harness([status('ready', { reproduction })], [pass]);
  const result = await h.run({ task: 'Cart totals', mode: 'debug' });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /passed before any fix/);
  assert.deepEqual(h.calls, ['claude']);
});
test('a declined, missing, or hanging reproduction is not accepted', async () => {
  const denied = harness([status('ready', { reproduction })], [fail], { choice: 'Deny' });
  const refused = await denied.run({ task: 'Cart totals', mode: 'debug' });
  assert.match(refused.limitation, /not approved/);
  assert.equal(denied.reproduced.length, 0);
  const commandless = harness([status('ready', { reproduction: { ...reproduction, command: '' } })], [fail]);
  assert.match((await commandless.run({ task: 'Cart totals', mode: 'debug' })).limitation, /no command ATLAS can run/);
  const hang = harness([status('ready', { reproduction })], [{ status: 'timed-out', exitCode: null }]);
  assert.match((await hang.run({ task: 'Cart totals', mode: 'debug' })).limitation, /did not fail with an exit code/);
  for (const h of [denied, commandless, hang]) assert.deepEqual(h.calls, ['claude']);
});
test('without a way to run commands, debug mode cannot confirm the bug', async () => {
  const calls = [],
    run = createCollaboration({
      progress() {},
      runProvider: async (provider) => {
        calls.push(provider);
        return { output: status('ready', { reproduction }) };
      },
    });
  const result = await run({ task: 'Cart totals', mode: 'debug' });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /cannot run reproduction commands/);
  assert.deepEqual(calls, ['claude']);
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
  assert.equal(vague.reproduced.length, 0);
});
test('a reproduction still failing after the fix goes back to the builder without a review pass', async () => {
  const h = harness([status('ready', { reproduction })], [fail, fail, pass]);
  const result = await h.run({ task: 'Cart totals', mode: 'debug' });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['claude', 'codex', 'codex', 'claude']);
  assert(h.prompts[2].includes('"id":"REPRO"'));
  assert(h.prompts[2].includes('not ok 1 - cart total'));
  assert(h.prompts[3].includes('OPEN BLOCKING ISSUES: []'), 'a passing run clears the blocker before review');
});
test('a reproduction that keeps failing pauses after the build and two fixes', async () => {
  const h = harness([status('ready', { reproduction })], [fail]);
  const result = await h.run({ task: 'Cart totals', mode: 'debug' });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /still fails after the build and two fixes/);
  assert.deepEqual(h.calls, ['claude', 'codex', 'codex', 'codex'], 'no review is spent on a failing reproduction');
});
test('declining the rerun after the fix stops instead of reviewing', async () => {
  const outputs = [status('ready', { reproduction })];
  let asks = 0;
  const calls = [],
    run = createCollaboration({
      progress() {},
      reproduce: (command, phase) =>
        runReproduction(command, {
          phase,
          ask: async () => (asks++ ? 'Deny' : 'Allow once'),
          runner: async () => fail,
        }),
      runProvider: async (provider) => {
        calls.push(provider);
        return { output: outputs[calls.length - 1] || status() };
      },
    });
  const result = await run({ task: 'Cart totals', mode: 'debug' });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /could not rerun the reproduction/);
  assert.deepEqual(calls, ['claude', 'codex']);
});
function savedReview(reproductionState) {
  return [
    {
      provider: 'codex',
      phase: 'build',
      output: 'Fixed',
      state: {
        phase: 'review',
        criteria: [
          { id: 'TASK', text: 'Cart totals' },
          { id: 'REPRO', text: 'The reproduced bug no longer occurs' },
        ],
        openIssues: [],
        stalls: 0,
        artifact: 0,
        outcome: '',
        reason: '',
        fingerprint: 'A',
        reproduction: { ...reproduction, by: 'claude', ...reproductionState },
      },
    },
  ];
}
test('a resume with changed files reruns the reproduction before any review', async () => {
  const h = harness([status('ready')], [fail, pass], { fingerprint: 'B' });
  const result = await h.run({
    task: 'Cart totals',
    mode: 'debug',
    checkpoints: savedReview({
      before: { status: 'failed', exitCode: 1 },
      after: { status: 'passed', exitCode: 0, fingerprint: 'A' },
    }),
  });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['codex', 'claude'], 'the failing rerun goes to a fix, not to the reviewer');
  assert.deepEqual(
    h.reproduced.map((row) => row.phase),
    ['after', 'after'],
    'the saved before-fix run is not repeated',
  );
});
test('a resume with unchanged files reviews without rerunning the reproduction', async () => {
  const h = harness([status('ready')], [fail], { fingerprint: 'A' });
  const result = await h.run({
    task: 'Cart totals',
    mode: 'debug',
    checkpoints: savedReview({
      before: { status: 'failed', exitCode: 1 },
      after: { status: 'passed', exitCode: 0, fingerprint: 'A' },
    }),
  });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['claude']);
  assert.equal(h.reproduced.length, 0);
});
test('older checkpoints without an ATLAS run must still pass the reproduction before review', async () => {
  const h = harness([status('ready')], [pass]);
  const result = await h.run({
    task: 'Cart totals',
    mode: 'debug',
    checkpoints: savedReview({ checksBeforeFix: 'not configured' }),
  });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['claude']);
  assert.deepEqual(h.reproduced, [{ command: 'npm test -- cart', phase: 'after' }]);
  assert(h.prompts[0].includes('not confirmed by an ATLAS run before the fix'));
});
test('debug ignores competing proposals and starts from the reproduction', async () => {
  const h = harness([status('ready', { reproduction })], [fail, pass]);
  await h.run({ task: 'Cart totals', mode: 'debug', roles: 'proposals', rolesExplicit: true });
  assert.deepEqual(h.calls, ['claude', 'codex', 'claude']);
});
test('a pass limit below reproduce, fix and review says the debug run is incomplete', async () => {
  const h = harness([status('ready', { reproduction })], [fail, pass]);
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
test('the task graph shows the ATLAS reproduction runs beside the stages they gate', () => {
  const built = graph.build({
    task: 'Cart totals',
    reports: [
      { provider: 'claude', phase: 'reproduce', decision: 'ready', output: 'Reproduced' },
      { provider: 'codex', phase: 'build', decision: 'ready', output: 'Fixed' },
    ],
    state: {
      reproduction: {
        ...reproduction,
        before: { command: 'npm test -- cart', status: 'failed', exitCode: 1, output: 'not ok' },
        after: { command: 'npm test -- cart', status: 'passed', exitCode: 0, output: 'ok' },
      },
    },
  });
  const before = built.nodes.find((node) => node.id === 'reproduction:before'),
    after = built.nodes.find((node) => node.id === 'reproduction:after');
  assert.equal(before.label, 'Reproduction before fix · exit 1');
  assert.equal(after.label, 'Reproduction after fix · exit 0');
  assert.equal(before.origin, 'ATLAS executed');
  assert(built.edges.some((edge) => edge.source === 'pass:0' && edge.target === 'reproduction:before'));
  assert(built.edges.some((edge) => edge.source === 'pass:1' && edge.target === 'reproduction:after'));
  const rejected = graph.build({
    task: 'Cart totals',
    reports: [{ provider: 'claude', phase: 'reproduce', decision: 'ready', output: 'Reproduced' }],
    state: { rejectedReproduction: { command: 'npm test -- cart', status: 'denied', exitCode: null } },
  });
  assert.equal(
    rejected.nodes.find((node) => node.id === 'reproduction:before').label,
    'Reproduction before fix · denied',
  );
});
