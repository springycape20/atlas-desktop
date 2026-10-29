const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const until = async (fn) => {
  for (let n = 0; n < 150; n++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error('State did not settle');
};
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-deep-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
test('project intelligence traces reverse imports, definitions, references and likely tests', () => {
  const { analyzeRecords } = require('../code-intelligence');
  const rows = [
    { path: 'src/math.js', text: 'export function add(a,b) { return a+b; }' },
    {
      path: 'src/page.js',
      text: "import {add} from './math';\nfunction render() {return add(1,2);}\n// add(3,4)\nconst label='add';",
    },
    { path: 'tests/page.test.js', text: "const page=require('../src/page');\ntest('renders',()=>page.render());" },
  ];
  const value = analyzeRecords(rows, { file: 'src/math.js', symbol: 'add' });
  assert(value.definitions.some((row) => row.path === 'src/math.js' && row.name === 'add'));
  assert.deepEqual(
    value.affected.map((row) => row.path),
    ['src/page.js', 'tests/page.test.js'],
  );
  assert.deepEqual(value.tests, ['tests/page.test.js']);
  assert(!value.references.some((row) => row.line === 3 || row.line === 4));
  assert(value.references.some((row) => row.path === 'src/page.js' && row.line === 2));
  assert.throws(() => analyzeRecords(rows, { symbol: 'add.*' }), /symbol/);
});
test('intelligence refresh excludes denied directory contents and deleted files', async (t) => {
  const root = await fixture(t),
    { createKnowledgeIndex } = require('../project-knowledge');
  await fs.mkdir(path.join(root, 'private'));
  await fs.writeFile(path.join(root, 'main.js'), 'function main(){}');
  await fs.writeFile(path.join(root, 'private/a.js'), 'function secret(){}');
  let names = ['main.js', 'private/a.js'];
  const index = createKnowledgeIndex({ listFiles: async () => names });
  assert((await index.analyze(root, { symbol: 'secret' })).definitions.length);
  assert.equal((await index.analyze(root, { symbol: 'secret', excluded: ['private'] })).definitions.length, 0);
  names = ['private/a.js'];
  assert.equal((await index.analyze(root, { symbol: 'main' })).definitions.length, 0);
});
test('task evidence remains immutable after later edits and detects corruption', async (t) => {
  const root = await fixture(t),
    archive = require('../task-archive').createTaskArchive(root);
  const job = {
    id: 'task-one',
    prompt: 'Build',
    cwd: root,
    status: 'completed',
    startedAt: 1,
    endedAt: 100,
    verification: { status: 'passed', results: [{ command: 'test', status: 'passed', output: 'original' }] },
  };
  const report = {
    checkedAt: 100,
    files: [
      { path: 'app.js', status: 'modified', added: 1, removed: 1, patch: { hunks: [{ lines: ['-old', '+new'] }] } },
    ],
  };
  const first = await archive.save(job, report);
  job.verification.results[0].output = 'later';
  report.files[0].patch.hunks[0].lines = ['+later'];
  await archive.save(job, report);
  const stored = await archive.read(job.id);
  assert.equal(stored.sha256, first.sha256);
  assert.equal(stored.checks.results[0].output, 'original');
  assert.deepEqual(stored.diff.files[0].hunks[0].lines, ['-old', '+new']);
  assert.equal((await archive.list()).length, 1);
  const location = path.join(root, 'task-evidence/task-one.json'),
    data = JSON.parse(await fs.readFile(location));
  data.evidence.status = 'tampered';
  await fs.writeFile(location, JSON.stringify(data));
  await assert.rejects(archive.read(job.id), /integrity/);
});
test('verified recovery refuses newer files and restores only the stopped stage changes', async (t) => {
  const root = await fixture(t),
    project = path.join(root, 'project');
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'app.js'), 'saved stage');
  const tracker = require('../change-tracker').createChangeTracker(path.join(root, 'data')),
    id = 'stage';
  await tracker.capture(id, project);
  const job = { resumeCheckpoint: { id, stages: 2 }, collaboration: true };
  const { inspectRecovery, requireVerifiedRecovery } = require('../verified-recovery');
  assert((await inspectRecovery(job, tracker)).verified);
  await fs.writeFile(path.join(project, 'app.js'), 'partial next stage');
  await tracker.seal(id);
  assert(!(await inspectRecovery(job, tracker)).verified);
  await assert.rejects(requireVerifiedRecovery(job, tracker), /Files changed/);
  const preview = await tracker.restorePreview(id);
  await tracker.restore(id, preview.token);
  assert((await inspectRecovery(job, tracker)).verified);
  assert.equal(await fs.readFile(path.join(project, 'app.js'), 'utf8'), 'saved stage');
  assert((await inspectRecovery({}, tracker)).legacy);
});
test('managed worktree snapshots include source files while unrelated app data stays excluded', async (t) => {
  const root = await fixture(t),
    project = path.join(root, 'worktrees', 'one');
  await fs.mkdir(project, { recursive: true });
  await fs.writeFile(path.join(project, 'app.js'), 'before');
  const tracker = require('../change-tracker').createChangeTracker(root);
  await tracker.capture('managed', project);
  await fs.writeFile(path.join(project, 'app.js'), 'after');
  assert.equal((await tracker.report('managed', true)).files[0].path, 'app.js');
  await tracker.capture('private-data', root);
  assert.equal((await tracker.verifySnapshot('private-data')).complete, false);
});
test('checkpoint readers and restores honour newly denied files', async (t) => {
  const root = await fixture(t),
    project = path.join(root, 'project');
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'app.js'), 'before');
  let allowed = true;
  const tracker = require('../change-tracker').createChangeTracker(path.join(root, 'data'), {
    permitted: async () => allowed,
  });
  await tracker.capture('denial', project);
  await fs.writeFile(path.join(project, 'app.js'), 'after');
  await tracker.seal('denial');
  allowed = false;
  await assert.rejects(tracker.file('denial', 'app.js'), /denied|no longer changed/);
  await assert.rejects(tracker.restorePreview('denial'), /denied/);
  assert.equal(await fs.readFile(path.join(project, 'app.js'), 'utf8'), 'after');
});
test('terminal approval, streaming, input approval and cancellation use one owned process', async (t) => {
  const root = await fixture(t),
    { createProjectTerminal } = require('../project-terminal');
  let allow = false,
    runs = 0,
    writes = [],
    options;
  const terminal = createProjectTerminal({
    approve: async () => allow,
    runner: async (command, cwd, opts) => {
      runs++;
      options = opts;
      opts.onStart({ pid: 42, write: (text) => writes.push(text) });
      opts.onOutput('live output');
      return new Promise((resolve) =>
        opts.signal.addEventListener('abort', () => resolve({ status: 'cancelled', exitCode: null }), { once: true }),
      );
    },
  });
  t.after(() => terminal.dispose());
  assert((await terminal.action({ action: 'start', cwd: root, command: 'sample' })).cancelled);
  assert.equal(runs, 0);
  allow = true;
  const row = await terminal.action({ action: 'start', cwd: root, command: 'sample' });
  await until(() => runs === 1);
  assert(options.interactive);
  assert.equal((await terminal.action({ action: 'list' }))[0].output, 'live output');
  await terminal.action({ action: 'start', cwd: root, command: 'another' });
  assert.equal((await terminal.action({ action: 'list' })).length, 2);
  allow = false;
  await terminal.action({ action: 'input', id: row.id, text: 'no' });
  assert.equal(writes.length, 0);
  allow = true;
  await terminal.action({ action: 'input', id: row.id, text: 'yes' });
  assert.deepEqual(writes, ['yes\n']);
  await terminal.action({ action: 'stop', id: row.id });
  await until(async () => (await terminal.action({ action: 'list' }))[0].status === 'cancelled');
});
test('command runner exposes streaming and stdin without interpreting terminal output as markup', async () => {
  const { EventEmitter } = require('node:events'),
    { runCheck } = require('../project-tools');
  let child,
    onStart,
    output = '',
    writes = [];
  const done = runCheck('test', '.', {
    interactive: true,
    onStart: (value) => {
      onStart = value;
    },
    onOutput: (text) => (output += text),
    spawnProcess: (_exe, _args, options) => {
      assert.equal(options.stdio[0], 'pipe');
      child = new EventEmitter();
      child.pid = 8;
      child.stdin = new EventEmitter();
      child.stdin.write = (text) => writes.push(text);
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      return child;
    },
  });
  onStart.write('hello\n');
  child.stdout.emit('data', Buffer.from('<script>sample</script>'));
  child.emit('close', 0);
  assert.equal((await done).status, 'passed');
  assert.equal(output, '<script>sample</script>');
  assert.deepEqual(writes, ['hello\n']);
});
test('repair loop stops after success and never exceeds its repair limit', async () => {
  const { createRepairLoop } = require('../repair-loop');
  let checked = 0,
    repaired = 0;
  const loop = createRepairLoop({
    approve: async () => ({}),
    checkpoint: async () => 'safe',
    check: async () => [{ status: ++checked >= 3 ? 'passed' : 'failed', exitCode: checked >= 3 ? 0 : 1 }],
    repair: async () => {
      repaired++;
      return 'repair-' + repaired;
    },
  });
  const row = await loop.action({ action: 'start', jobId: 'one', attempts: 2, seconds: 30 });
  await until(async () => (await loop.action({ action: 'list' }))[0].status !== 'running');
  assert.equal((await loop.action({ action: 'list' }))[0].status, 'passed');
  assert.equal(repaired, 2);
  assert.equal(checked, 3);
  const exhausted = createRepairLoop({
    approve: async () => ({}),
    checkpoint: async () => 'safe',
    check: async () => [{ status: 'failed' }],
    repair: async () => 'one',
  });
  await exhausted.action({ action: 'start', attempts: 1, seconds: 30 });
  await until(async () => (await exhausted.action({ action: 'list' }))[0].status === 'exhausted');
  assert.equal((await exhausted.action({ action: 'list' }))[0].runs.length, 2);
  assert(row.id);
});
test('repair denial and abnormal checks never call a provider', async () => {
  const { createRepairLoop } = require('../repair-loop');
  let work = 0;
  const denied = createRepairLoop({
    approve: async () => false,
    checkpoint: async () => work++,
    check: async () => work++,
    repair: async () => work++,
  });
  assert((await denied.action({ action: 'start' })).cancelled);
  assert.equal(work, 0);
  const loop = createRepairLoop({
    approve: async () => ({}),
    checkpoint: async () => 'safe',
    check: async () => [{ status: 'timed-out' }],
    repair: async () => work++,
  });
  await loop.action({ action: 'start' });
  await until(async () => (await loop.action({ action: 'list' }))[0].status === 'needs-review');
  assert.equal(work, 0);
  await assert.rejects(loop.action({ action: 'start', attempts: 4 }), /1–3/);
});
test('repair timeout aborts in-flight checks and prevents later repairs', async () => {
  const { createRepairLoop } = require('../repair-loop');
  let timeout,
    repairs = 0;
  const loop = createRepairLoop({
    approve: async () => ({}),
    checkpoint: async () => 'safe',
    setTimer: (fn) => {
      timeout = fn;
      return { unref() {} };
    },
    clearTimer: () => {},
    check: async (_input, { signal }) =>
      new Promise((resolve) =>
        signal.addEventListener('abort', () => resolve([{ status: 'cancelled' }]), { once: true }),
      ),
    repair: async () => repairs++,
  });
  await loop.action({ action: 'start', seconds: 30 });
  await new Promise((r) => setImmediate(r));
  timeout();
  await until(async () => (await loop.action({ action: 'list' }))[0].status === 'timed-out');
  assert.equal(repairs, 0);
});
test('advanced repair integration rejects unrecorded commands and stops provider work on cancellation', async (t) => {
  const root = await fixture(t),
    jobs = new Map([
      [
        'source',
        {
          id: 'source',
          cwd: root,
          prompt: 'fix',
          status: 'completed',
          verification: { results: [{ command: 'test', status: 'failed' }] },
        },
      ],
    ]);
  let calls = 0,
    interrupted = false,
    release;
  const engine = require('../advanced-workflows').createAdvancedWorkflows({
    jobs,
    tracker: { capture: async () => {} },
    knowledge: {},
    busy: () => false,
    denied: async () => [],
    workspace: {},
    persist: async () => {},
    approve: async () => true,
    runner: async () => ({ status: 'failed', exitCode: 1 }),
    startRepair: (data) => {
      calls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
    interrupt: () => {
      interrupted = true;
      release();
    },
  });
  t.after(() => engine.dispose());
  await assert.rejects(
    engine.action({ tool: 'repair', action: 'start', jobId: 'source', commands: ['evil'] }),
    /recorded checks/,
  );
  const row = await engine.action({
    tool: 'repair',
    action: 'start',
    jobId: 'source',
    commands: ['test'],
    seconds: 30,
  });
  await until(() => calls === 1);
  await engine.action({ tool: 'repair', action: 'stop', id: row.id });
  await until(async () => (await engine.action({ tool: 'repair', action: 'list' }))[0].status === 'cancelled');
  assert(interrupted);
});
test('repair tasks receive only selected checks and reuse their executed completion verification', async (t) => {
  const root = await fixture(t),
    jobs = new Map([
      [
        'source',
        {
          id: 'source',
          cwd: root,
          status: 'failed',
          verification: {
            results: [
              { command: 'selected', status: 'failed' },
              { command: 'not-selected', status: 'failed' },
            ],
          },
        },
      ],
    ]);
  let checks = 0,
    providerCalls = 0;
  const engine = require('../advanced-workflows').createAdvancedWorkflows({
    jobs,
    tracker: { capture: async () => {} },
    knowledge: {},
    busy: () => false,
    denied: async () => [],
    workspace: {},
    persist: async () => {},
    approve: async () => true,
    runner: async (command) => {
      assert.equal(command, 'selected');
      checks++;
      return { command, status: checks === 1 ? 'failed' : 'passed', exitCode: checks === 1 ? 1 : 0 };
    },
    startRepair: async (data, verify) => {
      providerCalls++;
      const verification = await verify(new AbortController().signal);
      jobs.set(data.requestId, { verification });
    },
    interrupt: () => {},
  });
  t.after(() => engine.dispose());
  await engine.action({
    tool: 'repair',
    action: 'start',
    jobId: 'source',
    commands: ['selected'],
    attempts: 2,
    seconds: 30,
  });
  await until(async () => (await engine.action({ tool: 'repair', action: 'list' }))[0].status !== 'running');
  assert.equal((await engine.action({ tool: 'repair', action: 'list' }))[0].status, 'passed');
  assert.equal(checks, 2);
  assert.equal(providerCalls, 1);
});
