const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  sync = require('node:fs'),
  path = require('node:path'),
  os = require('node:os'),
  zlib = require('node:zlib');
const fixture = async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-selected-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
};
test('hunk selection preserves only chosen sections and refuses invalid indices', () => {
  const before = Array.from({ length: 30 }, (_, i) => 'line ' + i).join('\n') + '\n',
    after = before.replace('line 1\n', 'changed first\n').replace('line 28\n', 'changed last\n');
  const { selectHunks } = require('../selective-changes');
  const value = selectHunks(before, after, [0]);
  assert(value.content.includes('changed first'));
  assert(!value.content.includes('changed last'));
  assert.equal(selectHunks(before, after, []).content, before);
  assert.equal(selectHunks(before, after, [0, 1]).content, after);
  assert.throws(() => selectHunks(before, after, [8]));
});
test('test reports parse TAP, JUnit and pytest without executing XML', () => {
  const { parseTestResults: parse } = require('../test-results');
  assert.deepEqual(parse('ok 1 - first\nnot ok 2 - second\nok 3 - third # SKIP').summary, {
    passed: 1,
    failed: 1,
    skipped: 1,
  });
  const junit = parse(
    '<testsuite><testcase name="one" classname="math" time="0.2"/><testcase name="two" file="math.js" line="4"><failure>bad</failure></testcase></testsuite>',
  );
  assert.equal(junit.tests.length, 2);
  assert.equal(junit.tests[1].status, 'failed');
  assert.equal(junit.tests[0].durationMs, 200);
  assert.equal(parse('tests/test_math.py::test_add FAILED').summary.failed, 1);
});
test('preflight uses a fixed executable allowlist and checks version ranges', async () => {
  const { preflight, meets } = require('../environment-preflight');
  assert(meets('v22.14.0', '>=22'));
  assert(!meets('v20.1', '>=22'));
  const calls = [];
  const value = await preflight('.', 'node >=22\ngit >=2', {
    run: async (exe, args) => {
      calls.push([exe, args]);
      return { stdout: exe === 'node' ? 'v24.1.0' : 'git version 2.47.0' };
    },
  });
  assert.equal(value.status, 'passed');
  assert.equal(calls.length, 2);
  await assert.rejects(preflight('.', 'evil >=1'));
});
test('backup restores managed records and renderer state while preserving current recovery records', async (t) => {
  const root = await fixture(t),
    backup = require('../local-backups');
  await fs.writeFile(path.join(root, 'settings.json'), 'old settings');
  await fs.mkdir(path.join(root, 'attachments'));
  await fs.writeFile(path.join(root, 'attachments', 'one.txt'), 'attachment');
  const bytes = backup.createBackup(root, '0.9.1', {
    localStorage: { 'atlas.test': 'yes' },
    colab: { chats: [], selected: '' },
  });
  assert.equal(backup.validate(bytes).files.length, 2);
  await fs.writeFile(path.join(root, 'settings.json'), 'new settings');
  const staged = backup.stageRestore(root, bytes);
  assert(backup.applyPendingRestore(root));
  assert.equal(await fs.readFile(path.join(root, 'settings.json'), 'utf8'), 'old settings');
  assert.equal(
    await fs.readFile(path.join(root, 'recovery-backups', staged.id, 'settings.json'), 'utf8'),
    'new settings',
  );
  assert.equal(
    JSON.parse(await fs.readFile(path.join(root, '.renderer-restore.json'))).localStorage['atlas.test'],
    'yes',
  );
  const value = backup.validate(bytes);
  value.files[0].path = '../outside.json';
  assert.throws(() => backup.validate(zlib.gzipSync(Buffer.from(JSON.stringify(value)))), /Unsafe/);
});
test('backup rejects linked records and verifies content hashes', async (t) => {
  const root = await fixture(t),
    outside = path.join(root, 'outside'),
    data = path.join(root, 'data');
  await fs.mkdir(data);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
  await fs.symlink(outside, path.join(data, 'attachments'), 'junction');
  assert.throws(() => require('../local-backups').createBackup(data, '1', {}), /linked/);
});
test('storage cleanup preserves active and named snapshots and rejects stale previews', async (t) => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'changes'));
  for (const id of ['active', 'orphan', 'named-one', 'undo-one'])
    await fs.writeFile(path.join(root, 'changes', id + '.json'), '{}');
  const store = require('../storage-manager').createStorageManager(root, { protectedIds: () => ['active'] });
  const preview = await store.inspect(0);
  assert.deepEqual(
    preview.candidates.map((row) => row.path),
    ['changes/orphan.json'],
  );
  await fs.writeFile(path.join(root, 'changes', 'orphan.json'), 'newer');
  await assert.rejects(store.remove({ ...preview, paths: ['changes/orphan.json'] }), /changed/);
  const next = await store.inspect(0);
  await store.remove({ ...next, paths: ['changes/orphan.json'] });
  assert(await fs.stat(path.join(root, 'changes', 'active.json')));
  const outside = await fixture(t);
  await fs.writeFile(path.join(outside, 'outside.json'), 'preserve');
  await fs.symlink(outside, path.join(root, 'task-evidence'), process.platform === 'win32' ? 'junction' : 'dir');
  assert(!(await store.inspect(0)).candidates.some((row) => row.path.includes('outside')));
});
test('HTTP workspace never saves request headers and requires approval before network I/O', async (t) => {
  const root = await fixture(t);
  let allowed = false,
    called = 0;
  const api = require('../api-workspace').createApiWorkspace(root, {
    approve: async () => allowed,
    fetcher: async (_url, options) => {
      called++;
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, 'one-time');
      return new Response('ok', { status: 201 });
    },
  });
  const row = await api.action({
    action: 'save',
    method: 'POST',
    name: 'local',
    url: 'http://127.0.0.1:3000/test',
    body: '{}',
  });
  assert((await api.action({ action: 'send', id: row.id, headers: '{"Authorization":"one-time"}' })).cancelled);
  assert.equal(called, 0);
  allowed = true;
  assert.equal((await api.action({ action: 'send', id: row.id, headers: '{"Authorization":"one-time"}' })).status, 201);
  assert(!JSON.stringify(await api.action()).includes('one-time'));
});
test('service definitions do not autostart and readiness probes are loopback-only', async (t) => {
  const root = await fixture(t);
  let starts = 0,
    stop;
  const manager = require('../project-services').createProjectServices(root, {
    approve: async () => true,
    runner: async (_cmd, _cwd, options) => {
      starts++;
      options.onStart({ pid: 123 });
      options.onOutput('server ready');
      return new Promise((resolve) => {
        stop = () => resolve({ status: 'cancelled' });
        options.signal.addEventListener('abort', stop, { once: true });
      });
    },
    fetcher: async () => new Response('ok'),
  });
  const row = await manager.action({
    action: 'save',
    name: 'dev',
    cwd: root,
    command: 'serve',
    url: 'http://127.0.0.1:3000/',
  });
  assert.equal(starts, 0);
  await manager.action({ action: 'start', id: row.id });
  assert.equal(starts, 1);
  assert((await manager.action({ action: 'probe', id: row.id }))[0].ready);
  await manager.action({ action: 'stop', id: row.id });
  await assert.rejects(
    manager.action({ action: 'save', name: 'remote', cwd: root, command: 'serve', url: 'https://example.com' }),
  );
  manager.dispose();
});
test('multi-root workspaces validate named roots and reject overlaps', async (t) => {
  const root = await fixture(t),
    first = path.join(root, 'first'),
    second = path.join(root, 'second');
  await fs.mkdir(first);
  await fs.mkdir(second);
  const workspaces = require('../multi-root-workspaces').createMultiRootWorkspaces(root);
  const row = await workspaces.action({
    action: 'save',
    name: 'fullstack',
    roots: [
      { name: 'web', cwd: first },
      { name: 'api', cwd: second },
    ],
  });
  assert.equal(row.roots.length, 2);
  await assert.rejects(
    workspaces.action({
      action: 'save',
      roots: [
        { name: 'a', cwd: first },
        { name: 'b', cwd: root },
      ],
    }),
    /overlap/,
  );
});
test('context ranking explains selected and omitted excerpts within its budget', () => {
  const value = require('../context-ranking').chooseContext(
    {
      results: [
        { path: 'a.js', excerpt: 'x'.repeat(500), score: 5 },
        { path: 'b.js', excerpt: 'y'.repeat(500), score: 1 },
      ],
    },
    { budgetChars: 800 },
  );
  assert.equal(value.results.length, 1);
  assert.equal(value.contextSelection.omitted[0].path, 'b.js');
  assert(value.results[0].reason);
});
test('sensitive review masks findings and integration manifests do not claim enforcement', () => {
  const value = require('../sensitive-context').inspectSensitive('password=very-secret-value\nuser@example.com');
  assert.equal(value.findings.length, 2);
  assert(!JSON.stringify(value).includes('very-secret-value'));
  const manifest = require('../integration-manifest').manifest({ id: 'demo', name: 'Demo', command: 'demo', args: [] });
  assert.equal(manifest.enforced, false);
  assert.equal(manifest.declared.network, 'unspecified');
});
test('dependency edits reject cycles and preserve project boundaries', async (t) => {
  const root = await fixture(t),
    queue = require('../task-queue').createTaskQueue({ directory: root, canRun: () => false, run: async () => {} });
  await queue.action({ action: 'add', task: { cwd: root, prompt: 'build' } });
  let state = await queue.action({ action: 'add', task: { cwd: root, prompt: 'test' } });
  const [first, second] = state.items;
  await queue.action({ action: 'dependencies', id: second.id, prerequisites: [first.id] });
  await assert.rejects(queue.action({ action: 'dependencies', id: first.id, prerequisites: [second.id] }), /cycles/);
  await queue.close();
});
test('DOCX extraction reads only bounded document XML', async () => {
  const xml = Buffer.from('<w:document><w:p><w:r><w:t>Hello &amp; welcome</w:t></w:r></w:p></w:document>'),
    name = Buffer.from('word/document.xml'),
    local = Buffer.alloc(30),
    central = Buffer.alloc(46),
    end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt32LE(xml.length, 18);
  local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt32LE(xml.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);
  const offset = local.length + name.length + xml.length;
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(offset, 16);
  const value = await require('../document-extract').extractDocument(
    Buffer.concat([local, name, xml, central, name, end]),
    '.docx',
  );
  assert(value.pages[0].text.includes('Hello & welcome'));
});
test('update installation waits for its recovery preparation', async () => {
  const { EventEmitter } = require('node:events'),
    updater = new EventEmitter();
  let prepared = 0,
    installed = 0;
  updater.quitAndInstall = () => installed++;
  const updates = require('../app-updates').createAppUpdates({
    app: { getVersion: () => '1.0.0', isPackaged: true },
    updater,
    prepareRecovery: async () => prepared++,
  });
  updater.emit('update-downloaded', { version: '1.0.1' });
  await updates.action({ action: 'install' });
  await new Promise((r) => setImmediate(r));
  assert.equal(prepared, 1);
  assert.equal(installed, 1);
  let busy = false;
  const guarded = require('../app-updates').createAppUpdates({
    app: { getVersion: () => '1.0.0', isPackaged: true },
    updater,
    busy: () => busy,
    prepareRecovery: async () => {
      busy = true;
    },
  });
  updater.emit('update-downloaded', { version: '1.0.1' });
  await assert.rejects(guarded.action({ action: 'install' }), /Work started/);
  assert.equal(installed, 1);
});

