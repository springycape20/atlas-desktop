const test = require('node:test'),
  assert = require('node:assert/strict');
const { branchChat } = require('../chat-branch');
const source = {
  id: 'source',
  title: 'Plan the trip',
  provider: 'atlas',
  lastProvider: 'codex',
  sessions: { codex: 'session-with-later-messages', claude: '' },
  cwd: 'C:/Projects/Trip',
  contextKey: 'old',
  importSource: { provider: 'codex', id: 'x' },
  turns: [
    { role: 'user', content: 'one', attachments: [{ id: 'a' }] },
    { role: 'assistant', content: 'two' },
    { role: 'user', content: 'three' },
  ],
};
test('a branch keeps earlier messages and none of the later provider sessions', () => {
  const branch = branchChat(source, 2, 'branch', 5);
  assert.equal(branch.id, 'branch');
  assert.equal(branch.title, 'Branch: Plan the trip');
  assert.equal(branch.cwd, source.cwd);
  assert.equal(branch.updatedAt, 5);
  assert.deepEqual(
    branch.turns.map((turn) => turn.content),
    ['one', 'two'],
  );
  assert.deepEqual(branch.sessions, { codex: '', claude: '' });
  assert.equal(branch.lastProvider, '');
  assert.equal(branch.importSource, undefined);
});
test('a branch does not share messages with its source', () => {
  const branch = branchChat(source, 1, 'branch');
  branch.turns[0].attachments.push({ id: 'b' });
  branch.turns[0].content = 'changed';
  assert.equal(source.turns[0].content, 'one');
  assert.equal(source.turns[0].attachments.length, 1);
});
test('a branch refuses a message that does not exist', () => {
  for (const count of [0, -1, 4, 1.5, '2', undefined])
    assert.throws(() => branchChat(source, count, 'branch'), /not available/);
});
test('a long title stays within the saved limit', () => {
  assert.equal(branchChat({ ...source, title: 'x'.repeat(100) }, 1, 'branch').title.length, 100);
});
