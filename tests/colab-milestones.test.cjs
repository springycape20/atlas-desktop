const test = require('node:test'),
  assert = require('node:assert/strict'),
  { createCollaboration, parseVerdict } = require('../collaboration');
const status = (decision = 'ready', extra = {}) =>
  'Result\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision, blockingIssues: [], ...extra });
const plan = [
  { title: 'Data model', goal: 'Store totals', criteria: ['Totals are stored in cents'], check: 'npm test -- model' },
  { title: 'API', criteria: ['GET /totals returns cents', { text: 'Errors use 400' }], check: 'npm test -- api' },
  { title: 'Docs', criteria: ['README explains totals'] },
];
const blocker = (id, criterion = 'TASK') => ({
  id,
  criterion,
  summary: 'Required fix ' + id,
  evidence: 'totals.js:12 shows ' + id,
});
const pass = { status: 'passed', exitCode: 0, output: 'ok' },
  fail = { status: 'failed', exitCode: 1, output: 'not ok 2 - cents' };
const task = 'Store all cart totals in cents across the model, API and docs';
function harness(outputs, { checks = [pass], fingerprints = null } = {}) {
  const calls = [],
    prompts = [],
    settings = [],
    sessions = [],
    ran = [],
    queue = [...checks];
  let reads = 0;
  const run = createCollaboration({
    progress() {},
    fingerprint: async () => (fingerprints ? { complete: true, value: fingerprints(reads++) } : null),
    milestoneCheck: async (command, milestone) => {
      ran.push({ command, milestone });
      return { command, phase: milestone, ...(queue.length > 1 ? queue.shift() : queue[0]) };
    },
    runProvider: async (provider, prompt, _cwd, passSettings, session) => {
      calls.push(provider);
      prompts.push(prompt);
      settings.push(passSettings);
      sessions.push(session);
      return { output: outputs[calls.length - 1] || status(), sessionId: provider + '-' + calls.length };
    },
  });
  return { run, calls, prompts, settings, sessions, ran };
}
const planned = (extra = {}) =>
  status('ready', { criteria: ['Totals use cents everywhere'], milestones: plan, ...extra });

