const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
async function fixture(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-sessions-'))),
    cwd = path.join(directory, 'project');
  await fs.mkdir(cwd);
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  await fs.writeFile(path.join(cwd, 'app.js'), 'export function start(){ return 1; }\n');
  await fs.writeFile(
    path.join(cwd, 'package.json'),
    JSON.stringify({ main: 'app.js', scripts: { test: 'fixture only' } }),
  );
  await fs.writeFile(path.join(cwd, '.env'), 'PRIVATE_SENTINEL');
  const jobs = [
    {
      id: 'task',
      cwd,
      prompt: 'Fix the startup error',
      status: 'completed',
      endedAt: 2,
      changeId: 'change',
      result: { output: 'Changed app.js' },
      verification: {
        status: 'failed',
        results: [
          { command: 'npm run test', status: 'failed', exitCode: 1, output: 'Error: startup broke at app.js:12' },
        ],
      },
    },
  ];
  let allow = true,
    runs = 0,
    denied = [],
    busy = false;
  const files = require('../project-files').createProjectFiles({ denied: async () => denied });
  const knowledge = {
    analyze: async () => ({
      modules: [{ path: 'app.js', imports: [], definitions: [{ name: 'start', line: 1 }] }],
      note: 'Static hints',
    }),
    search: async () => ({ results: [{ path: 'app.js', line: 1, excerpt: 'export function start(){}' }] }),
  };
  const service = require('../work-sessions').createWorkSessions({
    directory,
    files,
    knowledge,
    jobs: () => jobs,
    approvals: () => [{ id: 'permission', jobId: 'task', title: 'Run command?' }],
    busy: () => busy,
    approve: async () => allow,
    runChecks: async () => {
      runs++;
      return { status: 'passed', results: [{ command: 'npm run test', status: 'passed', exitCode: 0, output: 'ok' }] };
    },
    archives: {
      list: async () => [{ id: 'old-task' }],
      read: async (id) => {
        if (id !== 'old-task') throw Error('Missing');
        return {
          id,
          cwd,
          title: 'Old solution',
          checks: { results: [{ command: 'legacy check', output: 'unique archived error' }] },
          diff: { files: [{ path: 'legacy.js', hunks: [] }] },
        };
      },
    },
  });
  return {
    directory,
    cwd,
    jobs,
    service,
    files,
    setAllow: (value) => (allow = value),
    setBusy: (value) => (busy = value),
    setDenied: (value) => (denied = value),
    runs: () => runs,
  };
}
test('trial checkpoint copies are isolated, binary-safe, exclude private files and compare actual variants', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.cwd, 'asset.bin'), Buffer.from([0, 1, 2, 3]));
  const checkpoint = await f.service.action({ action: 'capture', cwd: f.cwd, name: 'Before changes' });
  const first = await f.service.action({ action: 'fork', id: checkpoint.id, name: 'First' }),
    second = await f.service.action({ action: 'fork', id: checkpoint.id, name: 'Second' });
  assert.deepEqual(await fs.readFile(path.join(first.cwd, 'asset.bin')), Buffer.from([0, 1, 2, 3]));
  await assert.rejects(fs.stat(path.join(first.cwd, '.env')), /ENOENT/);
  await fs.writeFile(path.join(first.cwd, 'app.js'), 'first trial\n');
  await fs.writeFile(path.join(second.cwd, 'app.js'), 'second trial\n');
  const compared = await f.service.action({ action: 'compare', left: first.id, right: second.id });
  assert.match(compared.diffs[0].patch, /first trial/);
  assert.match(compared.diffs[0].patch, /second trial/);
  assert.match(await fs.readFile(path.join(f.cwd, 'app.js'), 'utf8'), /return 1/);
  const destination = path.join(f.directory, 'exported');
  await fs.mkdir(destination);
  const exported = await f.service.action({ action: 'export-trial', id: first.id, destination });
  assert.equal(exported.cwd, destination);
  assert.equal(await fs.readFile(path.join(destination, 'app.js'), 'utf8'), 'first trial\n');
  await assert.rejects(f.service.action({ action: 'export-trial', id: first.id, destination }), /empty/);
  await assert.rejects(f.service.action({ action: 'remove-snapshot', id: checkpoint.id }), /dependent/);
  f.setBusy(true);
  await assert.rejects(f.service.action({ action: 'capture', cwd: f.cwd }), /Finish active/);
});
test('new denied paths block copying old checkpoint contents and unsafe roots fail', async (t) => {
  const f = await fixture(t),
    checkpoint = await f.service.action({ action: 'capture', cwd: f.cwd });
  f.setDenied([path.join(f.cwd, 'app.js')]);
  await assert.rejects(f.service.action({ action: 'fork', id: checkpoint.id }), /denied/);
  await assert.rejects(f.service.action({ action: 'capture', cwd: os.tmpdir() }), /dedicated project/);
});
test('context hashes flag additions, edits and deletions without storing source contents', async (t) => {
  const f = await fixture(t),
    receipt = await f.service.action({ action: 'remember-context', cwd: f.cwd });
  await fs.writeFile(path.join(f.cwd, 'app.js'), 'updated');
  await fs.writeFile(path.join(f.cwd, 'new.js'), 'new');
  await fs.unlink(path.join(f.cwd, 'package.json'));
  const value = await f.service.action({ action: 'freshness', id: receipt.id });
  assert.deepEqual(value.changed.sort(), ['app.js', 'new.js', 'package.json']);
  const state = await fs.readFile(path.join(f.directory, 'work-sessions.json'), 'utf8');
  assert.doesNotMatch(state, /PRIVATE_SENTINEL|return 1/);
  const refreshed = await f.service.action({ action: 'context-refresh', cwd: f.cwd });
  assert.equal(refreshed.changed.length, 3);
});
test('project map distinguishes declared entry points from filename hints', async (t) => {
  const f = await fixture(t),
    map = await f.service.action({ action: 'map', cwd: f.cwd });
  assert.equal(map.entries[0].path, 'app.js');
  assert.equal(map.entries[0].reason, 'Declared package entry point');
  assert.equal(map.modules[0].definitions[0].name, 'start');
});
test('acceptance evidence keeps claims separate and invalidates links when executed checks change', async (t) => {
  const f = await fixture(t),
    claim = await f.service.action({ action: 'criteria-save', jobId: 'task', text: 'Startup works', claim: true });
  assert.match((await f.service.action({ action: 'criteria-status', jobId: 'task' }))[0].status, /unverified/);
  await f.service.action({
    action: 'criteria-save',
    id: claim.id,
    jobId: 'task',
    text: claim.text,
    checkCommand: 'npm run test',
  });
  assert.match((await f.service.action({ action: 'criteria-status', jobId: 'task' }))[0].status, /did not pass/);
  f.jobs[0].verification.results[0] = { command: 'npm run test', status: 'passed', exitCode: 0, output: 'new result' };
  assert.match((await f.service.action({ action: 'criteria-status', jobId: 'task' }))[0].status, /changed/);
  await f.service.action({
    action: 'criteria-save',
    id: claim.id,
    jobId: 'task',
    text: claim.text,
    checkCommand: 'npm run test',
  });
  assert.match((await f.service.action({ action: 'criteria-status', jobId: 'task' }))[0].status, /check passed/);
  await assert.rejects(
    f.service.action({ action: 'criteria-save', jobId: 'task', text: 'bad link', checkCommand: 'never executed' }),
    /executed check/,
  );
});
test('inbox dismissals do not approve permissions and changed evidence reappears', async (t) => {
  const f = await fixture(t),
    rows = await f.service.action({ action: 'inbox' });
  assert(rows.some((row) => row.kind === 'permission'));
  const failed = rows.find((row) => row.kind === 'check');
  await f.service.action({ action: 'dismiss', fingerprint: failed.fingerprint });
  assert(!(await f.service.action({ action: 'inbox' })).some((row) => row.kind === 'check'));
  f.jobs[0].verification.results[0].output = 'Different failure';
  assert((await f.service.action({ action: 'inbox' })).some((row) => row.kind === 'check'));
  assert.equal(f.runs(), 0);
});
test('solution search matches actual errors and archived file evidence scoped to a project', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.service.action({ action: 'task-search', query: 'startup broke', cwd: f.cwd }))[0].jobId,
    'task',
  );
  assert.equal(
    (await f.service.action({ action: 'task-search', query: 'legacy.js', cwd: f.cwd }))[0].jobId,
    'old-task',
  );
  assert.equal(
    (await f.service.action({ action: 'task-search', query: 'legacy.js', cwd: path.join(f.directory, 'elsewhere') }))
      .length,
    0,
  );
});
test('offline preparation executes only selected detected checks with approval and refuses stale drafts', async (t) => {
  const f = await fixture(t),
    prepared = await f.service.action({ action: 'prepare', cwd: f.cwd, query: 'Fix startup' });
  assert.equal(f.runs(), 0);
  const draft = await f.service.action({ action: 'preparation-draft', id: prepared.id, paths: ['app.js'] });
  assert.match(draft.text, /start/);
  assert.equal(draft.profileId, '');
  f.setAllow(false);
  assert.equal(
    (await f.service.action({ action: 'prepare', cwd: f.cwd, query: 'Fix startup', checks: ['npm run test'] }))
      .cancelled,
    true,
  );
  assert.equal(f.runs(), 0);
  f.setAllow(true);
  await f.service.action({
    action: 'prepare',
    cwd: f.cwd,
    query: 'Fix startup',
    checks: ['npm run test', 'arbitrary command'],
  });
  assert.equal(f.runs(), 1);
  await fs.writeFile(path.join(f.cwd, 'app.js'), 'changed');
  await assert.rejects(
    f.service.action({ action: 'preparation-draft', id: prepared.id, paths: ['app.js'] }),
    /Project changed/,
  );
});
test('bug reports require reproduction and review, omit raw output by default and redact credentials', async (t) => {
  const f = await fixture(t);
  f.jobs[0].verification.results[0].output = 'Bearer private-sentinel-secret';
  const report = await f.service.action({
    action: 'bug-preview',
    jobId: 'task',
    steps: 'Open app\nClick start',
    expected: 'App starts',
    actual: 'It fails',
  });
  assert.doesNotMatch(report.text, /private-sentinel/);
  await assert.rejects(f.service.action({ action: 'bug-reviewed', id: report.id, text: report.text }), /review/);
  const detailed = await f.service.action({
    action: 'bug-preview',
    jobId: 'task',
    steps: 'Open app',
    expected: 'Starts',
    actual: 'Fails',
    includeOutput: true,
  });
  assert.match(detailed.text, /REDACTED/);
  assert.equal(
    (await f.service.action({ action: 'bug-reviewed', id: detailed.id, text: 'User reviewed report', confirm: true }))
      .text,
    'User reviewed report',
  );
  await assert.rejects(
    f.service.action({ action: 'bug-preview', steps: '', expected: '', actual: '' }),
    /Supply reproduction/,
  );
});
test('trial checkpoints are protected from generic orphan-evidence cleanup', async (t) => {
  const f = await fixture(t);
  await f.service.action({ action: 'capture', cwd: f.cwd });
  const storage = require('../storage-manager').createStorageManager(f.directory);
  const inspected = await storage.inspect(0);
  assert(!inspected.candidates.some((row) => row.path.includes('trial-snapshots')));
});
test('managed checkpoint storage refuses directory links outside ATLAS data', async (t) => {
  const f = await fixture(t),
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-outside-sessions-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(f.directory, 'task-evidence'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(f.service.action({ action: 'capture', cwd: f.cwd }), /outside ATLAS/);
  await assert.rejects(fs.stat(path.join(outside, 'trial-snapshots')), /ENOENT/);
});
test('work-session IPC rejects untrusted windows and requires a reviewed report before a save dialog', async (t) => {
  const { mainHarness } = require('./fixtures/main-harness.cjs');
  let dialogs = 0;
  const h = await mainHarness(t, {
    dialog: {
      showSaveDialog: async () => {
        dialogs++;
        return { filePath: path.join(h.dir, 'report.json') };
      },
      showOpenDialog: async () => ({ canceled: true }),
    },
  });
  h.setupIpc();
  const event = { sender: h.sender, senderFrame: { url: 'atlas://app/' } },
    call = (request) => h.handlers.get('atlas:work-session')(event, request);
  await assert.rejects(h.handlers.get('atlas:work-session')({}, {}), /Untrusted/);
  await assert.rejects(call({ action: 'bug-export', id: 'missing', confirm: true, text: 'x' }), /Preview and review/);
  assert.equal(dialogs, 0);
  const report = await call({ action: 'bug-preview', steps: 'Open app', expected: 'Starts', actual: 'Fails' });
  await call({ action: 'bug-export', id: report.id, confirm: true, text: report.text });
  assert.equal(dialogs, 1);
  assert.match(await fs.readFile(path.join(h.dir, 'report.json'), 'utf8'), /Open app/);
  assert.equal((await call({ action: 'export-trial', id: 'anything' })).cancelled, true);
  await h.assistantService.flush();
});
