const test = require('node:test'),
  assert = require('node:assert/strict'),
  { parseVerdict } = require('../collaboration');
const status = (decision = 'ready', extra = {}) =>
  'Result\nATLAS_COLAB_STATUS ' + JSON.stringify({ decision, blockingIssues: [], ...extra });
const plan = [
  { title: 'Data model', goal: 'Store totals', criteria: ['Totals are stored in cents'], check: 'npm test -- model' },
  { title: 'API', criteria: ['GET /totals returns cents', { text: 'Errors use 400' }], check: 'npm test -- api' },
  { title: 'Docs', criteria: ['README explains totals'] },
];

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
