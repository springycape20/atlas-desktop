const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-deeper-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return folder;
}
test('history migrates without rewriting the legacy source, pages and searches all chunks, and preserves other chats', async (t) => {
  const folder = await fixture(t),
    legacy = [
      {
        id: 'first',
        title: 'First',
        updatedAt: 1,
        turns: Array.from({ length: 5000 }, (_, index) => ({
          role: 'user',
          content: index === 3 ? 'ancient needle' : 'message ' + index,
        })),
      },
      { id: 'second', title: 'Second', turns: [{ content: 'keep this' }] },
    ];
  let migrations = 0;
  const store = require('../chunked-history').createChunkedHistory(folder, {
    legacy: async () => {
      migrations++;
      return legacy;
    },
  });
  const tail = await store.read('first', { page: 0 });
  assert.equal(tail.turns.length, 150);
  assert.equal(tail.turns[0].content, 'message 4850');
  assert.equal(tail.historyPage.total, 5000);
  assert.equal((await store.read('first', { page: 33 })).turns.length, 50);
  const search = await store.read('first', { page: 0, query: 'ancient needle' });
  assert.deepEqual(search.historyPage.indices, [3]);
  assert.equal(search.turns.length, 1);
  assert.equal((await store.list('ancient needle'))[0].id, 'first');
  await store.upsert([{ ...legacy[1], turns: [{ content: 'updated second' }] }]);
  assert.equal((await store.read('first')).turns.length, 5000);
  assert.equal(migrations, 1);
  const reopened = require('../chunked-history').createChunkedHistory(folder, {
    legacy: async () => {
      throw Error('must not migrate again');
    },
  });
  assert.equal((await reopened.read('second')).turns[0].content, 'updated second');
  const index = JSON.parse(await fs.readFile(path.join(folder, 'chat-index.json')));
  assert.equal(index.chats[0].turns, undefined);
  assert.equal(legacy[0].turns.length, 5000);
  const chunk = index.chats[0].chunks[0];
  await fs.writeFile(path.join(folder, 'chat-chunks', chunk.hash + '.json'), '[]');
  await assert.rejects(reopened.read('first'), /integrity/);
  index.chats[0].turnCount++;
  const damagedIndex = JSON.stringify(index);
  await fs.writeFile(path.join(folder, 'chat-index.json'), damagedIndex);
  const invalid = require('../chunked-history').createChunkedHistory(folder);
  await assert.rejects(invalid.upsert([{ id: 'replacement', turns: [] }]), /Invalid chat history index/);
  assert.equal(await fs.readFile(path.join(folder, 'chat-index.json'), 'utf8'), damagedIndex);
});
test('visual masks exclude only reviewed regions and refuse total masking', () => {
  const { comparePixels } = require('../preview-evidence');
  const image = (values) => ({
    getSize: () => ({ width: 2, height: 2 }),
    toBitmap: () => Buffer.from(values.flatMap((value) => [value, value, value, 255])),
  });
  const before = image([0, 0, 0, 0]),
    after = image([255, 255, 0, 0]);
  const value = comparePixels(before, after, 16, [{ x: 0, y: 0, width: 1, height: 1 }]);
  assert.equal(value.changedPixels, 1);
  assert.equal(value.ignoredPixels, 1);
  assert.equal(value.totalPixels, 3);
  assert.deepEqual(value.bounds, { x: 1, y: 0, width: 1, height: 1 });
  assert.throws(() => comparePixels(before, after, 16, [{ x: 0, y: 0, width: 2, height: 2 }]), /entire/);
  assert.throws(() => comparePixels(before, after, 16, [{ x: 1, y: 0, width: 2, height: 1 }]), /fit/);
});
test('context slices find enclosing functions, split identifiers and identify changed lines', () => {
  const { focusedSlice, changedRange, queryWords } = require('../context-slices');
  const lines = [
    'function unrelated() {}',
    '',
    'function renderProject() {',
    '  const nested = { text: "}" };',
    '  return nested;',
    '}',
    'function other() {}',
  ];
  const slice = focusedSlice(lines, 4, 'view.js');
  assert.match(slice.excerpt, /function renderProject/);
  assert.match(slice.excerpt, /return nested/);
  assert.doesNotMatch(slice.excerpt, /function other/);
  assert.deepEqual(queryWords('renderProject foo_bar'), ['render', 'project', 'foo', 'bar']);
  assert.deepEqual(changedRange(['a', 'b'], ['a', 'x', 'b']), { start: 1, end: 1 });
});
test('Node debugger requires approval, pauses, inspects locals, steps and stops an owned process', async (t) => {
  const folder = await fixture(t);
  await fs.writeFile(
    path.join(folder, 'main.js'),
    'let count = 1;\ncount += 2;\nconsole.log(count);\nsetTimeout(() => {}, 20000);\n',
  );
  const { createNodeDebugger } = require('../node-debugger');
  const denied = createNodeDebugger({ approve: async () => false });
  assert.deepEqual(await denied.action({ action: 'start', cwd: folder, path: 'main.js' }), { cancelled: true });
  assert.equal(denied.active(), false);
  const service = createNodeDebugger({ approve: async () => true });
  t.after(() => service.dispose());
  await service.action({ action: 'start', cwd: folder, path: 'main.js' });
  const waitFor = async (predicate) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await service.action({ action: 'status' });
      if (predicate(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error('Debugger state not reached');
  };
  await waitFor((value) => value.paused);
  await service.action({ action: 'breakpoint-add', cwd: folder, path: 'main.js', line: 3 });
  await service.action({ action: 'resume', cwd: folder });
  const paused = await waitFor((value) => value.paused && value.frames[0]?.line === 3);
  assert.equal(paused.frames[0].path, 'main.js');
  const scope = paused.frames[0].scopes.find((row) => ['local', 'script'].includes(row.type));
  assert.ok(scope);
  const variables = await service.action({ action: 'variables', cwd: folder, frame: 0, scope: scope.index });
  assert.ok(variables.variables.some((row) => row.name === 'count' && row.value === '3'));
  await assert.rejects(service.action({ action: 'evaluate', cwd: folder, expression: 'process.exit()' }), /Unknown/);
  await service.action({ action: 'step-over', cwd: folder });
  await waitFor((value) => value.paused);
  await service.action({ action: 'stop' });
  assert.equal(service.active(), false);
});

test('debugger IPC rejects untrusted callers before constructing the service', async (t) => {
  let created = 0;
  const h = await require('./fixtures/main-harness.cjs').mainHarness(t, {
    modules: {
      './node-debugger': {
        createNodeDebugger: () => {
          created++;
          return { action: async () => ({ active: false }), dispose() {}, active: () => false };
        },
      },
    },
  });
  h.setupIpc();
  await assert.rejects(
    h.handlers.get('atlas:node-debugger')(
      { sender: {}, senderFrame: { url: 'https://outside.invalid' } },
      { action: 'start' },
    ),
    /Untrusted/,
  );
  assert.equal(created, 0);
  const status = await h.handlers.get('atlas:node-debugger')(
    { sender: h.sender, senderFrame: { url: 'atlas://app/index.html' } },
    { action: 'status' },
  );
  assert.equal(status.active, false);
  assert.equal(created, 1);
});

test('packaged debugger resolves an absolute installed Node path and refuses Electron or relative paths', async (t) => {
  const folder = await fixture(t),
    name = process.platform === 'win32' ? 'node.exe' : 'node',
    node = path.join(folder, name);
  await fs.writeFile(node, 'lookup fixture; never executed');
  const { resolveNodeExecutable } = require('../node-debugger'),
    self = path.join(folder, 'ATLAS.exe');
  assert.equal(
    await resolveNodeExecutable('', { electron: true, self, env: { PATH: ['.', folder].join(path.delimiter) } }),
    await fs.realpath(node),
  );
  await assert.rejects(resolveNodeExecutable('./' + name), /absolute path/);
  await assert.rejects(resolveNodeExecutable(self), /Node.js executable/);
  await assert.rejects(
    resolveNodeExecutable('', { electron: true, self, env: { PATH: '.' } }),
    /Node.js was not found/,
  );
});
