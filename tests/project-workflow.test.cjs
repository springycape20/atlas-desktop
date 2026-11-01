const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { createProjectEditor } = require('../project-editor'),
  { createProjectFiles } = require('../project-files');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-editor-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'app.js'), 'const value = "Hello";\nHello');
  return root;
}
test('editor protects newer edits and undo only touches the saved file', async (t) => {
  const root = await fixture(t),
    editor = createProjectEditor({ files: createProjectFiles() });
  const file = await editor.action(root, { action: 'editor-read', path: 'app.js' });
  const saved = await editor.action(root, {
    action: 'editor-save',
    path: file.path,
    text: 'changed',
    version: file.version,
  });
  await fs.writeFile(path.join(root, 'unrelated.txt'), 'later');
  await assert.rejects(
    editor.action(root, { action: 'editor-save', path: file.path, text: 'stale', version: file.version }),
    /changed on disk/,
  );
  await editor.action(root, { action: 'editor-undo', id: saved.undoId });
  assert.equal(await fs.readFile(path.join(root, 'app.js'), 'utf8'), file.text);
  assert.equal(await fs.readFile(path.join(root, 'unrelated.txt'), 'utf8'), 'later');
});
test('replacement previews literals, excludes folders and credentials, and preflights all versions', async (t) => {
  const root = await fixture(t),
    editor = createProjectEditor({ files: createProjectFiles() });
  await fs.mkdir(path.join(root, 'skip'));
  await fs.writeFile(path.join(root, 'skip/a.js'), 'Hello');
  await fs.writeFile(path.join(root, '.env'), 'Hello secret');
  await fs.writeFile(path.join(root, 'second.js'), 'Hello');
  const plan = await editor.action(root, {
    action: 'replace-preview',
    find: 'Hello',
    replacement: '$&',
    exclusions: 'skip',
  });
  assert.equal(plan.files.length, 2);
  assert.equal(plan.files.find((row) => row.path === 'app.js').count, 2);
  const preview = await editor.action(root, { action: 'replace-file', id: plan.id, path: 'app.js' });
  assert(preview.after.includes('"$&"'));
  await fs.writeFile(path.join(root, 'second.js'), 'newer');
  await assert.rejects(
    editor.action(root, { action: 'replace-apply', id: plan.id, paths: plan.files.map((row) => row.path) }),
    /changed on disk/,
  );
  assert((await fs.readFile(path.join(root, 'app.js'), 'utf8')).includes('Hello'));
  const next = await editor.action(root, {
    action: 'replace-preview',
    find: 'hello',
    replacement: 'World',
    exclusions: 'skip',
  });
  const result = await editor.action(root, { action: 'replace-apply', id: next.id, paths: ['app.js'] });
  assert(result.saved);
  await fs.writeFile(path.join(root, 'app.js'), 'later edit');
  await assert.rejects(editor.action(root, { action: 'editor-undo', id: result.undoId }), /changed on disk/);
  assert.equal(await fs.readFile(path.join(root, '.env'), 'utf8'), 'Hello secret');
});
test('editor denies credential files and writes while tasks are active', async (t) => {
  const root = await fixture(t),
    editor = createProjectEditor({ files: createProjectFiles(), busy: () => true });
  await fs.writeFile(path.join(root, '.env'), 'secret');
  await assert.rejects(editor.action(root, { action: 'editor-read', path: '.env' }));
  const file = await editor.action(root, { action: 'editor-read', path: 'app.js' });
  await assert.rejects(
    editor.action(root, { action: 'editor-save', path: 'app.js', text: 'changed', version: file.version }),
    /running tasks/,
  );
});
test('diagnostic defaults omit content, optional exports redact paths and tokens', () => {
  const { diagnosticBundle } = require('../workflow-evidence');
  const args = {
    version: '0.9.1',
    platform: 'win32',
    jobs: [
      {
        prompt: 'private chat',
        cwd: 'C:/private',
        verification: { results: [{ status: 'failed', command: 'test C:/private', output: 'token=secret-value' }] },
      },
    ],
    log: 'token=secret-value C:/private',
    privatePaths: ['C:/private'],
  };
  const basic = JSON.stringify(diagnosticBundle(args));
  assert(!basic.includes('secret-value'));
  assert(!basic.includes('private chat'));
  assert(!basic.includes('C:/private'));
  const extra = JSON.stringify(diagnosticBundle({ ...args, includeLogs: true, includeOutput: true }));
  assert(!extra.includes('secret-value'));
  assert(!extra.includes('C:/private'));
  assert(extra.includes('[local path]'));
  assert.equal(diagnosticBundle(args).description, undefined);
  const described = diagnosticBundle({ ...args, description: 'In C:/private: token=secret-value ' + 'x'.repeat(5000) });
  assert(described.description.startsWith('In [local path]:'));
  assert(!described.description.includes('secret-value'));
  assert(described.description.length <= 4000);
});
test('task evidence uses executed checks, timestamps and only reported usage', () => {
  const { taskEvidence } = require('../workflow-evidence');
  const row = taskEvidence({
    id: 'a',
    startedAt: 100,
    endedAt: 900,
    result: {},
    verification: { status: 'failed', results: [{ status: 'failed', command: 'npm test' }] },
  });
  assert.equal(row.durationMs, 800);
  assert.equal(row.usage, null);
  assert.equal(row.diff, null);
  assert.equal(row.checks.status, 'failed');
  assert.equal(taskEvidence({ result: { usage: { inputTokens: 0, outputTokens: 0, reported: false } } }).usage, null);
});
test('preview recipes use fixed loopback arguments and reject executable argument injection', async (t) => {
  const root = await fixture(t),
    { previewRecipe } = require('../preview-recipes');
  await fs.mkdir(path.join(root, 'node_modules/next/dist/bin'), { recursive: true });
  await fs.writeFile(path.join(root, 'node_modules/next/dist/bin/next'), '// fixture');
  const next = await previewRecipe(root, { recipe: 'next', port: 3001 }, { PATH: path.dirname(process.execPath) });
  assert(next.args.includes('127.0.0.1'));
  assert.equal(next.url, 'http://127.0.0.1:3001/');
  const alias = root + '-alias';
  await fs.symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  t.after(() => fs.rm(alias, { recursive: true, force: true }));
  const linked = await previewRecipe(alias, { recipe: 'next', port: 3001 }, { PATH: path.dirname(process.execPath) });
  assert.equal(linked.args[0], next.args[0], 'A project alias must resolve to the same in-project executable');
  const python = path.join(root, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  await fs.mkdir(path.dirname(python), { recursive: true });
  await fs.writeFile(python, 'fixture');
  const flask = await previewRecipe(root, { recipe: 'flask', module: 'server:app', port: 5001 });
  assert(flask.args.includes('--no-debugger'));
  assert(flask.args.includes('--no-reload'));
  assert(flask.args.includes('127.0.0.1'));
  assert.equal(flask.url, 'http://127.0.0.1:5001/');
  await assert.rejects(previewRecipe(root, { recipe: 'flask', module: 'app;whoami' }), /Python module/);
  await assert.rejects(previewRecipe(root, { recipe: 'next', port: 80 }), /port/);
});
test('queue prerequisites block downstream tasks after failure and preserve dependency order', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-chain-')),
    { createTaskQueue } = require('../task-queue');
  let enabled = false;
  const runs = [];
  const queue = createTaskQueue({
    directory: root,
    canRun: () => enabled,
    run: async (row) => {
      runs.push(row.prompt);
      if (row.prompt === 'build') throw Error('build failed');
      return {};
    },
  });
  t.after(async () => {
    await queue.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const first = (await queue.action({ action: 'add', task: { cwd: root, prompt: 'build' } })).items[0];
  const second = (await queue.action({ action: 'add', task: { cwd: root, prompt: 'test', prerequisites: [first.id] } }))
    .items[1];
  await assert.rejects(queue.action({ action: 'move', id: second.id, direction: 'up' }), /Required tasks/);
  await assert.rejects(queue.action({ action: 'remove', id: first.id }), /dependent tasks/);
  await queue.action({ action: 'start', pauseBetween: false });
  enabled = true;
  await queue.tick();
  await queue.action({ action: 'start', pauseBetween: false });
  await queue.tick();
  assert.deepEqual(runs, ['build']);
  assert.equal((await queue.action()).items[1].status, 'queued');
});

test('a successful build-test-review chain runs in dependency order', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-chain-')),
    { createTaskQueue } = require('../task-queue');
  let enabled = false;
  const runs = [];
  const queue = createTaskQueue({
    directory: root,
    canRun: () => enabled,
    run: async (row) => {
      runs.push(row.prompt);
      return {};
    },
  });
  t.after(async () => {
    await queue.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  let state = await queue.action({ action: 'add', task: { cwd: root, prompt: 'build' } });
  state = await queue.action({
    action: 'add',
    task: { cwd: root, prompt: 'test', prerequisites: [state.items[0].id] },
  });
  await queue.action({ action: 'add', task: { cwd: root, prompt: 'review', prerequisites: [state.items[1].id] } });
  await queue.action({ action: 'start', pauseBetween: false });
  enabled = true;
  for (let n = 0; n < 100 && runs.length < 3; n++) {
    await queue.tick();
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.deepEqual(runs, ['build', 'test', 'review']);
  for (let n = 0; n < 100; n++) {
    if ((await queue.action()).items.every((row) => row.status === 'completed')) break;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert((await queue.action()).items.every((row) => row.status === 'completed'));
});

test('replacement growth is bounded and UTF-8 byte order marks survive save and undo', async (t) => {
  const root = await fixture(t),
    editor = createProjectEditor({ files: createProjectFiles() });
  await fs.writeFile(path.join(root, 'bom.txt'), '\uFEFFhello');
  const file = await editor.action(root, { action: 'editor-read', path: 'bom.txt' });
  assert(file.text.startsWith('\uFEFF'));
  const saved = await editor.action(root, {
    action: 'editor-save',
    path: 'bom.txt',
    text: file.text + ' world',
    version: file.version,
  });
  await editor.action(root, { action: 'editor-undo', id: saved.undoId });
  assert.equal(await fs.readFile(path.join(root, 'bom.txt'), 'utf8'), '\uFEFFhello');
  await fs.writeFile(path.join(root, 'large.txt'), 'x'.repeat(1000));
  await assert.rejects(
    editor.action(root, { action: 'replace-preview', find: 'x', replacement: 'y'.repeat(10000) }),
    /exceed 256 KB/,
  );
});
