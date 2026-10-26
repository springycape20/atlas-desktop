const test = require('node:test'),
  assert = require('node:assert/strict'),
  { CodexConnection } = require('../codex-connection'),
  { createDecoder } = require('../assistant-core'),
  { createCollaboration } = require('../collaboration'),
  graph = require('../colab-graph');
const reasoningItem = {
  type: 'reasoning',
  id: 'r1',
  summary: ['Checking how totals are rounded', { type: 'summary_text', text: 'Floats drift; use cents' }],
  content: ['RAW CHAIN OF THOUGHT'],
};
function codex(showReasoning) {
  const connection = new CodexConnection('unused'),
    calls = [],
    activity = [];
  connection.connect = async () => {};
  connection.request = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'thread-1', ephemeral: true } };
    if (method === 'turn/start') {
      queueMicrotask(() => {
        connection.receive({ method: 'item/completed', params: { threadId: params.threadId, item: reasoningItem } });
        connection.receive({
          method: 'turn/completed',
          params: { threadId: params.threadId, turn: { id: 'turn', status: 'completed' } },
        });
      });
      return { turn: { id: 'turn' } };
    }
    throw Error('Unexpected method ' + method);
  };
  return {
    calls,
    activity,
    run: () =>
      connection.run({
        prompt: 'Fix totals',
        cwd: process.cwd(),
        settings: { codexSandbox: 'read-only', timeoutSeconds: 0, showReasoning },
        internal: true,
        activity: (event) => activity.push(event),
      }),
  };
}

test('Codex is asked for reasoning summaries only when the setting is on, and only summaries are shown', async () => {
  const on = codex(true);
  await on.run();
  assert.equal(on.calls.find((row) => row.method === 'turn/start').params.summary, 'auto');
  const shown = on.activity.filter((event) => event.kind === 'reasoning');
  assert.equal(shown.length, 1);
  assert.equal(shown[0].text, 'Checking how totals are rounded\n\nFloats drift; use cents');
  assert(!JSON.stringify(on.activity).includes('RAW CHAIN OF THOUGHT'), 'raw reasoning content is never passed on');
  const off = codex(false);
  await off.run();
  assert.equal('summary' in off.calls.find((row) => row.method === 'turn/start').params, false);
  assert.equal(off.activity.filter((event) => event.kind === 'reasoning').length, 0);
});
test('Claude thinking blocks are shown only when the setting is on; redacted thinking is skipped', () => {
  const message = {
    type: 'assistant',
    message: {
      id: 'msg-1',
      content: [
        { type: 'thinking', thinking: 'The cart sums floats; switch to cents.', signature: 'sig' },
        { type: 'redacted_thinking', data: 'opaque' },
        { type: 'text', text: 'Working on it' },
      ],
    },
  };
  const read = (reasoning) => {
    const events = [],
      decoder = createDecoder(
        'claude',
        () => {},
        (event) => events.push(event),
        { reasoning },
      );
    decoder.push(JSON.stringify(message) + '\n' + JSON.stringify(message) + '\n');
    return events.filter((event) => event.kind === 'reasoning');
  };
  const on = read(true);
  assert.equal(on.length, 1, 'repeated messages are not shown twice');
  assert.equal(on[0].text, 'The cart sums floats; switch to cents.');
  assert(!JSON.stringify(on).includes('opaque'));
  assert.deepEqual(read(false), []);
});
test('a pass keeps its own reasoning summaries for the graph and never puts them in a prompt', async () => {
  const prompts = [],
    secret = 'PRIVATE-REASONING-MARKER';
  const run = createCollaboration({
    progress() {},
    runProvider: async (provider, prompt, _cwd, settings) => {
      prompts.push(prompt);
      settings.onActivity({ kind: 'reasoning', provider, id: provider + '-1', text: secret + ' from ' + provider });
      settings.onActivity({ kind: 'reasoning', provider, id: provider + '-1', text: 'duplicate' });
      settings.onActivity({ kind: 'reasoning', provider: 'other', id: 'x', text: 'not this pass' });
      settings.onActivity({ kind: 'command', provider, id: 'c', text: 'npm test' });
      return { output: 'Done\nATLAS_COLAB_STATUS {"decision":"ready","blockingIssues":[]}' };
    },
    checkpoint: async (reports) => (run.saved = reports),
  });
  await run({ task: 'Fix totals' });
  assert.deepEqual(run.saved[0].reasoning, [{ provider: 'codex', text: secret + ' from codex' }]);
  assert.deepEqual(run.saved[1].reasoning, [{ provider: 'claude', text: secret + ' from claude' }]);
  for (const prompt of prompts) assert(!prompt.includes(secret), 'reasoning summaries never reach a prompt');
  const built = graph.build({ task: 'Fix totals', reports: run.saved });
  assert.match(built.nodes.find((node) => node.id === 'pass:0').detail, /Codex reasoning summary \(model-reported/);
  assert.match(built.nodes.find((node) => node.id === 'pass:1').detail, /Claude thinking summary \(model-reported/);
  const plain = graph.build({ task: 'Fix totals', reports: [{ provider: 'codex', phase: 'build', output: 'Done' }] });
  assert.doesNotMatch(plain.nodes.find((node) => node.id === 'pass:0').detail, /reasoning summary/);
});
