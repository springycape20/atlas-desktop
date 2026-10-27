// Pins how main.js starts, finishes, checks and queues Colab jobs, through its real IPC handlers with fake
// providers, so this behaviour is kept when the job code moves out of main.js.
const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process'),
  { mainHarness } = require('./fixtures/main-harness.cjs');
const status = (decision = 'ready', extra = {}) =>
  'Done.\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision, blockingIssues: [], userResponse: 'Finished.', ...extra });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, ms = 30000) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(100)) if (await check()) return;
  assert.fail('Timed out waiting for ' + label);
}
const task = (file) => 'Create ' + file + ' containing the word ready';
// The builder creates the file its task names; tasks that change no files get no badge or check offer.
const build = async ({ cwd, prompt }) => {
  await fs.writeFile(path.join(cwd, prompt.match(/Create (\w+\.txt)/)[1]), 'ready\n');
  return status();
};
// Codex builds and Claude reviews; each test says what a pass does. Both see the real pass settings.
async function colabHarness(t, { codex = build, claude = async () => status(), git = false } = {}) {
  const passes = [];
  class FakeCodex {
    async run(request) {
      passes.push({ provider: 'codex', cwd: request.cwd, prompt: request.prompt, settings: request.settings });
      return { output: await codex(request), sessionId: 'codex-' + passes.length };
    }
  }
  class FakeClaude {
    async run(request) {
      passes.push({ provider: 'claude', cwd: request.cwd, prompt: request.prompt, settings: request.settings });
      return { output: await claude(request), sessionId: 'claude-' + passes.length };
    }
    close() {}
  }
  const h = await mainHarness(t, {
    modules: {
      './codex-connection': { CodexConnection: FakeCodex },
      './claude-connection': { ClaudeConnectionPool: FakeClaude },
    },
  });
  h.allowColab();
  h.sender.getURL = () => 'atlas://app/index.html';
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    call = (name, request) => h.handlers.get('atlas:' + name)(event, request);
  await fs.mkdir(path.join(h.dir, 'project'));
  const project = await fs.realpath(path.join(h.dir, 'project'));
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ scripts: { test: 'node -e 0' } }));
  await fs.writeFile(path.join(project, 'app.js'), 'module.exports = 1;\n');
  if (git) {
    const run = (...args) => execFileSync('git', args, { cwd: project, stdio: 'ignore' });
    run('init', '-q');
    run('config', 'user.name', 'Test');
    run('config', 'user.email', 'test@example.invalid');
    run('add', '.');
    run('commit', '-qm', 'Initial');
  }
  // Starts a Colab task the way the Colab composer does and waits for it to finish.
  const colab = async (request = {}) => {
    const { id } = await call('collab', {
      task: task('notes.txt'),
      cwd: project,
      isolated: false,
      milestones: 'off',
      ...request,
    });
    await h.activeJobs.get(id).promise.catch(() => {});
    return h.activeJobs.get(id);
  };
  const statuses = (id) => h.updates.filter((row) => row && row.id === id && 'chatId' in row);
  return { ...h, passes, call, project, colab, statuses };
}

test('Colab start refuses bad requests before creating a job', async (t) => {
  const h = await colabHarness(t);
  await assert.rejects(h.handlers.get('atlas:collab')({}, { task: 'x', cwd: h.project }), /Untrusted/);
  await assert.rejects(h.call('collab', { task: '  ', cwd: h.project }), /Enter a task/);
  await assert.rejects(h.call('collab', { task: 'x'.repeat(20001), cwd: h.project }), /under 20,000/);
  await assert.rejects(h.call('collab', { task: 'Fix it', cwd: path.join(h.project, 'missing') }), /existing working/);
  await assert.rejects(h.call('collab', { task: 'Fix it', cwd: 'relative' }), /existing working/);
  await assert.rejects(h.call('collab', { resumeJobId: 'unknown' }), /stopped Colab task/);
  h.activeJobs.set('running', { id: 'running', collaboration: true, request: {}, status: 'running' });
  await assert.rejects(h.call('collab', { resumeJobId: 'running' }), /stopped Colab task/);
  assert.equal(h.activeJobs.size, 1);
  assert.equal(h.passes.length, 0);
});

