const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const { mainHarness } = require('./fixtures/main-harness.cjs');
test('real Assistant request assembly reuses only confirmed unchanged attachment references and can force refresh', async (t) => {
  const prompts = [];
  class FakeCodex {
    async run(request) {
      const sessionId = request.sessionId || 'retained-reference-session';
      prompts.push(request.preparePrompt({ sessionId, resumed: Boolean(request.sessionId) }));
      return { output: 'Fixture reference reply', sessionId };
    }
  }
  const h = await mainHarness(t, { modules: { './codex-connection': { CodexConnection: FakeCodex } } });
  h.allowColab();
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    call = (name, request) => h.handlers.get('atlas:' + name)(event, request),
    cwd = path.join(h.dir, 'reference-project');
  await fs.mkdir(cwd);
  const source = path.join(cwd, 'reference.txt');
  await fs.writeFile(source, 'REFERENCE_BODY '.repeat(300));
  const attachment = (await call('attachments', { paths: [source] }))[0];
  const profile = await call('projects', {
    action: 'save',
    profile: { name: 'References', cwd, instructions: 'ALWAYS_SEND_PROJECT_INSTRUCTIONS' },
  });
  const send = (id, extra = {}) =>
    call('chat', {
      requestId: id,
      conversationId: 'reference-fixture-conversation',
      profileId: profile.id,
      prompt: 'Explain the attachment; use codex',
      cwd,
      attachments: [attachment.id],
      ...extra,
    });
  await send('reference-first');
  const follow = await send('reference-follow');
  assert.ok(follow.contextReuse.estimatedTokensAvoided > 500);
  assert.match(prompts[0], /REFERENCE_BODY/);
  assert.doesNotMatch(prompts[1], /REFERENCE_BODY/);
  assert.match(prompts[1], /ALWAYS_SEND_PROJECT_INSTRUCTIONS/);
  assert.match(prompts[1], /Explain the attachment/);
  await send('reference-refresh', { forceFullContext: true });
  assert.match(prompts[2], /REFERENCE_BODY/);
  await call('save-settings', { codexModel: 'different-model' });
  await send('reference-model-change');
  assert.match(prompts[3], /REFERENCE_BODY/);
  await h.assistantService.flush();
});
test('usage-limit fallback includes local conversation history only once', async (t) => {
  const prompts = [];
  class FakeCodex {
    async run() {
      throw Error('usage limit');
    }
  }
  class FakeClaude {
    async run(request) {
      prompts.push(request.prompt);
      return { output: 'Fallback fixture', sessionId: 'claude-fallback' };
    }
  }
  const h = await mainHarness(t, {
    modules: {
      './codex-connection': { CodexConnection: FakeCodex },
      './claude-connection': { ClaudeConnectionPool: FakeClaude },
    },
  });
  h.allowColab();
  h.setupIpc();
  const cwd = path.join(h.dir, 'fallback-project');
  await fs.mkdir(cwd);
  await h.writeAtlasHistory([
    {
      id: 'fallback-fixture-conversation',
      cwd,
      turns: [{ role: 'user', content: 'ONLY_ONE_HISTORY_MARKER', at: 1 }],
      updatedAt: 1,
      sessions: {},
    },
  ]);
  await h.handlers.get('atlas:chat')(
    { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    {
      requestId: 'fallback-fixture',
      conversationId: 'fallback-fixture-conversation',
      prompt: 'Explain the project; use codex',
      cwd,
    },
  );
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].split('ONLY_ONE_HISTORY_MARKER').length - 1, 1);
  await h.assistantService.flush();
});
test('Assistant executes at most one opted-in stronger repair and reruns actual configured checks', async (t) => {
  const calls = [];
  let checks = 0;
  class FakeCodex {
    async run(request) {
      const sessionId = 'fixture-' + (calls.length + 1);
      const prompt = request.preparePrompt ? request.preparePrompt({ sessionId, resumed: false }) : request.prompt;
      calls.push({ model: request.settings.codexModel, prompt, session: request.sessionId });
      await fs.writeFile(path.join(request.cwd, 'changed.txt'), 'change ' + calls.length);
      return { output: 'Fixture answer ' + calls.length, sessionId };
    }
  }
  const tools = require('../project-tools');
  const h = await mainHarness(t, {
    modules: {
      './codex-connection': { CodexConnection: FakeCodex },
      './project-tools': {
        ...tools,
        completionChecks: async () => {
          checks++;
          return {
            status: checks === 1 ? 'failed' : 'passed',
            results: [
              {
                command: 'fixture-check',
                status: checks === 1 ? 'failed' : 'passed',
                exitCode: checks === 1 ? 1 : 0,
                output: 'Error: fixture failing case',
              },
            ],
          };
        },
      },
    },
  });
  h.allowColab();
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } };
  const call = (name, request) => h.handlers.get('atlas:' + name)(event, request),
    cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  await call('save-settings', {
    routeMode: 'codex',
    modelRoutingEnabled: true,
    checkDrivenEscalation: true,
    fastCodexModel: 'fast',
    strongCodexModel: 'strong',
  });
  const profile = await call('projects', {
    action: 'save',
    profile: {
      name: 'Fixture',
      cwd,
      instructions: 'KEEP REQUIREMENTS',
      autoCheck: true,
      checkCommands: 'fixture-check',
    },
  });
  await h.writeAtlasHistory([
    {
      id: 'efficiency-fixture-conversation',
      cwd,
      sessions: { codex: 'retained-fixture' },
      lastProvider: 'codex',
      turns: [{ role: 'user', content: 'SOURCE_CONTEXT_REQUIREMENT', at: 1 }],
      updatedAt: 1,
    },
  ]);
  const result = await call('chat', {
    requestId: 'efficiency-fixture',
    conversationId: 'efficiency-fixture-conversation',
    prompt: 'Fix this using codex',
    cwd,
    profileId: profile.id,
  });
  assert.deepEqual(
    calls.map((row) => row.model),
    ['fast', 'strong'],
  );
  assert.equal(checks, 2);
  assert.equal(calls[1].session, '');
  assert.match(calls[1].prompt, /KEEP REQUIREMENTS/);
  assert.doesNotMatch(calls[0].prompt, /SOURCE_CONTEXT_REQUIREMENT/);
  assert.match(calls[1].prompt, /SOURCE_CONTEXT_REQUIREMENT/);
  assert.match(calls[1].prompt, /fixture failing case/);
  assert.match(calls[1].prompt, /do not weaken, skip or delete checks/);
  assert.equal(result.escalation.status, 'passed');
  const history = await h.readAtlasHistory();
  assert.equal(history[0].turns.filter((row) => row.role === 'user').length, 2);
  assert.equal(h.activeJobs.get('efficiency-fixture').efficiencyEnvelope, undefined);
  const packet = await call('milestone-handovers', { action: 'create', jobId: 'efficiency-fixture' });
  assert.match(packet.checks, /fixture-check · passed/);
  await assert.rejects(h.handlers.get('atlas:milestone-handovers')({}, {}), /Untrusted/);
  await h.assistantService.flush();
});
test('saved check logs are bounded, referenced by recorded job/index and require a trusted window', async (t) => {
  const h = await mainHarness(t);
  h.setupIpc();
  const dir = path.join(h.paths.userData, 'colab-reports', 'fixture', 'check-logs');
  const log = require('../check-log').createCheckLog(dir, 70000);
  log.write('x'.repeat(80000));
  const saved = log.finish();
  assert.equal(saved.logLimited, true);
  assert.equal((await fs.stat(saved.logFile)).size, 70000);
  h.activeJobs.set('fixture', { id: 'fixture', verification: { results: [saved] } });
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    call = (request) => h.handlers.get('atlas:check-log')(event, request);
  const preview = await call({ jobId: 'fixture', index: 0 });
  assert.equal(preview.text.length, 64000);
  assert.equal(preview.previewLimited, true);
  await assert.rejects(call({ jobId: 'fixture', index: 1 }), /unavailable/);
  await assert.rejects(h.handlers.get('atlas:check-log')({}, {}), /Untrusted/);
  const outside = path.join(h.dir, 'outside.log');
  await fs.writeFile(outside, 'outside');
  h.activeJobs.get('fixture').verification.results[0] = { logFile: outside };
  await assert.rejects(call({ jobId: 'fixture', index: 0 }), /outside managed/);
  await h.assistantService.flush();
});
