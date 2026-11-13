const test = require('node:test'),
  assert = require('node:assert/strict');
const model = require('../qol-model');
test('errors give actionable summaries, keep details bounded and redact common credentials', () => {
  const info = model.errorInfo('OAuth session expired Bearer private-token');
  assert.equal(info.action, 'connection');
  assert.match(info.detail, /redacted/);
  assert(!info.detail.includes('private-token'));
  assert.equal(model.errorInfo('usage limit').action, 'usage');
  assert.equal(model.errorInfo('Permission denied').action, 'review');
  assert.equal(model.errorInfo('a'.repeat(20000)).detail.length, 12000);
});
test('reset countdowns handle short, multi-day, missing and elapsed windows with Australian exact dates', () => {
  assert.equal(model.resetTime(3600000, 0), 'Resets in 1h');
  assert.equal(model.resetTime(90061000, 0), 'Resets in 1d 1h 2m');
  assert.equal(model.resetTime(1, 2), 'Reset time passed');
  assert.equal(model.resetTime(null), 'Reset time unavailable');
  assert.match(model.exactTime(Date.parse('2026-11-13T00:00:00Z')), /13 Nov 2026/);
});
test('chat badges prioritize approvals and active work, then unseen finished results', () => {
  const job = { id: 'a', status: 'completed', endedAt: 100 };
  assert.equal(model.badge([job], [], 50), 'New result');
  assert.equal(model.badge([job], [], 100), '');
  assert.equal(model.badge([{ ...job, status: 'running' }], [], 50), 'Running');
  assert.equal(model.badge([{ ...job, status: 'running' }], [{ jobId: 'a' }], 50), 'Needs approval');
  assert.equal(model.badge([{ ...job, archived: true }], [], 50), '');
});
test('draft recovery isolates chats and projects, survives reopening, removes sent text and bounds storage', () => {
  const values = new Map(),
    storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  let clock = 0;
  const create = () => model.createDraftStore(storage, () => ++clock),
    store = create();
  const first = store.identity('a', 'C:/One'),
    second = store.identity('b', 'C:/One');
  store.put(first, 'Draft one');
  store.put(second, 'Draft two');
  assert.equal(create().get(first), 'Draft one');
  assert.equal(create().get(store.identity('a', 'C:/Other')), '');
  create().remove(first);
  assert.equal(store.get(first), '');
  assert.equal(store.get(second), 'Draft two');
  assert.throws(() => store.put(first, 'x'.repeat(128001)), /too large/);
  for (let i = 0; i < 40; i++) store.put('draft:' + i, 'x'.repeat(20000));
  assert.equal(store.get('draft:0'), '');
  assert(store.get('draft:39'));
  const rows = JSON.parse(values.get('atlas.draft-recovery.v1'));
  assert(rows.length <= 30);
  assert(rows.reduce((n, r) => n + r.text.length, 0) <= 512000);
});
test('bulk cleanup and undo are all-or-nothing and cannot reverse later task changes', async () => {
  const { createTaskOrganization } = require('../task-organization');
  const jobs = [
    { id: 'a', status: 'failed' },
    { id: 'b', status: 'completed' },
    { id: 'live', status: 'running' },
  ];
  let pending = [];
  const service = createTaskOrganization({ jobs: () => jobs, approvals: () => pending, save: async () => {} });
  await assert.rejects(service.action({ action: 'organize-many', operation: 'archive', ids: ['a', 'live'] }), /active/);
  assert.equal(jobs[0].archived, undefined);
  const result = await service.action({ action: 'organize-many', operation: 'archive', ids: ['a', 'b'] });
  assert.equal(result.count, 2);
  assert(jobs[0].archived);
  await service.action({ action: 'undo-organize', token: result.undoToken });
  assert.equal(jobs[0].archived, undefined);
  const later = await service.action({ action: 'organize-many', operation: 'archive', ids: ['a', 'b'] });
  jobs[1].statusText = 'changed';
  await assert.rejects(service.action({ action: 'undo-organize', token: later.undoToken }), /changed/);
  assert(jobs[0].archived);
  pending = [{ jobId: 'a' }];
  await assert.rejects(
    service.action({ action: 'organize-many', operation: 'archive', ids: ['a'] }),
    /pending approvals/,
  );
});
