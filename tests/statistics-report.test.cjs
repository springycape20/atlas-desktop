const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { createReport, periods, registerStatistics } = require('../statistics-report'),
  schema = require('../statistics-schema'),
  { createReportStore } = require('../admin-panel/store.cjs');
const now = Date.UTC(2026, 9, 29),
  id = '12345678-1234-4234-8234-123456789012';
const report = () =>
  createReport({
    jobs: Array.from({ length: 8 }, () => ({
      status: 'completed',
      endedAt: now,
      collaboration: true,
      workspaceId: 'private/path',
      verification: { status: 'passed' },
    })),
    period: '2026-10',
    version: '0.9.1',
    now,
    id,
  });
async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-statistics-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  return root;
}
test('report construction reads only allowed metadata and emits coarse counters without content', () => {
  const job = { status: 'completed', endedAt: now, collaboration: true };
  for (const key of ['prompt', 'cwd', 'result', 'error', 'events', 'sessions', 'request'])
    Object.defineProperty(job, key, {
      get() {
        throw Error('Sensitive field read: ' + key);
      },
    });
  const value = createReport({ jobs: Array(8).fill(job), period: '2026-10', version: '0.9.1', now, id });
  assert.equal(value.outcomes.completed, 10);
  assert.equal(value.versionFamily, '0.9');
  assert.equal(value.features.colabTasks, 10);
  assert.deepEqual(Object.keys(value), [
    'schema',
    'reportId',
    'period',
    'versionFamily',
    'coverage',
    'rounding',
    'outcomes',
    'features',
  ]);
  assert(!JSON.stringify(value).includes('private'));
  assert.deepEqual(periods(now).slice(0, 2), ['2026-10', '2026-09']);
});
test('schema rejects extra fields, injection strings, identifiers, bad counts and unknown nested data', () => {
  for (const bad of [
    { ...report(), chats: [] },
    { ...report(), ip: '127.0.0.1' },
    { ...report(), versionFamily: '<script>' },
    { ...report(), period: '2026-13' },
    { ...report(), reportId: 'device-id' },
    { ...report(), outcomes: { ...report().outcomes, reply: 'secret' } },
    { ...report(), features: { ...report().features, colabTasks: Infinity } },
    { ...report(), outcomes: { completed: 3, failed: 0, cancelled: 0 } },
    { ...report(), features: { ...report().features, colabTasks: 100 } },
  ])
    assert.throws(() => schema.validate(bad));
  assert.throws(() =>
    schema.validate(JSON.parse(JSON.stringify(report()).replace('"schema":', '"__proto__":{},"schema":'))),
  );
});
test('only terminal retained tasks in the chosen month are counted', () => {
  const value = createReport({
    jobs: [
      ...Array(5).fill({ status: 'failed', endedAt: now }),
      ...Array(5).fill({ status: 'running', startedAt: now }),
      ...Array(5).fill({ status: 'completed', endedAt: Date.UTC(2026, 8, 1) }),
    ],
    period: '2026-10',
    version: '0.9.1',
    now,
    id,
  });
  assert.equal(value.outcomes.failed, 5);
  assert.equal(value.outcomes.completed, 0);
  assert.equal(schema.aggregate([value, value]).reports, 1);
  assert.throws(() => createReport({ jobs: [], period: '2020-01', version: '0.9.1', now, id }));
});
test('export IPC requires trusted sender, explicit preview, matching review token and separate save action', async (t) => {
  const root = await temporary(t),
    handlers = new Map();
  let reads = 0,
    clock = now;
  registerStatistics({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    trusted: (event) => event.trusted,
    jobs: () => {
      reads++;
      return [];
    },
    version: '0.9.1',
    dialog: { showSaveDialog: async () => ({ filePath: path.join(root, 'report.json') }) },
    window: () => null,
    now: () => clock,
  });
  const handler = handlers.get('atlas:statistics-report'),
    call = (request) => handler({ trusted: true }, request);
  await call({ action: 'months' });
  assert.equal(reads, 0);
  await assert.rejects(handler({}, { action: 'preview', confirmed: true, period: '2026-10' }), /Untrusted/);
  await assert.rejects(call({ action: 'preview', period: '2026-10' }), /Confirm/);
  assert.equal(reads, 0);
  await assert.rejects(call({ action: 'export' }), /Preview/);
  const preview = await call({ action: 'preview', period: '2026-10', confirmed: true });
  assert.equal(reads, 1);
  await assert.rejects(fs.stat(path.join(root, 'report.json')));
  await assert.rejects(call({ action: 'export', token: 'wrong' }), /Preview/);
  await call({ action: 'export', token: preview.token });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'report.json'), 'utf8')), preview.report);
  const next = await call({ action: 'preview', period: '2026-10', confirmed: true });
  await call({ action: 'discard' });
  await assert.rejects(call({ action: 'export', token: next.token }), /Preview/);
  const stale = await call({ action: 'preview', period: '2026-10', confirmed: true });
  clock += 300001;
  await assert.rejects(call({ action: 'export', token: stale.token }), /Preview/);
});
test('admin imports strict reports, rejects content/oversized data, deduplicates receipts and never stores source filenames', async (t) => {
  const root = await temporary(t),
    data = path.join(root, 'data');
  const good = path.join(root, 'private-client-name.json'),
    bad = path.join(root, 'chat.json'),
    large = path.join(root, 'large.json');
  await fs.writeFile(good, JSON.stringify(report()));
  await fs.writeFile(bad, JSON.stringify({ ...report(), chat: 'PRIVATE CHAT' }));
  await fs.writeFile(large, 'x'.repeat(8193));
  const store = createReportStore(data, { now: () => now });
  const result = await store.action({ action: 'import', paths: [good, good, bad, large] });
  assert.deepEqual(result, { accepted: 1, duplicates: 1, rejected: 2, expired: 0, capacity: 0 });
  const saved = await fs.readFile(path.join(data, 'reports.json'), 'utf8');
  assert(!saved.includes('PRIVATE CHAT'));
  assert(!saved.includes('private-client-name'));
  assert.equal((await store.action({ action: 'summary' })).tasks, 10);
  await store.action({ action: 'remove', id });
  assert.equal((await store.action({ action: 'list' })).length, 0);
});
test('admin retention purges old months and conflicting same-ID reports cannot replace data', async (t) => {
  const root = await temporary(t),
    data = path.join(root, 'data'),
    file = path.join(root, 'report.json');
  let clock = now;
  const store = createReportStore(data, { now: () => clock });
  await fs.writeFile(file, JSON.stringify(report()));
  await store.action({ action: 'import', paths: [file] });
  await fs.writeFile(file, JSON.stringify({ ...report(), outcomes: { completed: 20, failed: 0, cancelled: 0 } }));
  assert.equal((await store.action({ action: 'import', paths: [file] })).rejected, 1);
  assert.equal((await store.action({ action: 'list' }))[0].outcomes.completed, 10);
  clock = Date.UTC(2027, 10, 1);
  assert.equal((await store.action({ action: 'list' })).length, 0);
  assert.equal(JSON.parse(await fs.readFile(path.join(data, 'reports.json'), 'utf8')).reports.length, 0);
});
