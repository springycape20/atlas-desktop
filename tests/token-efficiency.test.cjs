const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { budget, createContextReuse } = require('../request-efficiency');
const { focusOutput, checkEvidence } = require('../focused-check-output');
const { plan, repairOnce } = require('../check-escalation');
test('budget includes request, excludes deselected text and discloses unknown context and image cost', () => {
  const result = budget(
    [
      { id: 'files', text: 'x'.repeat(40) },
      { id: 'history', text: 'x'.repeat(1000), included: false },
    ],
    { prompt: 'hello', imageCount: 2, limit: 10, scope: 'colab' },
  );
  assert.equal(result.estimatedTokens, 12);
  assert.equal(result.overBudget, true);
  assert.equal(result.rows[2].estimatedTokens, 0);
  assert.equal(result.complete, false);
  assert.match(result.note, /Image cost/);
  assert.match(result.expectedPasses, /builder and reviewer/);
});
test('reuse requires successful same-scope session continuity and refreshes on expiry, failures and request override', () => {
  let now = 1;
  const cache = createContextReuse({ now: () => now, refreshAfter: 3, maxAgeMs: 100 });
  const block = { id: 'file', label: 'file.txt', text: 'reference '.repeat(70), cacheable: true };
  const prompt = 'CURRENT INSTRUCTIONS\n' + block.text + '\nCURRENT REQUEST';
  const prepare = (extra = {}) => cache.prepare({ prompt, blocks: [block], identity: 'model-a', ...extra });
  const first = prepare();
  assert.equal(first.render({ sessionId: 's', resumed: false }), prompt);
  first.commit('s');
  const follow = prepare();
  const reduced = follow.render({ sessionId: 's', resumed: true });
  assert.ok(reduced.length < prompt.length);
  assert.match(reduced, /CURRENT REQUEST/);
  assert.match(reduced, /CURRENT INSTRUCTIONS/);
  follow.commit('s');
  for (const extra of [{ identity: 'model-b' }, { forceFull: true }, { enabled: false }])
    assert.equal(prepare(extra).render({ sessionId: 's', resumed: true }), prompt);
  const failed = prepare();
  failed.render({ sessionId: 's', resumed: true });
  failed.fail();
  assert.equal(prepare().render({ sessionId: 's', resumed: true }), prompt);
  first.render({ sessionId: 's', resumed: false });
  first.commit('s');
  now = 102;
  assert.equal(prepare().render({ sessionId: 's', resumed: true }), prompt);
  assert.equal(prepare().render({ sessionId: 'different', resumed: true }), prompt);
});
test('duplicate blocks and repeated source text are never removed', () => {
  const cache = createContextReuse(),
    block = { id: 'a', text: 'abc '.repeat(100), cacheable: true };
  for (const blocks of [[block, block], [block]]) {
    const prompt = block.text + block.text,
      first = cache.prepare({ prompt, blocks, identity: 'a' });
    first.render({ sessionId: 's', resumed: false });
    first.commit('s');
    assert.equal(cache.prepare({ prompt, blocks, identity: 'a' }).render({ sessionId: 's', resumed: true }), prompt);
  }
});
test('focused evidence preserves failed diagnostics and check statuses within its strict budget', () => {
  const log =
    'ok noisy output\n'.repeat(1000) +
    '\nError: exact failure in app.js:12\nexpected true\n' +
    'ok noisy output\n'.repeat(1000);
  assert.match(focusOutput(log, 800), /exact failure/);
  assert.ok(focusOutput(log, 800).length <= 800);
  assert.equal(focusOutput(log, 0), '');
  const evidence = checkEvidence(
    [
      { command: 'lint', status: 'passed', exitCode: 0, output: 'SUCCESS_SECRET_NOISE' },
      { command: 'test', status: 'failed', exitCode: 1, output: log },
    ],
    { limit: 1200 },
  );
  assert.match(evidence, /lint · passed/);
  assert.match(evidence, /test · failed/);
  assert.match(evidence, /exact failure/);
  assert.doesNotMatch(evidence, /SUCCESS_SECRET_NOISE/);
  assert.ok(evidence.length <= 1200);
  const tap = checkEvidence([
    {
      command: 'test',
      status: 'failed',
      exitCode: 1,
      output: 'not ok 1 - total\nAssertionError: expected 10 but got 12\n at cart.js:7',
      testResults: { tests: [{ name: 'total', status: 'failed' }] },
    },
  ]);
  assert.match(tap, /AssertionError/);
  assert.match(tap, /cart.js:7/);
});
test('one stronger repair requires opted-in automatic fast routing and actual failing checks on changed files', async () => {
  const input = {
    settings: {
      modelRoutingEnabled: true,
      checkDrivenEscalation: true,
      fastCodexModel: 'fast',
      strongCodexModel: 'strong',
    },
    choice: { model: 'fast' },
    provider: 'codex',
    changedFiles: 1,
    verification: { status: 'failed', results: [{ status: 'failed', exitCode: 1 }] },
  };
  assert.equal(plan(input).model, 'strong');
  for (const extra of [
    { pinned: true },
    { tier: 'strong' },
    { stopped: true },
    { changedFiles: 0 },
    { provider: 'local' },
    { verification: { status: 'failed', results: [{ status: 'timed-out', exitCode: 1 }] } },
    { settings: { ...input.settings, readOnly: true } },
    { settings: { ...input.settings, checkDrivenEscalation: false } },
  ])
    assert.equal(plan({ ...input, ...extra }), null);
  let runs = 0,
    checks = 0;
  const result = await repairOnce({
    plan: plan(input),
    run: async () => {
      runs++;
      return { output: 'fixed' };
    },
    verify: async () => {
      checks++;
      return { status: 'failed' };
    },
  });
  assert.equal(runs, 1);
  assert.equal(checks, 1);
  assert.equal(result.escalation.status, 'failed');
  const signal = AbortSignal.abort();
  await assert.rejects(
    repairOnce({
      plan: plan(input),
      signal,
      run: async () => {
        runs++;
      },
      verify: async () => {},
    }),
  );
  assert.equal(runs, 1);
});
test('handover revisions require review after edits and produce local unsent drafts without deleting source tasks', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-milestone-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const jobs = [
    {
      id: 'job',
      status: 'completed',
      endedAt: 1,
      cwd: dir,
      prompt: 'Keep all requirements',
      request: { profileId: 'p' },
      result: { output: 'Model summary' },
      verification: { results: [{ command: 'test', status: 'failed', exitCode: 1 }] },
    },
  ];
  const service = require('../milestone-handovers').createMilestoneHandovers(dir, {
    jobs: () => jobs,
    changes: () => ({}),
  });
  let packet = await service.action({ action: 'create', jobId: 'job' });
  await assert.rejects(service.action({ action: 'draft', id: packet.id, revision: 1 }), /Review/);
  packet = await service.action({ action: 'review', id: packet.id, revision: 1, confirm: true });
  const draft = await service.action({ action: 'draft', id: packet.id, revision: 1 });
  assert.match(draft.text, /test · failed · exit 1/);
  assert.equal(draft.profileId, 'p');
  assert.equal(jobs.length, 1);
  packet = await service.action({
    action: 'save',
    id: packet.id,
    revision: 1,
    packet: { ...packet, decisions: 'Must preserve this constraint' },
  });
  assert.equal(packet.reviewedAt, null);
  await assert.rejects(service.action({ action: 'review', id: packet.id, revision: 1, confirm: true }), /changed/);
  await assert.rejects(service.action({ action: 'draft', id: packet.id, revision: 2 }), /Review/);
  await service.action({ action: 'review', id: packet.id, revision: 2, confirm: true });
  assert.match(
    (await service.action({ action: 'draft', id: packet.id, revision: 2 })).text,
    /Must preserve this constraint/,
  );
});
