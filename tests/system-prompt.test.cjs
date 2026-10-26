const test = require('node:test'),
  assert = require('node:assert/strict'),
  { CodexConnection } = require('../codex-connection'),
  { createCollaboration } = require('../collaboration'),
  { usageSummary } = require('../colab-efficiency');
const ready = 'Done\nATLAS_COLAB_STATUS {"decision":"ready","blockingIssues":[]}';
function collaboration(fixedInstructions) {
  const calls = [],
    run = createCollaboration({
      progress() {},
      ...(fixedInstructions ? { fixedInstructions } : {}),
      runProvider: async (provider, prompt, _cwd, settings) => {
        calls.push({ provider, prompt, systemPrompt: settings.systemPrompt });
        return { output: ready };
      },
      checkpoint: async (reports) => (run.saved = reports),
    });
  return { run, calls };
}

test('with system instructions, every pass sends the protocol once as instructions, not in its prompt', async () => {
  const h = collaboration('system');
  await h.run({ task: 'Fix totals' });
  assert.equal(h.calls.length, 2);
  for (const call of h.calls) {
    assert.match(call.systemPrompt, /ATLAS_COLAB_STATUS \{"decision":"ready"/);
    assert.match(call.systemPrompt, /confidenceReason/);
    assert.doesNotMatch(call.prompt, /End with one final line: ATLAS_COLAB_STATUS/);
    assert.match(call.prompt, /Follow the ATLAS Colab protocol in your instructions/);
  }
  const plain = collaboration();
  await plain.run({ task: 'Fix totals' });
  assert.equal(plain.calls[0].systemPrompt, undefined, 'the default keeps the protocol in the prompt');
  assert.match(plain.calls[0].prompt, /End with one final line: ATLAS_COLAB_STATUS/);
  const shorter = h.calls[0].prompt.length,
    longer = plain.calls[0].prompt.length;
  const metrics = h.run.saved[0].metrics;
  assert(metrics.systemPromptCharacters > 2000);
  assert(
    longer - shorter > metrics.systemPromptCharacters - 100,
    'each pass prompt shrinks by about the protocol length',
  );
  assert.equal(
    usageSummary(h.run.saved).estimatedMissingTokens >=
      Math.ceil((metrics.promptCharacters + metrics.systemPromptCharacters) / 4),
    true,
    'estimates still count the system prompt',
  );
});
test('Codex receives the protocol as developer instructions when a thread starts', async () => {
  const connection = new CodexConnection('unused'),
    calls = [];
  connection.connect = async () => {};
  connection.request = async (method, params) => {
    calls.push({ method, params });
    if (method === 'thread/start') return { thread: { id: 'thread-1', ephemeral: true } };
    if (method === 'turn/start') {
      queueMicrotask(() =>
        connection.receive({
          method: 'turn/completed',
          params: { threadId: params.threadId, turn: { id: 'turn', status: 'completed' } },
        }),
      );
      return { turn: { id: 'turn' } };
    }
    throw Error('Unexpected method ' + method);
  };
  const base = { prompt: 'Pass', cwd: process.cwd(), internal: true };
  await connection.run({
    ...base,
    settings: { codexSandbox: 'read-only', timeoutSeconds: 0, systemPrompt: 'PROTOCOL TEXT' },
  });
  assert.equal(calls.find((row) => row.method === 'thread/start').params.developerInstructions, 'PROTOCOL TEXT');
  assert.equal(calls.find((row) => row.method === 'turn/start').params.input[0].text, 'Pass');
  calls.length = 0;
  await connection.run({ ...base, settings: { codexSandbox: 'read-only', timeoutSeconds: 0 } });
  assert.equal('developerInstructions' in calls.find((row) => row.method === 'thread/start').params, false);
});
