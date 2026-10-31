const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { createLanguageServer } = require('../language-server');
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-lsp-'));
  const project = path.join(root, 'project');
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'main.js'), 'const café = 1;\nconsole.log(café);');
  const service = createLanguageServer({
    directory: root,
    files: require('../project-files').createProjectFiles(),
    approve: async () => true,
    ...options,
  });
  t.after(async () => {
    service.dispose();
    await new Promise((r) => setTimeout(r, 100));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  await service.action({
    action: 'save',
    cwd: project,
    config: {
      command: process.execPath,
      args: [path.join(__dirname, 'fixtures/language-server.cjs'), ...(options.args || [])],
      languageId: 'javascript',
    },
  });
  return { root, project, service };
}
test('real stdio language server navigates, filters outside locations and handles diagnostics', async (t) => {
  const { project, service } = await fixture(t);
  assert.equal((await service.action({ action: 'settings', cwd: project })).running, false);
  const result = await service.action({ action: 'definition', cwd: project, path: 'main.js', line: 1, column: 8 });
  assert.deepEqual(result.rows, [{ path: 'main.js', line: 1, column: 7 }]);
  const references = await service.action({ action: 'references', cwd: project, path: 'main.js' });
  assert.equal(references.rows.length, 1);
  const diagnostics = await service.action({ action: 'diagnostics', cwd: project, path: 'main.js' });
  assert.equal(diagnostics.rows[0].message, 'Fixture café diagnostic');
  await fs.writeFile(path.join(project, 'main.js'), 'const updated = 2;');
  assert.equal((await service.action({ action: 'definition', cwd: project, path: 'main.js' })).rows.length, 1);
  await service.action({ action: 'stop' });
  assert.equal((await service.action({ action: 'settings', cwd: project })).running, false);
});
test('push diagnostics match rewritten file URIs and do not outlive a changed file', async (t) => {
  const normalized = await fixture(t, { args: ['--normalize-uri'] });
  const rows = await normalized.service.action({ action: 'diagnostics', cwd: normalized.project, path: 'main.js' });
  assert.equal(rows.rows[0]?.message, 'Fixture café diagnostic');
  const once = await fixture(t, { args: ['--publish-once'] });
  const first = await once.service.action({ action: 'diagnostics', cwd: once.project, path: 'main.js' });
  assert.equal(first.rows.length, 1);
  await fs.writeFile(path.join(once.project, 'main.js'), 'const updated = 2;');
  const changed = await once.service.action({ action: 'diagnostics', cwd: once.project, path: 'main.js' });
  assert.deepEqual(changed.rows, []);
  assert.match(changed.note, /No diagnostic report/);
});
test('language server save executes nothing; denied start and private files never spawn', async (t) => {
  let spawns = 0;
  const { project, service } = await fixture(t, {
    approve: async () => false,
    spawnProcess: () => {
      spawns++;
      throw Error('unexpected spawn');
    },
  });
  await fs.writeFile(path.join(project, '.env'), 'TEST=fixture');
  await assert.rejects(service.action({ action: 'definition', cwd: project, path: '.env' }), /private/);
  await assert.rejects(
    service.action({ action: 'definition', cwd: project, path: 'main.js', line: 20 }),
    /existing line/,
  );
  await assert.rejects(service.action({ action: 'definition', cwd: project, path: 'main.js' }), /cancelled/);
  assert.equal(spawns, 0);
  await assert.rejects(
    service.action({ action: 'save', cwd: project, config: { command: 'node', args: [], languageId: 'js' } }),
    /absolute/,
  );
});
test('malformed protocol and stalled language-server requests fail within bounds', async (t) => {
  const malformed = await fixture(t, { args: ['--bad-frame'] });
  await assert.rejects(
    malformed.service.action({ action: 'definition', cwd: malformed.project, path: 'main.js' }),
    /message length/,
  );
  const stalled = await fixture(t, { args: ['--timeout'], timeoutMs: 1000 });
  await assert.rejects(
    stalled.service.action({ action: 'definition', cwd: stalled.project, path: 'main.js' }),
    /timed out/,
  );
});
test('language-server IPC rejects untrusted windows before creating a server', async (t) => {
  const h = await require('./fixtures/main-harness.cjs').mainHarness(t);
  h.setupIpc();
  await assert.rejects(
    h.handlers.get('atlas:language-server')({ senderFrame: { url: 'https://invalid.test' } }, {}),
    /Untrusted/,
  );
});
