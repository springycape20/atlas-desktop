const test = require('node:test'),
  assert = require('node:assert/strict'),
  { EventEmitter } = require('node:events'),
  { PassThrough, Writable } = require('node:stream');
const { ClaudeConnectionPool } = require('../claude-connection');
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(t, options = {}) {
  const children = [],
    sessions = new Map();
  function spawnProcess(executable, args, settings) {
    const child = new EventEmitter();
    Object.assign(child, {
      args,
      settings,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      frames: [],
      killed: false,
    });
    const id = args[args.indexOf(args.includes('--resume') ? '--resume' : '--session-id') + 1];
    child.id = id;
    child.history = sessions.get(id) || [];
    sessions.set(id, child.history);
    child.emitRow = (row) => child.stdout.write(JSON.stringify({ session_id: child.id, ...row }) + '\n');
    child.complete = () => {
      const output = child.history.join('|');
      child.emitRow({ type: 'stream_event', event: { delta: { type: 'text_delta', text: output } } });
      child.emitRow({
        type: 'result',
        subtype: 'success',
        result: output,
        usage: { input_tokens: 10, cache_read_input_tokens: 2, cache_creation_input_tokens: 1, output_tokens: 3 },
        total_cost_usd: 0.01,
      });
    };
    child.reset = () => {
      child.history.length = 0;
      child.emitRow({ type: 'conversation_reset', new_conversation_id: 'new-context' });
      if (options.rotateResetID) child.id = 'rotated-session';
      if (!options.holdResetResult) child.emitRow({ type: 'result', subtype: 'success', result: 'Cleared' });
    };
    child.stdin = new Writable({
      write(data, _encoding, done) {
        try {
          for (const line of data.toString().trim().split('\n')) {
            const frame = JSON.parse(line);
            child.frames.push(frame);
            queueMicrotask(() => {
              if (child.killed) return;
              if (frame.type === 'control_request')
                child.emitRow({
                  type: 'control_response',
                  response: {
                    request_id: frame.request_id,
                    subtype: 'success',
                    response: { models: [{ value: 'sonnet' }] },
                  },
                });
              else if (frame.type === 'user' && frame.message.content === '/clear') {
                if (!options.noResetEvent) child.reset();
                else child.emitRow({ type: 'result', subtype: 'success', result: 'Unsupported clear' });
              } else if (frame.type === 'user') {
                child.history.push(frame.message.content);
                if (options.approval)
                  child.emitRow({
                    type: 'control_request',
                    request_id: 'allow-tool',
                    request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'echo okay' } },
                  });
                else if (!options.holdResult) child.complete();
              } else if (frame.type === 'control_response' && options.approval) child.complete();
            });
          }
          done();
        } catch (error) {
          done(error);
        }
      },
    });
    child.kill = () => {
      if (child.killed) return;
      child.killed = true;
      child.stdout.end();
      queueMicrotask(() => child.emit('close', 0));
    };
    children.push(child);
    return child;
  }
  const pool = new ClaudeConnectionPool({
    spawnProcess,
    launch: (executable, args, env) => ({ executable, args, env }),
    handshakeMs: 80,
  });
  t.after(() => pool.close());
  const run = (overrides) =>
    pool.run({
      executable: '/claude',
      cwd: process.cwd(),
      settings: { effort: 'medium', timeoutSeconds: 0 },
      owner: 'assistant:first',
      prompt: 'first',
      ...overrides,
    });
  return { pool, children, run };
}
test('Claude keeps one process and stdin open across Assistant follow-ups', async (t) => {
  const { run, children } = fixture(t);
  const first = await run();
  const second = await run({ prompt: 'second', sessionId: first.sessionId });
  assert.equal(children.length, 1);
  assert.equal(second.output, 'first|second');
  assert.equal(children[0].stdin.writableEnded, false);
  assert.equal(children[0].killed, false);
  assert.equal(children[0].frames.filter((row) => row.type === 'control_request').length, 1);
  assert.equal(second.usage.inputTokens, 13);
});
test('ATLAS MCP configuration stays warm and only its approval-gated wrapper tools are preallowed', async (t) => {
  const { run, children } = fixture(t),
    settings = {
      atlasMcp: { url: 'http://127.0.0.1:1234/mcp', headers: { Authorization: 'Bearer test' } },
      effort: 'medium',
      timeoutSeconds: 0,
    };
  const first = await run({ settings });
  await run({ settings, sessionId: first.sessionId, prompt: 'follow up' });
  assert.equal(children.length, 1);
  const args = children[0].args,
    config = JSON.parse(args[args.indexOf('--mcp-config') + 1]);
  assert.equal(config.mcpServers.atlas_tools.url, settings.atlasMcp.url);
  const allowed = args[args.indexOf('--allowedTools') + 1];
  assert(allowed.split(',').every((name) => name.startsWith('mcp__atlas_tools__')));
  assert(!args.includes('--dangerously-skip-permissions'));
});
test('independent Colab stages clear context and wait for the clear result before sending work', async (t) => {
  const { run, children } = fixture(t, { holdResetResult: true });
  await run({ owner: 'colab:one' });
  const next = run({ owner: 'colab:one', prompt: 'review' });
  await tick();
  const child = children[0];
  assert.equal(child.frames.filter((row) => row.type === 'user' && row.message.content !== '/clear').length, 1);
  child.emitRow({ type: 'result', subtype: 'success', result: 'Cleared' });
  const result = await next;
  assert.equal(result.output, 'review');
  assert.equal(children.length, 1);
  assert(child.frames.some((row) => row.message?.content === '/clear'));
});
test('separate chats and changed model/permission settings never share live context', async (t) => {
  const { run, children } = fixture(t);
  const first = await run();
  await run({ owner: 'assistant:other', prompt: 'other' });
  assert.equal(children.length, 2);
  assert.equal(children[1].history.join('|'), 'other');
  await run({
    sessionId: first.sessionId,
    settings: { claudeModel: 'opus', effort: 'high', readOnly: true, timeoutSeconds: 0 },
  });
  assert.equal(children.length, 3);
  assert(children[0].killed);
  assert(children[2].args.includes('--resume'));
  assert(children[2].args.includes('plan'));
  assert(children[2].args.includes('Read,Glob,Grep,WebSearch,WebFetch'));
});
test('concurrent same-chat requests are rejected; cancelling one task leaves unrelated workers alive', async (t) => {
  const { run, children } = fixture(t, { holdResult: true }),
    controller = new AbortController(),
    first = run({ signal: controller.signal });
  await tick();
  await assert.rejects(run({ prompt: 'duplicate' }), /already working/);
  const other = run({ owner: 'assistant:other' });
  await tick();
  controller.abort();
  await assert.rejects(first, /cancelled/);
  assert.equal(children[0].killed, true);
  assert.equal(children[1].killed, false);
  children[1].complete();
  await other;
});
test('disconnect fails once without replay, and an explicit next request reconnects', async (t) => {
  const { run, children } = fixture(t, { holdResult: true });
  const first = run();
  await tick();
  children[0].emit('close', 1);
  await assert.rejects(first, /disconnected/);
  assert.equal(children.length, 1);
  const next = run({ prompt: 'retry' });
  await tick();
  children[1].complete();
  await next;
  assert.equal(children.length, 2);
});
test('active tool approvals stay bound to their job and do not close stdin on result', async (t) => {
  let asked;
  const { run, children } = fixture(t, { approval: true });
  await run({
    job: { id: 'correct-job' },
    manager: {
      ask: async (request) => {
        asked = request;
        return 'Allow once';
      },
    },
  });
  assert.equal(asked.jobId, 'correct-job');
  assert(
    children[0].frames.some((row) => row.type === 'control_response' && row.response.response.behavior === 'allow'),
  );
  assert(!children[0].stdin.writableEnded);
});
test('older clients safely fall back before sending the next independent task', async (t) => {
  const { run, children } = fixture(t, { noResetEvent: true });
  await run({ owner: 'colab:one' });
  const result = await run({ owner: 'colab:one', prompt: 'next independent task' });
  assert.equal(result.output, 'next independent task');
  assert.equal(children.length, 2);
  assert.equal(children[0].frames.filter((row) => row.type === 'user' && row.message.content !== '/clear').length, 1);
  assert(children[0].killed);
});
test('closing ATLAS terminates all owned workers and rejects new requests', async (t) => {
  const { pool, run, children } = fixture(t);
  await run();
  await run({ owner: 'assistant:other' });
  pool.close();
  assert(children.every((child) => child.killed));
  await assert.rejects(run(), /closing/);
});
test('confirmed resets adopt the new session ID before the next independent request', async (t) => {
  const { run, children } = fixture(t, { rotateResetID: true });
  const first = await run({ owner: 'colab:one' });
  const second = await run({ owner: 'colab:one', prompt: 'after reset' });
  assert.notEqual(first.sessionId, second.sessionId);
  assert.equal(second.sessionId, 'rotated-session');
  assert.equal(children[0].frames.at(-1).session_id, 'rotated-session');
});
test('persistent usage and cost totals are differenced instead of double counted', () => {
  const { ClaudeConnection } = require('../claude-connection'),
    worker = new ClaudeConnection({ executable: '/claude', cwd: process.cwd() }),
    event = (input, cost) => ({
      modelUsage: {
        sonnet: { inputTokens: input, cacheReadInputTokens: 2, cacheCreationInputTokens: 3, outputTokens: input },
      },
      total_cost_usd: cost,
    });
  const first = worker.consumeUsage(event(10, 0.1)),
    second = worker.consumeUsage(event(15, 0.15));
  assert.equal(first.inputTokens, 15);
  assert.equal(second.inputTokens, 5);
  assert.equal(second.outputTokens, 5);
  assert(Math.abs(second.reportedCostUsd - 0.05) < 0.00001);
  assert.equal(second.complete, true);
});
test('Codex reuses one app-server process across separate requests', async (t) => {
  const { CodexConnection } = require('../codex-connection');
  let spawns = 0,
    thread = 0;
  const connection = new CodexConnection('/codex', () => {
    spawns++;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {};
    child.stdin = new Writable({
      write(data, _encoding, done) {
        const message = JSON.parse(data.toString());
        queueMicrotask(() => {
          const reply = (value) => child.stdout.write(JSON.stringify(value) + '\n');
          if (message.method === 'initialize') reply({ id: message.id, result: {} });
          if (message.method === 'thread/start')
            reply({ id: message.id, result: { thread: { id: 'thread-' + ++thread } } });
          if (message.method === 'turn/start') {
            reply({ id: message.id, result: { turn: { id: 'turn' } } });
            reply({
              method: 'item/completed',
              params: {
                threadId: message.params.threadId,
                item: { id: 'answer', type: 'agentMessage', phase: 'final_answer', text: 'Done' },
              },
            });
            reply({
              method: 'turn/completed',
              params: { threadId: message.params.threadId, turn: { id: 'turn', status: 'completed' } },
            });
          }
        });
        done();
      },
    });
    return child;
  });
  t.after(() => connection.close());
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await connection.run({
          prompt: 'Test',
          cwd: process.cwd(),
          settings: { codexSandbox: 'read-only', timeoutSeconds: 0 },
        })
      ).output,
      'Done',
    );
  assert.equal(spawns, 1);
});
test('Colab workers start with the protocol as an appended system prompt and are keyed by it', async (t) => {
  const { run, children } = fixture(t),
    settings = (systemPrompt) => ({ effort: 'medium', timeoutSeconds: 0, systemPrompt });
  const first = await run({ owner: 'colab:chat', settings: settings('PROTOCOL "quoted" {json}') });
  await run({ owner: 'colab:chat', settings: settings('PROTOCOL "quoted" {json}'), sessionId: first.sessionId });
  assert.equal(children.length, 1, 'passes with the same instructions reuse the worker');
  const args = children[0].args;
  assert.equal(args[args.indexOf('--append-system-prompt') + 1], 'PROTOCOL "quoted" {json}');
  await run({ owner: 'colab:chat', settings: settings('CHANGED PROTOCOL') });
  assert.equal(children.length, 2, 'a different system prompt never reuses a worker');
  await run({ owner: 'assistant:other', settings: { effort: 'medium', timeoutSeconds: 0 } });
  assert.equal(children.at(-1).args.includes('--append-system-prompt'), false, 'Assistant workers are unchanged');
});
