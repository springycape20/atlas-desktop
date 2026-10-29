const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
const { createReceiver } = require('../statistics-receiver/service.cjs'),
  { createReport } = require('../statistics-report'),
  { createReportStore } = require('../admin-panel/store.cjs');
test('receiver requires admin authentication, validates payloads, deduplicates and honours private deletion proofs', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-receiver-')),
    now = Date.UTC(2026, 9, 29),
    adminToken = 'a'.repeat(64),
    deleteToken = 'b'.repeat(64),
    server = createReceiver({ directory: root, adminToken, now: () => now });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  });
  const base = 'http://127.0.0.1:' + server.address().port,
    report = createReport({ jobs: [], version: '0.9.1', period: '2026-10', now });
  const post = (body) =>
    fetch(base + '/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await fetch(base + '/v1/admin/reports')).status, 401);
  assert.equal((await post({ report: { ...report, chats: ['PRIVATE'] }, deleteToken })).status, 400);
  assert.equal((await post({ report, deleteToken })).status, 201);
  assert.equal((await post({ report, deleteToken })).status, 200);
  let snapshot = await (
    await fetch(base + '/v1/admin/reports', { headers: { Authorization: 'Bearer ' + adminToken } })
  ).json();
  assert.equal(snapshot.reports.length, 1);
  assert(!JSON.stringify(snapshot).includes(deleteToken));
  const file = path.join(root, 'snapshot.json');
  await fs.writeFile(file, JSON.stringify(snapshot));
  const store = createReportStore(path.join(root, 'insights'), { now: () => now });
  assert.equal((await store.action({ action: 'import', paths: [file] })).accepted, 1);
  const remove = (token) =>
    fetch(base + '/v1/reports', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId: report.reportId, deleteToken: token }),
    });
  assert.equal((await remove('c'.repeat(64))).status, 403);
  assert.equal((await remove(deleteToken)).status, 204);
  assert.equal((await post({ report, deleteToken })).status, 410);
  snapshot = await (
    await fetch(base + '/v1/admin/reports', { headers: { Authorization: 'Bearer ' + adminToken } })
  ).json();
  assert.equal(snapshot.reports.length, 0);
  const saved = await fs.readFile(path.join(root, 'receiver.json'), 'utf8');
  for (const privateValue of ['PRIVATE', deleteToken, '127.0.0.1', 'user-agent']) assert(!saved.includes(privateValue));
});
