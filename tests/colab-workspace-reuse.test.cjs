const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  path = require('node:path'),
  os = require('node:os');
const { reusableWorkspace } = require('../colab-workspace-reuse'),
  { createWorkspaceService } = require('../workspace-service'),
  { registerWorkspaceIpc } = require('../workspace-ipc');
test('same-chat follow-ups reuse an active isolated checkout without discarding its changes', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-workspace-reuse-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const cwd = path.join(dir, 'project');
  await fs.mkdir(cwd);
  await fs.writeFile(path.join(cwd, 'app.js'), 'original');
  const service = createWorkspaceService(path.join(dir, 'data'));
  await service.initializeRepository(cwd);
  const tree = await service.createWorktree(cwd);
  await fs.writeFile(path.join(tree.cwd, 'app.js'), 'unapplied changes');
  await fs.writeFile(path.join(cwd, 'notes.txt'), 'outside edits');
  const jobs = [
    { collaboration: true, colabChatId: 'chat', workspaceId: tree.id, status: 'completed', request: { cwd } },
  ];
  assert.equal((await reusableWorkspace({ id: tree.id, chatId: 'chat', cwd, jobs, service })).id, tree.id);
  assert.equal(await fs.readFile(path.join(tree.cwd, 'app.js'), 'utf8'), 'unapplied changes');
  const handlers = new Map();
  registerWorkspaceIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    trusted: () => true,
    service: () => service,
    jobs: () => jobs,
    dialog: {
      showMessageBox: () => {
        throw Error('Must not prompt to edit original checkout');
      },
    },
  });
  assert.deepEqual(await handlers.get('atlas:prepare-project')({}, { cwd, chatId: 'chat', workspaceId: tree.id }), {
    ready: true,
    reuseWorkspace: true,
  });
  assert.equal(await reusableWorkspace({ id: tree.id, chatId: 'other', cwd, jobs, service }), null);
  jobs[0].status = 'running';
  assert.equal(await reusableWorkspace({ id: tree.id, chatId: 'chat', cwd, jobs, service }), null);
});
test('accepted or discarded checkouts are not reused, and a changed folder cannot claim old work', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-workspace-owner-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const other = path.join(dir, 'other');
  await fs.mkdir(other);
  const jobs = [
      { collaboration: true, colabChatId: 'chat', workspaceId: 'tree', status: 'completed', request: { cwd: dir } },
    ],
    service = { tree: async () => ({ state: 'accepted' }) };
  assert.equal(await reusableWorkspace({ id: 'tree', chatId: 'chat', cwd: dir, jobs, service }), null);
  await assert.rejects(reusableWorkspace({ id: 'tree', chatId: 'chat', cwd: other, jobs, service }), /new Colab chat/);
});
