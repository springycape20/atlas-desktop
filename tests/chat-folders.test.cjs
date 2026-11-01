const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWorkspaceService } = require('../workspace-service');
const { chatVisible, ARCHIVED } = require('../chat-render');

test('renaming or pinning a chat keeps its folder and archive state, across restarts', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-chat-folders-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const service = createWorkspaceService(dir),
    key = 'atlas:chat-1',
    save = (patch) => service.chatMeta({ action: 'save', key, ...patch });
  await save({ title: 'Named', pinned: true });
  await save({ folder: 'Work' });
  await save({ archived: true });
  await save({ title: 'Renamed' });
  assert.deepEqual((await save({ pinned: false }))[key], {
    title: 'Renamed',
    pinned: false,
    folder: 'Work',
    archived: true,
  });
  assert.equal((await save({ folder: 'x'.repeat(61) }))[key].folder.length, 60);
  await save({ folder: 'Home' });
  assert.equal((await createWorkspaceService(dir).chatMeta())[key].folder, 'Home');
  assert.equal((await createWorkspaceService(dir).chatMeta())[key].archived, true);
});

test('the chat list hides archived chats except under Archived, in a search, or while open', () => {
  const plain = {},
    work = { folder: 'Work' },
    archived = { folder: 'Work', archived: true };
  assert.equal(chatVisible(plain, ''), true);
  assert.equal(chatVisible(work, ''), true);
  assert.equal(chatVisible(archived, ''), false);
  assert.equal(chatVisible(archived, '', { searching: true }), true);
  assert.equal(chatVisible(archived, '', { selected: true }), true);
  assert.equal(chatVisible(work, 'Work'), true);
  assert.equal(chatVisible(plain, 'Work'), false);
  assert.equal(chatVisible(archived, 'Work'), false);
  assert.equal(chatVisible(archived, 'Home', { searching: true }), false);
  assert.equal(chatVisible(archived, ARCHIVED), true);
  assert.equal(chatVisible(work, ARCHIVED, { searching: true, selected: true }), false);
});
