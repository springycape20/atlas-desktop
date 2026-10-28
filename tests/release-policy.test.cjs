const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPublicRelease } = require('../build/release-policy.cjs');
test('release review binds dependency lock, signing configuration and unsigned owner decision', () => {
  const review = {
    status: 'technical-review-complete',
    reviewedBy: 'Test reviewer',
    reviewedAt: '2026-10-28',
    evidence: 'Test evidence',
    packageLockSha256: 'test-lock',
    openItems: [],
    signing: 'unsigned-owner-authorized',
  };
  const env = { SIGNING: 'true', UPDATER_PUBLISHER: 'Test publisher' };
  const lock = { packages: { 'node_modules/example': { license: 'MIT' } } };
  const run = (e = env, r = review, lockHash = 'test-lock', dependencyLock = lock) =>
    assertPublicRelease({ env: e, review: r, lockHash, lock: dependencyLock });
  assert.doesNotThrow(() => run());
  assert.doesNotThrow(() => run({}));
  assert.throws(() => run({}, { ...review, signing: null }), /unsigned/);
  assert.throws(() => run({ SIGNING: 'true' }), /publisher/);
  assert.throws(() => run(env, { ...review, status: 'pending' }), /review/);
  assert.throws(() => run(env, { ...review, openItems: ['unresolved source'] }), /review/);
  assert.throws(() => run(env, review, 'different-dependencies'), /review/);
  assert.throws(
    () => run(env, review, 'test-lock', { packages: { 'node_modules/phonemizer': { license: 'Apache-2.0' } } }),
    /dependency/,
  );
  assert.throws(
    () => run(env, review, 'test-lock', { packages: { 'node_modules/other': { license: 'LGPL-3.0' } } }),
    /dependency/,
  );
});
