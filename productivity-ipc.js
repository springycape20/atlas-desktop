const path = require('node:path');
const { detectProject } = require('./project-tools');
const { createPluginDiscovery } = require('./plugin-discovery');
const { createTaskQueue } = require('./task-queue');
function registerProductivityIpc({
  ipcMain,
  app,
  dialog,
  window,
  trusted,
  workspace,
  jobs,
  approvals,
  findCodex,
  findClaude,
  codex,
  history,
  run,
  canRun,
  settled,
  integrations,
}) {
  const send = (name, value) => {
    const win = window();
    if (win && !win.isDestroyed()) win.webContents.send('atlas:' + name, value);
  };
  const queue = createTaskQueue({
      directory: app.getPath('userData'),
      run,
      canRun,
      settled,
      notify: (value) => send('queue', value),
    }),
    plugins = createPluginDiscovery({ findCodex, findClaude, codex });
  const handle = (name, fn) =>
    ipcMain.handle('atlas:' + name, async (event, request = {}) => {
      if (!trusted(event)) throw Error('Untrusted app window.');
      return fn(request);
    });
  handle('task-queue', async (request) => {
    if (request.action === 'add' && request.task?.provider === 'colab') {
      const status = await workspace().repository(request.task.cwd);
      if (!status.exists || !status.hasCommit)
        throw Error('Set up Git for this folder using Project setup before queuing Colab.');
    }
    return queue.action(request);
  });
  handle('approvals', (request) =>
    request.action === 'answer' ? approvals.answer(request.id, request.choice, request.text) : approvals.list(),
  );
  handle('plugins', (request) => (request.action === 'toggle' ? plugins.toggle(request) : plugins.list(request.cwd)));
  handle('integrations', async (request) => {
    if (!integrations) throw Error('Restart ATLAS to load integration support.');
    if (request.action === 'desktop-permissions') return integrations.desktopPermissions();
    if (request.action === 'grant-desktop') return integrations.grantDesktop(request.owner);
    if (request.action === 'revoke-desktop') return integrations.revokeDesktop(request.owner);
    if (request.action === 'save') return integrations.save(request.integration);
    if (request.action === 'enable') return integrations.enable(request.id, request.enabled);
    if (request.action === 'remove') return integrations.remove(request.id);
    if (request.action === 'stop') {
      await integrations.enable(request.id, false);
      return integrations.list();
    }
    if (request.action === 'start') {
      await integrations.start(request.id);
      return integrations.list();
    }
    if (request.action === 'install') {
      await integrations.installRuntime();
      return integrations.list();
    }
    return integrations.list();
  });
  handle('plugin-connect', async (request) => {
    const status = await codex('mcpServerStatus/list', { limit: 100 });
    if (!(status.data || []).some((row) => row.name === request.name))
      throw Error('Unknown MCP server. Refresh Plugins.');
    const result = await codex('mcpServer/oauth/login', { name: request.name });
    if (typeof result.authorizationUrl !== 'string') throw Error('The provider did not return a sign-in URL.');
    return { url: result.authorizationUrl };
  });
  handle('project-setup', async (request) => {
    const info = await detectProject(request.cwd);
    if (request.action === 'save') {
      if (request.initialize) {
        const choice = await dialog.showMessageBox(window(), {
          type: 'question',
          title: 'Create local Git snapshot?',
          message: 'Initialise Git in ' + info.cwd + '?',
          detail: 'Creates a local initial commit using the project files and default exclusions. Nothing is uploaded.',
          buttons: ['Create snapshot', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
        });
        if (choice.response !== 0) return { cancelled: true };
        await workspace().initializeRepository(info.cwd);
      }
      return workspace().profiles({ action: 'save', profile: { ...request.profile, cwd: info.cwd } });
    }
    return { ...info, repository: await workspace().repository(info.cwd) };
  });
  handle('search-work', async (request) => {
    const query = String(request.query || '')
        .toLowerCase()
        .slice(0, 200),
      results = [];
    if (!query.trim()) return [];
    for (const chat of await history())
      for (const turn of chat.turns || []) {
        const text = String(turn.content || ''),
          attachments = (turn.attachments || []).map((file) => file.name).join(' ');
        if ((text + ' ' + attachments).toLowerCase().includes(query))
          results.push({
            kind: 'message',
            title: chat.title,
            conversationId: chat.id,
            cwd: chat.cwd,
            text: (text + ' ' + attachments).slice(0, 1200),
            at: turn.at,
          });
      }
    for (const job of jobs()) {
      for (const event of job.events || [])
        if (
          String(event.text || '')
            .toLowerCase()
            .includes(query)
        )
          results.push({
            kind: event.kind || 'activity',
            title: job.prompt,
            jobId: job.id,
            cwd: job.cwd,
            text: String(event.text).slice(0, 1200),
            at: event.at,
          });
      if (
        (job.prompt + ' ' + (job.result?.output || '') + ' ' + (job.request?.attachments || []).join(' '))
          .toLowerCase()
          .includes(query)
      )
        results.push({
          kind: job.collaboration ? 'colab' : 'task',
          title: job.prompt,
          jobId: job.id,
          cwd: job.cwd,
          text: (job.result?.output || job.statusText || '').slice(0, 1200),
          at: job.startedAt,
        });
    }
    return results.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 200);
  });
  handle('task-open', (request) => {
    const job = jobs().find((row) => row.id === request.id);
    if (!job) throw Error('This task is no longer available.');
    send('task-open', { id: job.id, collaboration: job.collaboration, colabChatId: job.colabChatId });
    return { opened: true };
  });
  return { close: () => queue.close() };
}
module.exports = { registerProductivityIpc };
