const test = require('node:test'),
  assert = require('node:assert/strict'),
  { stepType, createStepCapture } = require('../step-timeline'),
  { createDecoder } = require('../assistant-core'),
  { createCollaboration } = require('../collaboration');

test('tool events are sorted into step types and reads, plans and narration are left out', () => {
  const cases = [
    [{ tool: 'commandExecution', provider: 'codex' }, 'command'],
    [{ tool: 'Bash', provider: 'claude' }, 'command'],
    [{ tool: 'fileChange', provider: 'codex' }, 'file'],
    [{ tool: 'Edit', provider: 'claude' }, 'file'],
    [{ tool: 'MultiEdit', provider: 'claude' }, 'file'],
    [{ tool: 'webSearch', provider: 'codex' }, 'search'],
    [{ tool: 'Grep', provider: 'claude' }, 'search'],
    [{ tool: 'mcpToolCall', provider: 'codex' }, 'mcp'],
    [{ tool: 'mcp__github__create_issue', provider: 'claude' }, 'mcp'],
    [{ tool: 'atlas-gateway', provider: 'claude' }, 'gateway'],
    [{ tool: 'Task', provider: 'claude' }, 'tool'],
    [{ tool: 'Read', provider: 'claude' }, null],
    [{ tool: 'Glob', provider: 'claude' }, null],
    [{ tool: 'TodoWrite', provider: 'claude' }, null],
    [{ tool: 'contextCompaction', provider: 'codex' }, null],
    [{ kind: 'progress', provider: 'codex' }, null],
    [{ kind: 'reasoning', tool: 'Bash', provider: 'claude' }, null],
  ];
  for (const [event, type] of cases) assert.equal(stepType(event), type, JSON.stringify(event));
});
test('a step merges its start and end into one entry with status, exit code and timing', () => {
  const capture = createStepCapture();
  capture.add({ id: 'c1', tool: 'commandExecution', provider: 'codex', text: 'npm test', status: 'running' }, 1000);
  capture.add(
    { id: 'c1', tool: 'commandExecution', provider: 'codex', text: 'npm test', status: 'failed', exitCode: 1 },
    4000,
  );
  capture.add({ id: 'r1', tool: 'Read', provider: 'claude', text: 'Read · a.js', status: 'running' }, 4100);
  assert.deepEqual(capture.list(), [
    {
      type: 'command',
      provider: 'codex',
      text: 'npm test',
      status: 'failed',
      exitCode: 1,
      startedAt: 1000,
      endedAt: 4000,
    },
  ]);
});
test('steps are bounded and long text is cut', () => {
  const capture = createStepCapture({ limit: 3 });
  for (let i = 0; i < 5; i++)
    capture.add({ id: 'c' + i, tool: 'Bash', provider: 'claude', text: 'x'.repeat(500), status: 'completed' });
  assert.equal(capture.list().length, 3);
  assert.equal(capture.omitted, 2);
  assert.equal(capture.list()[0].text.length, 300);
});
test('the Claude decoder reports which tool each step used', () => {
  const events = [],
    decoder = createDecoder(
      'claude',
      () => {},
      (event) => events.push(event),
    );
  decoder.push(
    JSON.stringify({
      type: 'assistant',
      message: {
        id: 'm',
        content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'src/cart.js' } }],
      },
    }) + '\n',
  );
  assert.equal(events[0].tool, 'Edit');
  assert.equal(stepType({ ...events[0], provider: 'claude' }), 'file');
});
test('each pass keeps its own steps, including gateway actions, and never puts them in a prompt', async () => {
  const prompts = [],
    marker = 'STEP-MARKER';
  const run = createCollaboration({
    progress() {},
    runProvider: async (provider, prompt, _cwd, settings) => {
      prompts.push(prompt);
      const emit = (event) => settings.onActivity({ provider, ...event });
      emit({
        id: 'a',
        tool: provider === 'codex' ? 'commandExecution' : 'Bash',
        text: 'npm test -- ' + marker,
        status: 'running',
      });
      emit({
        id: 'a',
        tool: provider === 'codex' ? 'commandExecution' : 'Bash',
        text: 'npm test -- ' + marker,
        status: 'completed',
        exitCode: 0,
      });
      emit({ id: 'g', tool: 'atlas-gateway', text: 'Tool: windows / Click', status: 'completed' });
      emit({ id: 'r', tool: 'Read', text: 'Read · src/cart.js', status: 'completed' });
      settings.onActivity({ provider: 'other', id: 'x', tool: 'Bash', text: 'not this pass', status: 'completed' });
      return { output: 'Done\nATLAS_COLAB_STATUS {"decision":"ready","blockingIssues":[]}' };
    },
    checkpoint: async (reports) => (run.saved = reports),
  });
  await run({ task: 'Fix totals' });
  assert.deepEqual(
    run.saved[0].steps.map((row) => [row.type, row.provider, row.text, row.status]),
    [
      ['command', 'codex', 'npm test -- ' + marker, 'completed'],
      ['gateway', 'codex', 'Tool: windows / Click', 'completed'],
    ],
  );
  assert.equal(run.saved[0].stepsOmitted, 0);
  assert.equal(run.saved[1].steps[0].provider, 'claude');
  for (const prompt of prompts) assert(!prompt.includes(marker), 'steps never reach a prompt');
});
