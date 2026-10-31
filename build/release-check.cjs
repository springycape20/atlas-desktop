// Checks a prepared release before anything is pushed: run with `npm run release:check`.
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const SUITES =
  'navigation power preview settings assistant colab graph dispute approvals files pty pty-render restore recovery release pdf-package';

// Problems in the release record that no test would otherwise report before tagging.
function recordProblems({ version, lock, lockBytes, review, changelog, notes, reviewDocExists, tags = [] }) {
  const problems = [];
  if (lock.version !== version || lock.packages?.['']?.version !== version)
    problems.push('package-lock.json version does not match package.json');
  if (review.version !== version) problems.push('legal/release-review.json is for another version');
  if (review.packageLockSha256 !== createHash('sha256').update(lockBytes).digest('hex'))
    problems.push('legal/release-review.json does not hash the committed package-lock.json');
  if (review.openItems?.length) problems.push('legal/release-review.json has open items');
  if (JSON.stringify(review.verification || {}).includes('PENDING'))
    problems.push('legal/release-review.json still has PENDING verification');
  if (!reviewDocExists) problems.push(`docs/RELEASE-${version}-REVIEW.md is missing`);
  if (!changelog.includes(`## ${version} `)) problems.push('CHANGELOG.md has no heading for this version');
  if (!notes.includes(version)) problems.push('build/release-notes.md does not mention this version');
  if (tags.includes(`v${version}`)) problems.push(`tag v${version} already exists`);
  return problems;
}

function run(label, command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'ignore', shell: process.platform === 'win32' });
  console.log(`${result.status === 0 ? 'pass' : 'FAIL'}  ${label}`);
  return result.status === 0;
}

function main() {
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 1e9 }).stdout;
  const version = JSON.parse(read('package.json')).version;
  const problems = recordProblems({
    version,
    lock: JSON.parse(read('package-lock.json')),
    // The tag build hashes the checked-out LF bytes, not this working copy.
    lockBytes: git('show', 'HEAD:package-lock.json'),
    review: JSON.parse(read('legal/release-review.json')),
    changelog: read('CHANGELOG.md').toString(),
    notes: read('build/release-notes.md').toString(),
    reviewDocExists: fs.existsSync(path.join(root, 'docs', `RELEASE-${version}-REVIEW.md`)),
    tags: git('tag', '-l').toString().split(/\r?\n/),
  });
  const dirty = git('status', '--short').toString().split(/\r?\n/).filter(Boolean);
  // The generated bundle is rebuilt by every test run and is not part of a release.
  const unexpected = dirty.filter((line) => !line.endsWith('syntax-highlight.js'));
  if (unexpected.length) problems.push('uncommitted changes: ' + unexpected.join(', '));
  for (const problem of problems) console.log('FAIL  ' + problem);
  let ok = !problems.length;
  if (ok) console.log(`pass  release record for ${version}`);
  if (process.argv.includes('--record-only')) return ok;
  ok = run('npm test', 'npm', ['test']) && ok;
  ok = run('formatting', 'npm', ['run', 'format:check']) && ok;
  ok = run('production audit', 'npm', ['audit', '--omit=dev', '--audit-level=high']) && ok;
  for (const suite of SUITES.split(' ')) ok = run(`${suite} UI`, 'npm', ['run', `test:${suite}-ui`]) && ok;
  ok = run('menu audit', 'npm', ['run', 'test:menu-ui']) && ok;
  ok = run('installer build', 'npm', ['run', 'dist:win']) && ok;
  ok = run('installer verification', 'node', ['build/verify-release.cjs']) && ok;
  console.log(
    ok
      ? `\nReady for a PR. Still needed by hand, see docs/RELEASE-SECURITY.md:\n- Run the packaged update check and record it in the release review.\n- After CI passes and the owner confirms: merge, then tag v${version}.\n- Confirm the release build finished and published its three files.`
      : '\nNot ready: fix the failures above.',
  );
  return ok;
}
module.exports = { recordProblems };
if (require.main === module) process.exitCode = main() ? 0 : 1;
