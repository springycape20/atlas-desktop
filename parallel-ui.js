(() => {
  const power = window.atlasPower,
    api = window.atlas;
  if (!power) return;
  power.register('Parallel', async ({ body, status, node, button, current }) => {
    body.append(
      node('h2', 'Parallel Colab batches'),
      node(
        'p',
        'Give independent tasks their own workspaces. ATLAS combines them in a new checkout and runs a final Colab review with integration checks. Review the combined result before applying it.',
      ),
    );
    const input = power.request();
    const folderLabel = node('label', 'Project folder'),
      folder = node('input');
    folder.value = input.cwd;
    folderLabel.append(folder);
    body.append(folderLabel);
    const tasksLabel = node('label', 'Independent tasks (one per line, 2–8)'),
      tasks = node('textarea');
    tasks.rows = 4;
    tasks.id = 'parallelTasks';
    tasksLabel.append(tasks);
    body.append(tasksLabel);
    const checksLabel = node('label', 'Integration checks (one command per line)'),
      checks = node('textarea');
    checks.rows = 2;
    checks.id = 'parallelChecks';
    checks.placeholder = 'npm test';
    checksLabel.append(checks);
    body.append(checksLabel);
    const limitLabel = node('label', 'Tasks running at once'),
      limit = node('select');
    for (const n of [1, 2, 3]) limit.append(new Option(String(n), String(n)));
    limit.value = '2';
    limitLabel.append(limit);
    body.append(limitLabel);
    button('Queue batch for review', async () => {
      await api.taskQueue({
        action: 'add-batch',
        cwd: folder.value.trim(),
        profileId: input.profileId,
        tasks: tasks.value.split(/\r?\n/),
        checks: checks.value,
        concurrency: Number(limit.value),
      });
      await power.show('Parallel');
      status.textContent = 'Batch queued and paused. Start the queue when ready.';
    });
    const state = await api.taskQueue({});
    if (!current()) return;
    const batches = new Set((state.items || []).map((row) => row.batchId).filter(Boolean));
    body.append(node('h3', `${batches.size} saved batches · queue ${state.paused ? 'paused' : 'running'}`));
    const actions = node('div');
    actions.className = 'power-actions';
    body.append(actions);
    button(
      'Start queue',
      async () => {
        await api.taskQueue({ action: 'start', pauseBetween: false, concurrency: Number(limit.value) });
        await power.show('Parallel');
      },
      actions,
    );
    button(
      'Pause new tasks',
      async () => {
        await api.taskQueue({ action: 'pause' });
        await power.show('Parallel');
      },
      actions,
    );
    button('Refresh', () => power.show('Parallel'), actions);
    for (const row of (state.items || []).filter((item) => item.batchId)) {
      const details = node('details');
      details.append(
        node(
          'summary',
          (row.provider === 'integration' ? 'Combined integration' : row.prompt.slice(0, 80)) + ' · ' + row.status,
        ),
      );
      if (row.error) details.append(node('p', row.error));
      if (row.result?.workspaceId)
        button(
          'Review changes',
          () => {
            power.close();
            return window.atlasWorkspace.review(row.result.workspaceId);
          },
          details,
        );
      if (row.result?.jobId)
        button(
          'Open task',
          async () => {
            await api.taskOpen(row.result.jobId);
            power.close();
          },
          details,
        );
      body.append(details);
    }
    status.textContent =
      'Each subtask uses both provider accounts. The limit controls concurrency, not total tokens. Failed subtasks or merge conflicts pause new work. Nothing starts automatically after restarting ATLAS.';
  });
})();
