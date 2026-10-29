const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { createProjectFiles } = require('../project-files'),
  { createChangeTracker } = require('../change-tracker'),
  { createProjectWorkbench } = require('../project-workbench');
test('named checkpoints restore only reviewed files, reject later edits, and retain undo snapshots', async (t) => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-named-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const cwd = path.join(base, 'project'),
    directory = path.join(base, 'data');
  await fs.mkdir(cwd);
  await fs.mkdir(directory);
  await fs.writeFile(path.join(cwd, 'one.txt'), 'before');
  await fs.writeFile(path.join(cwd, 'two.txt'), 'second');
  const service = createProjectWorkbench({
    directory,
    tracker: createChangeTracker(directory),
    files: createProjectFiles(),
    probe: async () => 'tool 1.0',
  });
  const row = await service.action({ cwd, action: 'capture', name: 'Before edits' });
  await fs.writeFile(path.join(cwd, 'one.txt'), 'after');
  await fs.writeFile(path.join(cwd, 'two.txt'), 'keep');
  const preview = await service.action({ cwd, id: row.id, action: 'preview', files: ['one.txt'] });
  assert.deepEqual(preview.files, ['one.txt']);
  await fs.writeFile(path.join(cwd, 'one.txt'), 'later');
  await assert.rejects(service.action({ cwd, id: row.id, action: 'restore', token: preview.token }), /Later edits/);
  const updated = await service.action({ cwd, id: row.id, action: 'preview', files: ['one.txt'] });
  await service.action({ cwd, id: row.id, action: 'restore', token: updated.token });
  assert.equal(await fs.readFile(path.join(cwd, 'one.txt'), 'utf8'), 'before');
  assert.equal(await fs.readFile(path.join(cwd, 'two.txt'), 'utf8'), 'keep');
  assert.equal((await service.action({ cwd, action: 'list' })).length, 2);
  await assert.rejects(service.action({ cwd, id: row.id, action: 'restore', token: updated.token }), /Review/);
});
test('project search finds nested text without reading private or denied files', async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-search-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, 'src'));
  await fs.writeFile(path.join(cwd, 'src', 'app.js'), 'first\nneedle in source');
  await fs.writeFile(path.join(cwd, '.env'), 'needle');
  await fs.writeFile(path.join(cwd, 'blocked.txt'), 'needle');
  const files = createProjectFiles({ denied: async () => [path.join(cwd, 'blocked.txt')] });
  const result = await files.search(cwd, 'needle', true);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].line, 2);
  assert.equal((await files.search(cwd, 'app.js')).entries[0].path, 'src/app.js');
});
test('health checks report tools and suggested checks without executing project scripts', async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-health-'));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.writeFile(path.join(cwd, 'package.json'), JSON.stringify({ scripts: { test: 'malicious command' } }));
  const calls = [],
    service = createProjectWorkbench({
      directory: os.tmpdir(),
      files: createProjectFiles(),
      probe: async (...args) => {
        calls.push(args);
        return '1.0';
      },
    });
  const report = await service.action({ cwd, action: 'health' });
  assert(report.checks.includes('npm run test'));
  assert(calls.every((call) => call[1].join(' ') === '--version' && call[2] !== cwd));
  assert(report.results.some((row) => row.name === 'Node dependencies' && row.status === 'missing'));
});
