const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os'),
  { createWorkspaceService, command } = require('../workspace-service');
// A real repository with two task checkouts started from the same commit, as parallel queue tasks are.
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-accept-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  await fs.mkdir(repo);
  const git = (args) => command('git', ['-C', repo, ...args]);
  await git(['init']);
  await git(['config', 'core.autocrlf', 'false']);
  await git(['config', 'user.name', 'Test']);
  await git(['config', 'user.email', 'test@example.com']);
  await fs.writeFile(path.join(repo, 'a.txt'), 'one\ntwo\nthree\n');
  await fs.writeFile(path.join(repo, 'b.txt'), 'bee\n');
  await git(['add', '.']);
  await git(['commit', '-m', 'Initial']);
  const service = createWorkspaceService(path.join(root, 'data'));
  const first = await service.createWorktree(repo),
    second = await service.createWorktree(repo);
  const accept = async (tree) =>
    service.reviewAction({ id: tree.id, action: 'accept', token: (await service.review(tree.id)).token });
  const update = async (tree) =>
    service.reviewAction({ id: tree.id, action: 'update', token: (await service.review(tree.id)).token });
  return { repo, git, service, first, second, accept, update };
}
const read = (folder, name) => fs.readFile(path.join(folder, name), 'utf8');

test('a second task from the same commit is applied on top of the first', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.first.path, 'a.txt'), 'one\ntwo\nthree\nfour\n');
  await fs.writeFile(path.join(f.second.path, 'b.txt'), 'bee\nsting\n');
  await fs.writeFile(path.join(f.second.path, 'new.txt'), 'added\n');
  await f.accept(f.first);
  const answer = await f.accept(f.second);
  assert.match(answer.message, /on top of commits made since the task started/);
  assert.equal(await read(f.repo, 'a.txt'), 'one\ntwo\nthree\nfour\n');
  assert.equal(await read(f.repo, 'b.txt'), 'bee\nsting\n');
  assert.equal(await read(f.repo, 'new.txt'), 'added\n');
  assert.equal((await f.git(['rev-list', '--count', 'HEAD'])).trim(), '3');
});
test('your own later commits do not block accepting a task', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.repo, 'b.txt'), 'bee\nuser line\n');
  await f.git(['commit', '-am', 'User change']);
  await fs.writeFile(path.join(f.first.path, 'a.txt'), 'one\ntwo\nthree\nfour\n');
  await f.accept(f.first);
  assert.equal(await read(f.repo, 'b.txt'), 'bee\nuser line\n');
  assert.equal(await read(f.repo, 'a.txt'), 'one\ntwo\nthree\nfour\n');
});
test('overlapping tasks are flagged, and a conflicting accept leaves the project unchanged', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.first.path, 'a.txt'), 'one\nTWO by first\nthree\n');
  await fs.writeFile(path.join(f.second.path, 'a.txt'), 'one\nTWO by second\nthree\n');
  assert.deepEqual((await f.service.review(f.second.id)).overlaps, [{ id: f.first.id, files: ['a.txt'] }]);
  await f.accept(f.first);
  const before = await f.git(['rev-parse', 'HEAD']);
  await assert.rejects(
    f.accept(f.second),
    /conflict with commits made since the task started, in: a\.txt.*left unchanged/s,
  );
  assert.equal(await f.git(['rev-parse', 'HEAD']), before);
  assert.equal((await f.git(['status', '--porcelain'])).trim(), '', 'no half-applied cherry-pick remains');
  assert.equal(await read(f.repo, 'a.txt'), 'one\nTWO by first\nthree\n');
  assert.equal(await read(f.second.path, 'a.txt'), 'one\nTWO by second\nthree\n', 'the task checkout is untouched');
});
test('Update task checkout moves the task onto the latest commit and leaves conflict markers to resolve', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.first.path, 'a.txt'), 'one\nTWO by first\nthree\n');
  await fs.writeFile(path.join(f.second.path, 'a.txt'), 'one\nTWO by second\nthree\n');
  await fs.writeFile(path.join(f.second.path, 'extra.txt'), 'kept\n');
  await f.accept(f.first);
  const head = await f.git(['rev-parse', 'HEAD']);
  const answer = await f.update(f.second);
  assert.deepEqual(answer.conflicts, ['a.txt']);
  assert.match(answer.message, /conflicts in: a\.txt/);
  const conflicted = await read(f.second.path, 'a.txt');
  assert.match(conflicted, /^<{7} /m);
  assert.match(conflicted, /TWO by first/);
  assert.match(conflicted, /TWO by second/);
  assert.equal(await read(f.second.path, 'extra.txt'), 'kept\n', 'non-conflicting changes are re-applied');
  const review = await f.service.review(f.second.id);
  assert.equal(review.baseSha, head);
  assert.deepEqual(review.conflicts, ['a.txt']);
  assert.ok(await f.git(['rev-parse', 'refs/atlas/snapshots/' + f.second.id]), 'a recovery snapshot is kept');
  await assert.rejects(f.accept(f.second), /Conflict markers remain in a\.txt/);
  await fs.writeFile(path.join(f.second.path, 'a.txt'), 'one\nTWO by both\nthree\n');
  const done = await f.accept(f.second);
  assert.equal(done.state, 'accepted');
  assert.equal(await read(f.repo, 'a.txt'), 'one\nTWO by both\nthree\n');
  assert.equal(await read(f.repo, 'extra.txt'), 'kept\n');
});
test('an update without conflicts re-applies the changes cleanly', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.first.path, 'b.txt'), 'bee\nfirst\n');
  await fs.writeFile(path.join(f.second.path, 'a.txt'), 'one\ntwo\nthree\nsecond\n');
  await f.accept(f.first);
  const answer = await f.update(f.second);
  assert.deepEqual(answer.conflicts, []);
  assert.equal(await read(f.second.path, 'b.txt'), 'bee\nfirst\n', 'the task now includes the accepted work');
  assert.equal(await read(f.second.path, 'a.txt'), 'one\ntwo\nthree\nsecond\n');
  assert.deepEqual((await f.service.review(f.second.id)).files, ['a.txt']);
  assert.match((await f.update(f.second)).message, /already starts from the latest/);
});
test('a rewritten branch or a dirty checkout is still refused', async (t) => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.first.path, 'a.txt'), 'changed\n');
  await fs.writeFile(path.join(f.repo, 'b.txt'), 'dirty\n');
  await assert.rejects(f.accept(f.first), /uncommitted changes/);
  await f.git(['checkout', '--', 'b.txt']);
  await f.git(['commit', '--amend', '-m', 'Rewritten initial']);
  await assert.rejects(f.accept(f.first), /no longer contains the commit this task started from/);
  await assert.rejects(f.update(f.first), /no longer contains the commit this task started from/);
});