test('a Colab build runs both providers with the protocol as instructions and finishes unverified with a check offer', async (t) => {
  const h = await colabHarness(t);
  const job = await h.colab();
  assert.equal(job.status, 'completed');
  assert.equal(job.statusText, 'Complete · unverified');
  assert.equal(job.result.outcome, 'completed');
  assert.equal(job.verification.status, 'not-checked');
  assert.equal(job.verificationBadge.level, 'unverified');
  assert.deepEqual(job.checkOffer, { cwd: h.project, checks: ['npm run test'], configured: false, profileName: '' });
  assert.equal(job.result.checkOffer, job.checkOffer);
  assert.deepEqual(
    h.passes.map((row) => [row.provider, row.cwd, row.settings.readOnly === true]),
    [
      ['codex', h.project, false],
      ['claude', h.project, true],
    ],
  );
  for (const row of h.passes) assert.match(row.settings.systemPrompt, /ATLAS_COLAB_STATUS/);
  assert.match(h.passes[0].prompt, /Follow the ATLAS Colab protocol in your instructions/);
  const final = h.statuses(job.id).find((row) => row.outcome);
  assert.equal(final.status, 'Complete · unverified');
  assert.equal(final.verification.level, 'unverified');
  assert.deepEqual(final.checkOffer, job.checkOffer);
  assert(h.statuses(job.id).some((row) => /Codex is implementing the task/.test(row.status)));
  assert.equal(job.graph.outcome, 'completed');
  assert.equal(job.budget.runStartedAt, null);
  assert(job.endedAt);
  const report = path.join(h.paths.userData, 'colab-reports', job.id, '1.txt');
  assert.match(await fs.readFile(report, 'utf8'), /ATLAS_COLAB_STATUS/);
});

test('a debug task only reaches review after ATLAS runs the reproduction before and after the fix', async (t) => {
  const h = await colabHarness(t, {
    claude: async ({ prompt }) =>
      /You are reproducing a reported bug/.test(prompt)
        ? status('ready', {
            reproduction: { steps: 'Run repro.js', command: 'node repro.js', observed: 'exit 1', expected: 'exit 0' },
          })
        : status(),
    codex: async ({ cwd }) => {
      await fs.writeFile(path.join(cwd, 'fixed.txt'), 'fixed');
      return status();
    },
  });
  await fs.writeFile(
    path.join(h.project, 'repro.js'),
    "process.exit(require('node:fs').existsSync('fixed.txt') ? 0 : 1);\n",
  );
  // A configured check runs without an approval prompt.
  const profile = await h.call('projects', {
    action: 'save',
    profile: { name: 'Cart', cwd: h.project, checkCommands: 'node repro.js' },
  });
  const job = await h.colab({ mode: 'debug', profileId: profile.id });
  assert.equal(job.status, 'completed', job.statusText);
  assert.deepEqual(
    h.passes.map((row) => row.provider),
    ['claude', 'codex', 'claude'],
  );
  const commands = job.events.filter((row) => row.kind === 'command').map((row) => row.text);
  assert(commands.includes('Reproduction before the fix: failed (exit 1)'), commands.join('\n'));
  assert(commands.includes('Reproduction after the fix: passed (exit 0)'), commands.join('\n'));
  assert.equal(job.result.reproduction.before.approval, 'configured check');
  assert.equal(job.verificationBadge.level, 'passed');
  assert.equal(job.verificationBadge.reason, 'ATLAS ran the bug reproduction.');
  assert.equal(job.statusText, 'Complete');
  assert.equal(job.checkOffer, undefined, 'a verified task gets no check offer');
});

test('a failing provider fails the task, reports the error and still finishes its graph', async (t) => {
  const h = await colabHarness(t, {
    codex: async () => {
      throw Error('Codex lost its connection.');
    },
  });
  const job = await h.colab();
  assert.equal(job.status, 'failed');
  assert.equal(job.error, 'Codex lost its connection.');
  assert.equal(job.statusText, 'Codex lost its connection.');
  assert(h.statuses(job.id).some((row) => row.error === 'Codex lost its connection.' && row.status === row.error));
  assert.equal(job.graph.outcome, 'failed');
  assert.equal(job.budget.runStartedAt, null);
  assert(job.endedAt);
});

test('the check offer runs only offered commands and enabling it creates a profile for every task from that folder', async (t) => {
  const h = await colabHarness(t);
  const job = await h.colab();
  // Another finished task from the same folder (Windows compares folders without case).
  const sameFolder = process.platform === 'win32' ? h.project.toUpperCase() : h.project;
  h.activeJobs.set('other', { id: 'other', status: 'completed', checkOffer: { ...job.checkOffer, cwd: sameFolder } });
  await assert.rejects(
    h.call('check-offer', { action: 'run', jobId: job.id, commands: ['npm run lint'] }),
    /Choose at least one of the offered checks/,
  );
  job.status = 'running';
  await assert.rejects(
    h.call('check-offer', { action: 'run', jobId: job.id, commands: ['npm run test'] }),
    /not available to check now/,
  );
  job.status = 'completed';
  const ran = await h.call('check-offer', { action: 'run', jobId: job.id, commands: ['npm run test'] });
  assert.equal(ran.status, 'passed');
  assert.equal(ran.verification.level, 'passed');
  assert.equal(job.statusText, 'Complete');
  const answer = await h.call('check-offer', { cwd: h.project, answer: 'enable', commands: ['npm run test'] });
  assert.equal(answer.profile.name, 'project');
  assert.equal(answer.profile.autoCheck, true);
  assert.equal(answer.profile.checkCommands, 'npm run test');
  assert.equal(job.checkOffer.answered, 'enabled');
  assert.equal(h.activeJobs.get('other').checkOffer.answered, 'enabled');
  const profiles = await h.call('projects', {});
  assert.equal(profiles.find((row) => row.cwd === h.project).id, answer.profile.id);
});