test('a milestone plan is numbered by ATLAS with scoped criteria IDs', () => {
  const parsed = parseVerdict(status('ready', { milestones: plan }));
  assert(parsed.valid);
  assert.deepEqual(
    parsed.milestones.map((row) => row.id),
    ['M1', 'M2', 'M3'],
  );
  assert.deepEqual(parsed.milestones[1].criteria, [
    { id: 'M2.1', text: 'GET /totals returns cents' },
    { id: 'M2.2', text: 'Errors use 400' },
  ]);
  assert.equal(parsed.milestones[0].check, 'npm test -- model');
  assert.equal(parsed.milestones[2].check, '', 'a milestone may have no check command');
});
test('no milestones, or an empty list, means the builder did not split the task', () => {
  assert.equal(parseVerdict(status('ready')).milestones, null);
  assert.equal(parseVerdict(status('ready', { milestones: [] })).milestones, null);
});
test('plans outside 3 to 8 milestones or without criteria need a corrected verdict', () => {
  for (const milestones of [
    plan.slice(0, 2),
    Array(9).fill(plan[0]),
    [...plan.slice(0, 2), { title: 'Docs', criteria: [] }],
    [...plan.slice(0, 2), { criteria: ['x'] }],
    [...plan.slice(0, 2), { title: 'Docs', criteria: Array(7).fill('x') }],
    'M1, M2, M3',
  ]) {
    const parsed = parseVerdict(status('ready', { milestones }));
    assert.equal(parsed.valid, false, JSON.stringify(milestones).slice(0, 80));
    assert.match(parsed.error, /milestone/i);
  }
});
test('in Auto the builder can return a plan; each milestone is built, checked and reviewed, then a fresh final review', async () => {
  const h = harness([
    planned(),
    status(), // plan review
    status(), // M1 build
    status('ready', { userResponse: 'M1 delivered: totals stored in cents' }),
    status(), // M2 build
    status('ready', { userResponse: 'M2 delivered: API returns cents' }),
    status(), // M3 build
    status('ready', { userResponse: 'M3 delivered: README updated' }),
    status('ready', { userResponse: 'All done: cents everywhere' }),
  ]);
  const result = await h.run({ task });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['codex', 'claude', 'codex', 'claude', 'codex', 'claude', 'codex', 'claude', 'claude']);
  assert.match(h.prompts[0], /too large to implement and review well in one pass/);
  assert.equal(h.settings[1].readOnly, true, 'the plan review is read-only');
  assert.match(h.prompts[1], /reviewing a milestone plan/);
  assert.deepEqual(h.ran, [
    { command: 'npm test -- model', milestone: 'M1' },
    { command: 'npm test -- api', milestone: 'M2' },
  ]);
  // M2 sees its own criteria and the M1 summary, but only the title of M3.
  assert(h.prompts[4].includes('M2.2: Errors use 400'));
  assert(h.prompts[4].includes('M1 delivered: totals stored in cents'));
  assert(!h.prompts[4].includes('M3.1'));
  assert.match(h.prompts[4], /Implement only the active milestone/);
  assert.match(h.prompts[5], /This review covers one milestone/);
  // Milestone reviews continue the plan reviewer session; the final review starts fresh.
  assert.equal(h.sessions[3], 'claude-2');
  assert.equal(h.sessions[8], '');
  assert.match(h.prompts[8], /final acceptance review/);
  for (const id of ['AC1', 'M1.1', 'M2.2', 'M3.1']) assert(h.prompts[8].includes('"id":"' + id + '"'), id);
  assert.equal(result.output, 'All done: cents everywhere');
  assert.deepEqual(
    result.milestones.map((row) => [row.id, row.status, row.unverified]),
    [
      ['M1', 'done', false],
      ['M2', 'done', false],
      ['M3', 'done', true],
    ],
  );
});
test('Auto keeps ordinary tasks to one build and review, and never offers a split for simple messages, Off or Plan', async () => {
  const single = harness([]);
  const result = await single.run({ task });
  assert.deepEqual(single.calls, ['codex', 'claude']);
  assert.equal(result.milestones, null);
  const simple = harness([]);
  await simple.run({ task: 'hello' });
  assert.doesNotMatch(simple.prompts[0], /milestones plan/);
  const off = harness([]);
  await off.run({ task, milestones: 'off' });
  assert.doesNotMatch(off.prompts[0], /milestones plan/);
  const analysis = harness([]);
  await analysis.run({ task, mode: 'plan' });
  assert.doesNotMatch(analysis.prompts[0], /milestones plan/);
});
test('On plans first in a read-only pass, and the builder may still keep a small task whole', async () => {
  const h = harness([status('ready', { milestones: [] })]);
  const result = await h.run({ task, milestones: 'on' });
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(h.calls, ['codex', 'codex', 'claude']);
  assert.equal(h.settings[0].readOnly, true);
  assert.match(h.prompts[0], /Split the original request into 3 to 8 ordered milestones/);
  assert.equal(h.settings[1].readOnly, undefined, 'the build after it can edit');
});
test('a rejected plan is revised read-only, and repeated rejections pause', async () => {
  const rejected = status('changes_requested', { blockingIssues: [blocker('P1', 'PLAN')] });
  const revised = harness([planned(), rejected, planned()]);
  await revised.run({ task, maxRounds: 4 });
  assert.deepEqual(revised.calls, ['codex', 'claude', 'codex', 'claude']);
  assert.match(revised.prompts[2], /Revise the milestone plan/);
  assert(revised.prompts[2].includes('"id":"P1"'));
  assert.equal(revised.settings[2].readOnly, true);
  const stuck = harness([planned(), rejected, planned(), rejected, planned(), rejected]);
  const result = await stuck.run({ task });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /still has blockers after two revisions/);
  const offTopic = harness([planned(), status('changes_requested', { blockingIssues: [blocker('P1', 'M9.1')] })]);
  assert.match((await offTopic.run({ task })).limitation, /does not match the task criteria: P1/);
});
test('a failing milestone check goes back to the builder without spending a review', async () => {
  const h = harness([planned(), status(), status(), status()], { checks: [fail, pass] });
  await h.run({ task, maxRounds: 5 });
  assert.deepEqual(h.calls, ['codex', 'claude', 'codex', 'codex', 'claude']);
  assert(h.prompts[3].includes('"id":"MCHECK"'));
  assert(h.prompts[3].includes('not ok 2 - cents'));
  assert(h.prompts[4].includes('OPEN BLOCKING ISSUES: []'));
  const stuck = harness([planned()], { checks: [fail] });
  const result = await stuck.run({ task });
  assert.match(result.limitation, /check for milestone M1 still fails after the build and two fixes/);
  assert.deepEqual(stuck.calls, ['codex', 'claude', 'codex', 'codex', 'codex']);
});
test('a milestone check that cannot run stops before the review', async () => {
  const h = harness([planned()], {
    checks: [{ status: 'denied', exitCode: null, reason: 'The command was not approved.' }],
  });
  const result = await h.run({ task });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /could not run the check for milestone M1/);
  assert.deepEqual(h.calls, ['codex', 'claude', 'codex']);
});
test('a plan returned alongside file edits stops for the user before the plan review', async () => {
  const h = harness([planned()], { fingerprints: (n) => 'snapshot-' + n });
  const result = await h.run({ task });
  assert.equal(result.outcome, 'needs_attention');
  assert.match(result.limitation, /returned a milestone plan but also changed files/);
  assert.deepEqual(h.calls, ['codex']);
});
function savedMilestone(extra = {}) {
  const milestones = plan.map((row, i) => ({
    id: 'M' + (i + 1),
    title: row.title,
    goal: row.goal || '',
    criteria: row.criteria.map((text, n) => ({
      id: 'M' + (i + 1) + '.' + (n + 1),
      text: typeof text === 'string' ? text : text.text,
    })),
    check: row.check || '',
    status: i < 2 ? 'done' : 'active',
    unverified: !row.check,
    summary: i < 2 ? 'M' + (i + 1) + ' done' : '',
  }));
  return [
    {
      provider: 'codex',
      phase: 'build',
      output: 'Built M3',
      state: {
        phase: 'review',
        criteria: [{ id: 'TASK', text: 'Milestone M3 of 3: Docs' }, ...milestones[2].criteria],
        taskCriteria: [{ id: 'TASK', text: task }],
        milestones,
        milestone: 2,
        planApproved: true,
        openIssues: [],
        stalls: 0,
        artifact: 0,
        outcome: '',
        reason: '',
        fingerprint: 'A',
        ...extra,
      },
    },
  ];
}
test('user rulings apply only within the milestone where they were made', async () => {
  const raised = status('changes_requested', { blockingIssues: [blocker('F1')] });
  const earlier = harness([raised]);
  await earlier.run({
    task,
    maxRounds: 3,
    checkpoints: savedMilestone({ rulings: [{ id: 'F1', summary: 'x', ruling: 'builder', milestone: 'M1' }] }),
  });
  assert.deepEqual(earlier.calls, ['claude', 'codex'], 'an M1 ruling does not silence F1 in M3');
  const current = harness([raised]);
  await current.run({
    task,
    maxRounds: 3,
    checkpoints: savedMilestone({ rulings: [{ id: 'F1', summary: 'x', ruling: 'builder', milestone: 'M3' }] }),
  });
  assert.deepEqual(current.calls, ['claude', 'claude'], 'an M3 ruling accepts M3 and moves to the final review');
  assert.match(current.prompts[1], /final acceptance review/);
});
test('a resumed milestone with changed files reruns its check before the review', async () => {
  const withCheck = savedMilestone();
  withCheck[0].state.milestones[2].check = 'npm test -- docs';
  withCheck[0].state.milestones[2].checkRun = { status: 'passed', exitCode: 0, fingerprint: 'A' };
  const changed = harness([], { fingerprints: () => 'B' });
  await changed.run({ task, maxRounds: 2, checkpoints: structuredClone(withCheck) });
  assert.deepEqual(changed.ran, [{ command: 'npm test -- docs', milestone: 'M3' }]);
  const same = harness([], { fingerprints: () => 'A' });
  await same.run({ task, maxRounds: 2, checkpoints: structuredClone(withCheck) });
  assert.deepEqual(same.ran, []);
});
test('a pass limit reached mid-plan reports how many milestones were accepted', async () => {
  const h = harness([planned()]);
  const result = await h.run({ task, maxRounds: 4 });
  assert.equal(result.outcome, 'limit_reached');
  assert.match(result.limitation, /Milestones accepted: 1 of 3/);
});
