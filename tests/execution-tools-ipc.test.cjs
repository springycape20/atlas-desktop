const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const { mainHarness } = require('./fixtures/main-harness.cjs');
test('real Assistant gateway enforces invocation budgets before usage-limit fallback', async (t) => {
  let codex = 0,
    claude = 0;
  class FakeCodex {
    async run() {
      codex++;
      throw Error('usage limit');
    }
  }
  class FakeClaude {
    async run() {
      claude++;
      return { output: 'fixture' };
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
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    call = (name, r) => h.handlers.get('atlas:' + name)(event, r),
    cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  await call('task-budgets', { action: 'save', cwd, limits: { enabled: true, providerCalls: 1 } });
  await assert.rejects(
    call('chat', {
      requestId: 'budget-fallback',
      conversationId: 'budget-fixture-conversation',
      prompt: 'Use codex to inspect this project',
      cwd,
    }),
    /provider-call budget/,
  );
  assert.equal(codex, 1);
  assert.equal(claude, 0);
  const job = h.activeJobs.get('budget-fallback');
  assert.equal(job.status, 'paused');
  assert.equal(job.budget.calls, 1);
  assert.equal(job.budget.usageComplete, false);
  await assert.rejects(h.handlers.get('atlas:task-budgets')({}, {}), /Untrusted/);
  await h.assistantService.flush();
});
test('real Colab gateway pauses before oversized initial context reaches a provider', async (t) => {
  let calls = 0;
  class FakeCodex {
    async run() {
      calls++;
      return { output: 'fixture' };
    }
  }
  class FakeClaude {
    async run() {
      calls++;
      return { output: 'fixture' };
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
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  await h.handlers.get('atlas:task-budgets')(event, {
    action: 'save',
    cwd,
    limits: { enabled: true, estimatedTokens: 1 },
  });
  const started = await h.handlers.get('atlas:collab')(event, {
    task: 'Review this fixture project',
    cwd,
    isolated: false,
    mode: 'plan',
    milestones: 'off',
  });
  const job = h.activeJobs.get(started.id);
  await job.promise.catch(() => {});
  assert.equal(calls, 0);
  assert.equal(job.status, 'paused');
  assert.match(job.error, /outgoing text/);
  await h.assistantService.flush();
});
test('benchmark IPC runs pinned fixture models, avoids global local-mode routing and exports only on request', async (t) => {
  const calls = [],
    output = {};
  let boxes = 0;
  class FakeCodex {
    async run(r) {
      calls.push(r.settings.codexModel);
      return { output: 'Fixed fixture', sessionId: 'fixture', usage: { inputTokens: 8, outputTokens: 2 } };
    }
  }
  const h = await mainHarness(t, {
    dialog: {
      showMessageBox: async () => {
        boxes++;
        return { response: 1 };
      },
      showSaveDialog: async () => ({ canceled: false, filePath: output.path }),
    },
    modules: { './codex-connection': { CodexConnection: FakeCodex } },
  });
  h.allowColab();
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    call = (name, r) => h.handlers.get('atlas:' + name)(event, r),
    cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  await fs.writeFile(path.join(cwd, 'app.js'), 'fixture');
  await call('save-settings', {
    localModelEnabled: true,
    localModel: 'fixture:8b',
    routeMode: 'claude',
    checkDrivenEscalation: true,
  });
  const checkpoint = await call('work-session', { action: 'capture', cwd });
  const suite = await call('workflow-benchmarks', {
    action: 'save',
    name: 'Fixture',
    checkpointId: checkpoint.id,
    cases: [{ name: 'Inspect', task: 'Explain app.js', checks: '' }],
    configs: [{ name: 'Pinned', provider: 'codex', model: 'fixed-fixture' }],
  });
  assert.equal(calls.length, 0);
  assert.equal(boxes, 0);
  await call('workflow-benchmarks', { action: 'run', id: suite.id });
  assert.deepEqual(calls, ['fixed-fixture']);
  const state = await call('workflow-benchmarks', { action: 'status' }),
    run = state.runs[0];
  assert.equal(run.configurationMatched, true);
  assert.equal(run.status, 'completed');
  assert.equal(run.usage.inputTokens, 8);
  output.path = path.join(h.dir, 'export.json');
  await call('workflow-benchmarks', { action: 'export', id: suite.id });
  const report = JSON.parse(await fs.readFile(output.path, 'utf8'));
  assert.equal(report.format, 'atlas-workflow-benchmark-v1');
  assert.equal(report.runs.length, 1);
  await assert.rejects(h.handlers.get('atlas:workflow-benchmarks')({}, {}), /Untrusted/);
  await h.assistantService.flush();
});
test('cancelling a benchmark during Assistant preflight cannot leave a provider job running', async (t) => {
  let release,
    entered,
    calls = 0;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    waiting = new Promise((resolve) => {
      entered = resolve;
    });
  const budgets = require('../task-budgets');
  class FakeCodex {
    async run() {
      calls++;
      return { output: 'Should not start' };
    }
  }
  const h = await mainHarness(t, {
    dialog: { showMessageBox: async () => ({ response: 1 }) },
    modules: {
      './codex-connection': { CodexConnection: FakeCodex },
      './task-budgets': {
        ...budgets,
        createTaskBudgets: (directory) => {
          const service = budgets.createTaskBudgets(directory);
          return {
            action: async (request) => {
              if (!request.action && request.cwd?.includes('worktrees')) {
                entered();
                await gate;
              }
              return service.action(request);
            },
          };
        },
      },
    },
  });
  h.allowColab();
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    call = (name, r) => h.handlers.get('atlas:' + name)(event, r),
    cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  await fs.writeFile(path.join(cwd, 'app.js'), 'fixture');
  const checkpoint = await call('work-session', { action: 'capture', cwd }),
    suite = await call('workflow-benchmarks', {
      action: 'save',
      name: 'Cancel fixture',
      checkpointId: checkpoint.id,
      cases: [{ name: 'Inspect', task: 'Inspect app.js' }],
      configs: [{ name: 'Pinned', provider: 'codex', model: 'fixture' }],
    });
  const running = call('workflow-benchmarks', { action: 'run', id: suite.id });
  await waiting;
  await call('workflow-benchmarks', { action: 'cancel' });
  release();
  assert.equal((await running).cancelled, true);
  assert.equal(calls, 0);
  assert.equal([...h.activeJobs.values()].filter((job) => job.status === 'running').length, 0);
  const state = await call('workflow-benchmarks', { action: 'status' });
  assert.equal(state.runs[0].status, 'cancelled');
  await h.assistantService.flush();
});
