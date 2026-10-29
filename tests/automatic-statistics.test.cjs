const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { configuration, createAutomaticStatistics } = require('../automatic-statistics');
const cfg = {
  enabled: true,
  endpoint: 'https://stats.example.test/v1/reports',
  operator: 'Test operator',
  privacyUrl: 'https://example.test/privacy',
  contact: 'privacy@example.test',
  noticeVersion: '1',
};
async function fixture(t, fetcher) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-auto-stat-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  let clock = Date.UTC(2026, 9, 29),
    count = 8;
  return {
    directory,
    now: () => clock,
    advance: (value) => (clock = value),
    jobs: () => Array.from({ length: count }, () => ({ status: 'completed', endedAt: Date.UTC(2026, 9, 20) })),
    more: () => (count = 40),
    fetcher,
  };
}
async function optin(service) {
  const preview = await service.action({ action: 'preview' });
  await service.action({ action: 'enable', token: preview.token, confirmed: true });
  return preview;
}
test('normal build has no service and makes no requests or task reads before explicit opt-in', async (t) => {
  let requests = 0,
    reads = 0;
  const f = await fixture(t),
    service = createAutomaticStatistics({
      ...f,
      jobs: () => {
        reads++;
        return [];
      },
      version: '0.9.1',
      config: require('../statistics-config.json'),
      fetcher: async () => requests++,
    });
  assert.equal((await service.action({ action: 'status' })).enabled, false);
  await service.tick();
  assert.equal(requests, 0);
  assert.equal(reads, 0);
  await assert.rejects(service.action({ action: 'preview' }), /No receiving/);
  assert.throws(() => configuration({ ...cfg, endpoint: 'http://example.test/v1/reports' }));
  assert.throws(() => configuration({ ...cfg, operator: '' }));
});
test('consent requires current preview and notice configuration; enable does not send or backfill', async (t) => {
  let requests = 0;
  const f = await fixture(t),
    service = createAutomaticStatistics({
      ...f,
      version: '0.9.1',
      config: cfg,
      fetcher: async () => {
        requests++;
        return { ok: true };
      },
    });
  await assert.rejects(service.action({ action: 'enable', confirmed: true }), /Review/);
  const preview = await service.action({ action: 'preview' });
  await assert.rejects(service.action({ action: 'enable', token: preview.token }), /Review/);
  await service.action({ action: 'enable', token: preview.token, confirmed: true });
  await service.tick();
  assert.equal(requests, 0);
  const changed = createAutomaticStatistics({ ...f, version: '0.9.1', config: { ...cfg, noticeVersion: '2' } });
  assert.equal((await changed.action({ action: 'status' })).enabled, false);
});
test('automatic retries reuse a frozen monthly payload and occur no sooner than 24 hours', async (t) => {
  const bodies = [];
  const f = await fixture(t),
    service = createAutomaticStatistics({
      ...f,
      version: '0.9.1',
      config: cfg,
      fetcher: async (_url, request) => {
        bodies.push(request.body);
        if (bodies.length === 1) throw Error('offline');
        return { ok: true };
      },
    });
  await optin(service);
  f.advance(Date.UTC(2026, 10, 2));
  await service.tick();
  assert.equal(bodies.length, 1);
  f.more();
  await service.tick();
  assert.equal(bodies.length, 1);
  f.advance(Date.UTC(2026, 10, 3) + 1);
  await service.tick();
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
  await service.tick();
  assert.equal(bodies.length, 2);
  const envelope = JSON.parse(bodies[0]);
  assert.equal(envelope.report.period, '2026-10');
  assert.equal(envelope.report.outcomes.completed, 10);
  assert(!bodies[0].includes('endedAt'));
});
test('withdrawal aborts in-flight work, clears pending payload and preserves deletion proof', async (t) => {
  let begun;
  const started = new Promise((resolve) => (begun = resolve));
  const f = await fixture(t),
    service = createAutomaticStatistics({
      ...f,
      version: '0.9.1',
      config: cfg,
      fetcher: async (_url, request) => {
        begun();
        return new Promise((_resolve, reject) =>
          request.signal.addEventListener('abort', () => reject(Error('aborted'))),
        );
      },
    });
  await optin(service);
  f.advance(Date.UTC(2026, 10, 2));
  const work = service.tick();
  await started;
  await service.action({ action: 'disable' });
  await work;
  const stored = JSON.parse(await fs.readFile(path.join(f.directory, 'automatic-statistics.json'), 'utf8'));
  assert.equal(stored.consent, null);
  assert.equal(stored.pending, null);
  assert.equal(stored.receipts.length, 1);
  assert.equal((await service.action({ action: 'status' })).enabled, false);
});
test('stored pending reports with extra private fields fail closed instead of being transmitted', async (t) => {
  const f = await fixture(t),
    service = createAutomaticStatistics({ ...f, version: '0.9.1', config: cfg });
  await optin(service);
  const location = path.join(f.directory, 'automatic-statistics.json'),
    state = JSON.parse(await fs.readFile(location, 'utf8'));
  state.pending = { report: { chats: ['private'] }, deleteToken: 'a'.repeat(64) };
  await fs.writeFile(location, JSON.stringify(state));
  let calls = 0;
  const restarted = createAutomaticStatistics({
    ...f,
    version: '0.9.1',
    config: cfg,
    fetcher: async () => {
      calls++;
      return { ok: true };
    },
  });
  await assert.rejects(restarted.tick(), /remains disabled/);
  assert.equal(calls, 0);
});
