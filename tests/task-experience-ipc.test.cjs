const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path');
const { mainHarness } = require('./fixtures/main-harness.cjs');
test('Assistant allowance warning switches providers only after the selected native choice', async (t) => {
  let codex = 0,
    claude = 0,
    prompts = 0;
  class Codex {
    async run() {
      codex++;
      return { output: 'Codex' };
    }
  }
  class Claude {
    async run() {
      claude++;
      return { output: 'Claude' };
    }
  }
  const h = await mainHarness(t, {
    dialog: {
      showMessageBox: async (_win, request) => {
        prompts++;
        assert.equal(request.title, 'Provider allowance is low');
        assert.match(request.buttons[2], /claude/);
        return { response: 2 };
      },
    },
    modules: {
      './codex-connection': { CodexConnection: Codex },
      './claude-connection': { ClaudeConnectionPool: Claude },
      './provider-usage': {
        createProviderUsage: () => ({
          read: async (request) => {
            assert.equal(request.cachedOnly, true);
            return {
              codex: { updatedAt: Date.now(), windows: [{ label: 'Session', remainingPercent: 0 }] },
              claude: { updatedAt: Date.now(), windows: [{ label: 'Session', remainingPercent: 80 }] },
            };
          },
        }),
      },
    },
  });
  h.allowColab();
  h.setupIpc();
  const cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  const result = await h.handlers.get('atlas:chat')(
    { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    {
      requestId: 'low-allowance',
      conversationId: 'allowance-fixture-conversation',
      prompt: 'Use codex to inspect the project',
      cwd,
    },
  );
  assert.equal(result.provider, 'claude');
  assert.equal(prompts, 1);
  assert.equal(codex, 0);
  assert.equal(claude, 1);
  await h.assistantService.flush();
});
test('declining usage-limit handoff prevents any fallback dispatch', async (t) => {
  let calls = 0,
    decisions = 0;
  class Codex {
    async run() {
      throw Error('usage limit');
    }
  }
  class Claude {
    async run() {
      calls++;
      return { output: 'must not run' };
    }
  }
  const h = await mainHarness(t, {
    dialog: {
      showMessageBox: async (_win, request) => {
        decisions++;
        assert.equal(request.title, 'Provider usage limit');
        return { response: 0 };
      },
    },
    modules: {
      './codex-connection': { CodexConnection: Codex },
      './claude-connection': { ClaudeConnectionPool: Claude },
    },
  });
  h.allowColab();
  h.setupIpc();
  const cwd = path.join(h.dir, 'project');
  await fs.mkdir(cwd);
  await assert.rejects(
    h.handlers.get('atlas:chat')(
      { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
      {
        requestId: 'decline-handoff',
        conversationId: 'declined-fixture-conversation',
        prompt: 'Use codex to inspect the project',
        cwd,
      },
    ),
    /handoff was declined/,
  );
  assert.equal(calls, 0);
  assert.equal(decisions, 1);
  await h.assistantService.flush();
});
test('task archive IPC preserves evidence and persists reversible organisation fields', async (t) => {
  const h = await mainHarness(t);
  h.setupIpc();
  h.activeJobs.set('failed', {
    id: 'failed',
    status: 'failed',
    prompt: 'Review failing check',
    verification: { status: 'failed' },
    result: { output: 'Evidence retained' },
  });
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } };
  const call = (r) => h.handlers.get('atlas:jobs')(event, r);
  await call({ id: 'failed', action: 'dismiss-attention' });
  await call({ id: 'failed', action: 'archive' });
  const saved = h.assistantService.state.jobs.find((j) => j.id === 'failed');
  assert.equal(saved.archived, true);
  assert.equal(saved.result.output, 'Evidence retained');
  assert.equal(require('../task-recovery').recoverSavedJob(saved).archived, true);
  await call({ id: 'failed', action: 'unarchive' });
  await call({ id: 'failed', action: 'restore-attention' });
  assert.equal(h.activeJobs.get('failed').archived, false);
  assert.equal(h.activeJobs.get('failed').dismissedAttention, undefined);
  h.activeJobs.set('done', { id: 'done', status: 'completed', result: { output: 'Completed evidence' } });
  const bulk = await call({ action: 'organize-many', operation: 'archive', ids: ['failed', 'done'] });
  assert.equal(bulk.count, 2);
  assert(bulk.undoToken);
  assert(bulk.jobs.find((j) => j.id === 'done').archived);
  await call({ action: 'undo-organize', token: bulk.undoToken });
  assert.equal(h.activeJobs.get('done').archived, undefined);
  await assert.rejects(h.handlers.get('atlas:jobs')({}, { id: 'failed', action: 'archive' }), /Untrusted/);
  await h.assistantService.flush();
});