test('isolated builds get their own checkout, but plan tasks work in the folder itself', async (t) => {
  // Plan passes are read-only; a pass that edits files there needs attention instead of completing.
  const h = await colabHarness(t, {
    git: true,
    codex: async (request) => (request.settings.readOnly ? status() : build(request)),
  });
  const isolated = await h.colab({ isolated: true });
  assert.equal(isolated.status, 'completed', isolated.statusText);
  assert(isolated.workspaceId);
  assert.notEqual(isolated.cwd, h.project);
  assert.equal(isolated.projectFolder, h.project);
  assert.equal(h.passes[0].cwd, isolated.cwd);
  const plan = await h.colab({ isolated: true, mode: 'plan' });
  assert.equal(plan.status, 'completed', plan.statusText);
  assert.equal(plan.workspaceId, '');
  assert.equal(plan.cwd, h.project);
  assert.equal(plan.verificationBadge, null, 'read-only modes get no badge');
});

test('queued Colab tasks run side by side, are accepted on top of each other, and a waiting task starts once settled', async (t) => {
  let started = 0,
    active = 0,
    most = 0;
  const h = await colabHarness(t, {
    git: true,
    codex: async (request) => {
      started++;
      active++;
      most = Math.max(most, active);
      // The first two builds wait for each other, which only finishes if they run at the same time.
      if (started <= 2) await until(() => started >= 2, 'a second parallel build', 10000).catch(() => {});
      active--;
      return build(request);
    },
  });
  for (const [file, waitForPrevious] of [
    ['a.txt', false],
    ['b.txt', false],
    ['c.txt', true],
  ])
    await h.call('task-queue', {
      action: 'add',
      task: { prompt: task(file), cwd: h.project, provider: 'colab', waitForPrevious },
    });
  await h.call('task-queue', { action: 'start', pauseBetween: false, concurrency: 2 });
  const items = async () => (await h.call('task-queue', {})).items;
  await until(async () => (await items()).slice(0, 2).every((row) => row.status === 'completed'), 'two tasks');
  assert.equal(most, 2, 'the first two tasks ran at the same time');
  const [a, b] = (await items()).map((row) => h.activeJobs.get(row.result?.jobId));
  assert.notEqual(a.cwd, b.cwd);
  assert(![a.cwd, b.cwd].includes(h.project));
  // The waiting task stays queued while the task above still has unaccepted changes.
  await wait(3500);
  assert.equal((await items())[2].status, 'queued');
  for (const job of [a, b]) {
    const review = await h.call('review-changes', { id: job.workspaceId });
    await h.call('review-changes', { id: job.workspaceId, action: 'accept', token: review.token });
  }
  // Git may convert line endings on the way into the project.
  assert.match(await fs.readFile(path.join(h.project, 'a.txt'), 'utf8'), /^ready\r?\n$/);
  assert.match(await fs.readFile(path.join(h.project, 'b.txt'), 'utf8'), /^ready\r?\n$/);
  await until(async () => (await items())[2].status === 'completed', 'the waiting task');
});

test('the queue waits for a task you started yourself and pauses when a queued task needs attention', async (t) => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const h = await colabHarness(t, {
    git: true,
    codex: async ({ prompt }) => {
      if (/Create held\.txt/.test(prompt)) await held;
      return /Create blocked\.txt/.test(prompt) ? status('blocked') : status();
    },
  });
  const { id } = await h.call('collab', { task: task('held.txt'), cwd: h.project, isolated: false, milestones: 'off' });
  await h.call('task-queue', {
    action: 'add',
    task: { prompt: task('blocked.txt'), cwd: h.project, provider: 'colab' },
  });
  await h.call('task-queue', { action: 'start', pauseBetween: false, concurrency: 3 });
  const queue = () => h.call('task-queue', {});
  await wait(3500);
  assert.equal((await queue()).items[0].status, 'queued', 'a task you started yourself holds the queue');
  release();
  await h.activeJobs.get(id).promise;
  await until(async () => (await queue()).items[0].status === 'needs-review', 'the queued task');
  const after = await queue();
  assert.equal(after.paused, true);
  assert.match(after.items[0].error, /A provider reported blocked work/);
});
