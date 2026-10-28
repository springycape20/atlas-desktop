const test = require('node:test'),
  assert = require('node:assert/strict'),
  { rank } = require('../search-results');
test('unified search ranks title matches, deduplicates, bounds output and shows the matching excerpt', () => {
  const row = { kind: 'memory', id: 'a', title: 'Decision', text: 'x'.repeat(2000) + ' cobalt choice' };
  const result = rank(
    [row, row, { kind: 'task', title: 'Cobalt task', text: 'Details' }, { title: 'unrelated', text: 'Nothing' }],
    'cobalt',
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].kind, 'task');
  assert.match(result[1].text, /cobalt/);
  assert.ok(result[1].text.length <= 1120);
  assert.deepEqual(rank([row], ''), []);
  assert.equal(
    rank(
      [{ kind: 'transcript', title: 'Older conversation', text: 'Preview excludes the matching part', matched: true }],
      'cobalt',
    ).length,
    1,
  );
  assert.equal(
    rank(
      Array.from({ length: 250 }, (_, i) => ({ id: i, kind: 'task', title: 'cobalt ' + i, text: 'match' })),
      'cobalt',
    ).length,
    200,
  );
});