test('PDF context extracts selected pages and refuses invalid page numbers', async () => {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const stream = 'BT /F1 12 Tf 50 750 Td (ATLAS document fixture) Tj ET';
  objects.push('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(source));
    source += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += 'xref\n0 6\n0000000000 65535 f \n';
  source += offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('');
  source += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const extract = require('../document-extract').extractDocument;
  const result = await extract(Buffer.from(source), '.pdf', { pages: [1] });
  assert.equal(result.totalPages, 1);
  assert.match(result.pages[0].text, /ATLAS document fixture/);
  await assert.rejects(extract(Buffer.from(source), '.pdf', { pages: [2] }), /valid PDF pages/);
});

test('Git panel stages, unstages and commits locally only after approval', async (t) => {
  const root = await fixture(t),
    exec = require('node:child_process').execFileSync;
  const git = (...args) => exec('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
  git('init');
  git('config', 'user.name', 'ATLAS fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  await fs.writeFile(path.join(root, 'demo.txt'), 'before\n');
  git('add', 'demo.txt');
  git('commit', '-m', 'Fixture seed');
  await fs.writeFile(path.join(root, 'demo.txt'), 'after\n');
  let permitted = false,
    approvals = 0;
  const panel = require('../git-panel').createGitPanel({
    approve: async () => {
      approvals++;
      return permitted;
    },
  });
  assert.equal((await panel.action({ cwd: root, action: 'stage', path: 'demo.txt' })).cancelled, true);
  assert.equal(git('diff', '--cached'), '');
  permitted = true;
  await panel.action({ cwd: root, action: 'stage', path: 'demo.txt' });
  assert.match((await panel.action({ cwd: root, action: 'diff', path: 'demo.txt', staged: true })).text, /after/);
  await panel.action({ cwd: root, action: 'unstage', path: 'demo.txt' });
  assert.equal(git('diff', '--cached'), '');
  await panel.action({ cwd: root, action: 'stage', path: 'demo.txt' });
  await panel.action({ cwd: root, action: 'commit', message: 'Fixture change' });
  assert.equal(git('log', '-1', '--format=%s').trim(), 'Fixture change');
  assert.equal(approvals, 5);
});

test('restore detects stage modification before moving current records', async (t) => {
  const root = await fixture(t),
    backups = require('../local-backups');
  await fs.writeFile(path.join(root, 'settings.json'), '{"old":true}');
  const bytes = backups.createBackup(root, 'fixture', {});
  const staged = backups.stageRestore(root, bytes);
  await fs.writeFile(path.join(root, 'settings.json'), '{"current":true}');
  await fs.writeFile(path.join(root, 'restore-staging', staged.id, 'settings.json'), '{"tampered":true}');
  assert.throws(() => backups.applyPendingRestore(root), /data changed/);
  assert.equal(await fs.readFile(path.join(root, 'settings.json'), 'utf8'), '{"current":true}');
});

test('update recovery retains executable and data and stages restoration before launch', async (t) => {
  const root = await fixture(t),
    appRoot = path.join(root, 'app'),
    directory = path.join(root, 'records');
  await fs.mkdir(appRoot);
  await fs.mkdir(directory);
  await fs.writeFile(path.join(appRoot, path.basename(process.execPath)), 'fixture executable');
  const events = [];
  const recovery = require('../update-recovery').createUpdateRecovery({
    directory,
    appRoot,
    version: '1.2.3',
    isPackaged: true,
    approve: async () => true,
    backupData: async () => Buffer.from('backup fixture'),
    restoreData: async (bytes) => {
      assert.equal(bytes.toString(), 'backup fixture');
      events.push('restore');
    },
    launch: async (executable) => {
      assert.equal(await fs.readFile(executable, 'utf8'), 'fixture executable');
      events.push('launch');
    },
  });
  const row = await recovery.prepare();
  assert.equal(row.version, '1.2.3');
  assert.equal((await recovery.status()).executable, row.executable);
  await recovery.rollback();
  assert.deepEqual(events, ['restore', 'launch']);
  await fs.writeFile(
    path.join(directory, 'update-recovery.json'),
    JSON.stringify({ ...row, data: path.join(root, 'outside') }),
  );
  await assert.rejects(recovery.rollback(), /paths changed|ENOENT/);
});
