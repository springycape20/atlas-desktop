const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPublicRelease } = require('../build/release-policy.cjs');

test('current release review matches the exact LF lockfile shipped by Git', () => {
  const fs = require('node:fs'),
    path = require('node:path'),
    { createHash } = require('node:crypto');
  const root = path.resolve(__dirname, '..'),
    bytes = fs.readFileSync(path.join(root, 'package-lock.json'));
  assert(
    !bytes.includes(Buffer.from('\r\n')),
    'package-lock.json must use the LF bytes enforced by .gitattributes before review hashing',
  );
  const version = require('../package.json').version;
  assert.doesNotThrow(() =>
    assertPublicRelease({
      env: { SIGNING: 'false', GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v' + version },
      version,
      lock: JSON.parse(bytes),
      lockHash: createHash('sha256').update(bytes).digest('hex'),
      review: JSON.parse(fs.readFileSync(path.join(root, 'legal/release-review.json'), 'utf8')),
    }),
  );
});
test('release review binds dependency lock, signing configuration and unsigned owner decision', () => {
  const review = {
    version: '0.8.3',
    status: 'technical-review-complete',
    reviewedBy: 'Test reviewer',
    reviewedAt: '2026-10-28',
    evidence: 'Test evidence',
    packageLockSha256: 'test-lock',
    openItems: [],
    signing: 'unsigned-owner-authorized',
  };
  const env = { SIGNING: 'true', UPDATER_PUBLISHER: 'Test publisher' };
  const lock = { version: '0.8.3', packages: { '': { version: '0.8.3' }, 'node_modules/example': { license: 'MIT' } } };
  const run = (e = env, r = review, lockHash = 'test-lock', dependencyLock = lock) =>
    assertPublicRelease({ env: e, review: r, lockHash, lock: dependencyLock, version: '0.8.3' });
  assert.doesNotThrow(() => run());
  assert.doesNotThrow(() => run({}));
  assert.throws(() => run({}, { ...review, signing: null }), /unsigned/);
  assert.throws(() => run({ SIGNING: 'true' }), /publisher/);
  assert.throws(() => run(env, { ...review, status: 'pending' }), /review/);
  assert.throws(() => run(env, { ...review, openItems: ['unresolved source'] }), /review/);
  assert.throws(() => run(env, review, 'different-dependencies'), /review/);
  assert.throws(
    () =>
      run(env, review, 'test-lock', {
        ...lock,
        packages: { ...lock.packages, 'node_modules/phonemizer': { license: 'Apache-2.0' } },
      }),
    /dependency/,
  );
  assert.throws(
    () =>
      run(env, review, 'test-lock', {
        ...lock,
        packages: { ...lock.packages, 'node_modules/other': { license: 'LGPL-3.0' } },
      }),
    /dependency/,
  );
  assert.throws(() => run(env, { ...review, version: '0.8.4' }), /version/);
  assert.throws(() => run(env, review, 'test-lock', { ...lock, version: '0.8.4' }), /version/);
  assert.throws(() => run({ ...env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.8.4' }), /version/);
  assert.doesNotThrow(() => run({ ...env, GITHUB_REF_TYPE: 'tag', GITHUB_REF_NAME: 'v0.8.3' }));
});
