const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { recordProblems } = require('../build/release-check.cjs');
const lockBytes = Buffer.from('lock\n');
const good = () => ({
  version: '1.2.3',
  lock: { version: '1.2.3', packages: { '': { version: '1.2.3' } } },
  lockBytes,
  review: {
    version: '1.2.3',
    packageLockSha256: createHash('sha256').update(lockBytes).digest('hex'),
    openItems: [],
    verification: { package: 'verified' },
  },
  changelog: '## 1.2.3 — 1 November 2026',
  notes: 'ATLAS 1.2.3 adds things.',
  reviewDocExists: true,
  tags: ['v1.2.2'],
});

test('a consistent release record has no problems', () => {
  assert.deepEqual(recordProblems(good()), []);
});

test('each stale part of a release record is reported', () => {
  const cases = [
    [{ lock: { version: '1.2.2', packages: { '': { version: '1.2.3' } } } }, /package-lock/],
    [{ review: { ...good().review, version: '1.2.2' } }, /another version/],
    [{ lockBytes: Buffer.from('lock\r\n') }, /does not hash/],
    [{ review: { ...good().review, openItems: ['legal'] } }, /open items/],
    [{ review: { ...good().review, verification: { package: 'PENDING' } } }, /PENDING/],
    [{ reviewDocExists: false }, /REVIEW\.md is missing/],
    [{ changelog: '## 1.2.2 — old' }, /CHANGELOG/],
    [{ notes: 'ATLAS 1.2.2' }, /release-notes/],
    [{ tags: ['v1.2.3'] }, /already exists/],
  ];
  for (const [change, expected] of cases) {
    const problems = recordProblems({ ...good(), ...change });
    assert.equal(problems.length, 1, JSON.stringify(change));
    assert.match(problems[0], expected);
  }
});
