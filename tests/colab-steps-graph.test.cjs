const test = require('node:test'),
  assert = require('node:assert/strict'),
  graph = require('../colab-graph'),
  { createCollaboration } = require('../collaboration');
const step = (text, extra = {}) => ({
  type: 'command',
  provider: 'codex',
  text,
  status: 'completed',
  startedAt: 1000,
  endedAt: 3500,
  ...extra,
});
const stage = (steps, extra = {}) => ({
  provider: 'codex',
  phase: 'build',
  decision: 'ready',
  output: 'Built',
  steps,
  ...extra,
});

test('each stage gets a chain of step nodes, failures always included', () => {
  const steps = [
    step('npm ci'),
    { type: 'file', provider: 'codex', text: 'update: src/cart.js', status: 'completed', startedAt: 1, endedAt: 2 },
    step('npm test', { status: 'failed', exitCode: 1 }),
    { type: 'search', provider: 'codex', text: 'Search: float rounding', status: 'completed' },
    { type: 'gateway', provider: 'codex', text: 'Tool: windows / Click', status: 'completed' },
  ];
  const built = graph.build({ task: 'Totals', reports: [stage(steps)] });
  const ids = built.nodes.filter((node) => node.kind === 'step').map((node) => node.id);
  assert.deepEqual(ids, ['pass:0:step:0', 'pass:0:step:1', 'pass:0:step:2', 'pass:0:step:3', 'pass:0:step:4']);
  const byId = (id) => built.nodes.find((node) => node.id === id),
    linked = (source, target, kind) =>
      built.edges.some((e) => e.source === source && e.target === target && e.kind === kind);
  assert.equal(byId('pass:0:step:0').label, '$ npm ci');
  assert.equal(byId('pass:0:step:1').label, 'Files: update: src/cart.js');
  assert.equal(byId('pass:0:step:2').label, '$ npm test · exit 1');
  assert.equal(byId('pass:0:step:2').status, 'failed');
  assert.equal(byId('pass:0:step:3').label, 'Search: float rounding');
  assert.equal(byId('pass:0:step:4').label, 'ATLAS gateway: windows / Click');
  assert.equal(byId('pass:0:step:4').origin, 'ATLAS gateway');
  assert.equal(byId('pass:0:step:0').origin, 'provider reported');
  assert.match(byId('pass:0:step:0').detail, /Duration: 2\.5 s/);
  assert(linked('pass:0', 'pass:0:step:0', 'runs'));
  assert(linked('pass:0:step:0', 'pass:0:step:1', 'then'));
  assert(linked('pass:0:step:3', 'pass:0:step:4', 'then'));
});
test('long step lists keep failures, the earliest others and a "more" node, with every step in details', () => {
  const steps = Array.from({ length: 20 }, (_, i) =>
    step('cmd ' + i, i === 15 ? { status: 'failed', exitCode: 2 } : {}),
  );
  const built = graph.build({ task: 'Totals', reports: [stage(steps, { stepsOmitted: 4 })] });
  const shown = built.nodes.filter((node) => node.kind === 'step' && node.status !== 'summary');
  assert.equal(shown.length, 8, 'one stage allows up to eight step nodes');
  assert(
    shown.some((node) => node.id === 'pass:0:step:15'),
    'a late failure is still shown',
  );
  assert.equal(built.nodes.find((node) => node.id === 'pass:0:steps-more').label, '+16 more steps');
  const detail = built.nodes.find((node) => node.id === 'pass:0').detail;
  assert.match(detail, /Steps \(20 shown, 4 more not recorded; provider-reported unless marked ATLAS gateway\):/);
  assert.match(detail, /16\. \$ cmd 15 · exit 2 · failed · 2\.5 s/);
  assert.match(detail, /20\. \$ cmd 19/);
});
test('tasks with many stages get fewer step nodes per stage, down to three', () => {
  const reports = Array.from({ length: 40 }, () => stage(Array.from({ length: 10 }, (_, i) => step('c' + i))));
  const built = graph.build({ task: 'Totals', reports });
  const perStage = built.nodes.filter((node) => node.id.startsWith('pass:0:step:')).length;
  assert.equal(perStage, 3);
  assert(built.nodes.length <= graph.MAX_NODES);
  assert(built.nodes.filter((node) => node.kind === 'stage').length === 40, 'stages are never dropped for steps');
});
test('the running stage shows its live steps and finished graphs keep step statuses', () => {
  const live = graph.build({
    task: 'Totals',
    reports: [],
    active: { phase: 'build', provider: 'codex', steps: [step('npm test', { status: 'running', endedAt: null })] },
  });
  const running = live.nodes.find((node) => node.id === 'active:step:0');
  assert.equal(running.status, 'running');
  assert.match(live.nodes.find((node) => node.id === 'active').detail, /Steps \(1; provider-reported/);
  const done = graph.terminal(
    graph.build({ task: 'Totals', reports: [stage([step('npm test', { status: 'running' })])] }),
    'completed',
  );
  assert.equal(
    done.nodes.find((node) => node.id === 'pass:0:step:0').status,
    'running',
    'step status is not rewritten',
  );
});
test('the running stage is republished as steps arrive, at most every 1.5 seconds', async () => {
  const published = [];
  const run = createCollaboration({
    progress() {},
    graphChanged: async (value) => published.push(value),
    runProvider: async (provider, _prompt, _cwd, settings) => {
      if (provider === 'codex') {
        settings.onActivity({ provider, id: 'a', tool: 'commandExecution', text: 'npm ci', status: 'completed' });
        await new Promise((resolve) => setTimeout(resolve, 20));
        settings.onActivity({ provider, id: 'b', tool: 'commandExecution', text: 'npm test', status: 'completed' });
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { output: 'Done\nATLAS_COLAB_STATUS {"decision":"ready","blockingIssues":[]}' };
    },
  });
  await run({ task: 'Fix totals' });
  const liveSteps = published.filter((value) => value.nodes.some((node) => node.id === 'active:step:0'));
  assert.equal(liveSteps.length, 1, 'the second step falls inside the 1.5 second window');
  assert.equal(liveSteps[0].nodes.find((node) => node.id === 'active:step:0').label, '$ npm ci');
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(
    published.filter((value) => value.nodes.some((node) => node.id === 'active:step:1')).length,
    0,
    'no live update fires after the pass has ended',
  );
});
