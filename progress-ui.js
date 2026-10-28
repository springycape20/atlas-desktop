(() => {
  const api = window.atlas,
    power = window.atlasPower;
  power.register('Progress', async ({ body, node, button, current, status }) => {
    body.append(
      node('h2', 'Live task progress'),
      node(
        'p',
        'Times are estimates from completed tasks with the same provider, collaboration type and mode. They include model and tool work, may vary widely, and exclude future approval delays. No estimate is shown with fewer than four samples.',
      ),
    );
    const content = node('div');
    body.append(content);
    const duration = (ms) => Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
    const refresh = async () => {
      try {
        const tasks = await api.taskProgress();
        if (!current()) return;
        content.replaceChildren();
        for (const task of tasks) {
          const row = node('article');
          row.className = 'provider-activity-row';
          row.append(
            node('h3', task.title || 'Task'),
            node('p', task.status + ' · elapsed ' + duration(task.elapsedMs)),
            node('p', task.stage),
            node('p', task.finishedStages + ' / ' + task.stages + ' recorded stages finished (the plan may grow)'),
          );
          if (task.waiting.length) row.append(node('p', 'Waiting for your decision: ' + task.waiting.join('; ')));
          row.append(
            node(
              'p',
              !task.estimate
                ? 'Estimated remaining time: not enough comparable completed tasks.'
                : task.estimate.outsideRange
                  ? 'This task is outside the observed time range; no remaining-time estimate.'
                  : 'Estimated remaining: ' +
                    duration(task.estimate.lowMs) +
                    '–' +
                    duration(task.estimate.highMs) +
                    ' · ' +
                    task.estimate.samples +
                    ' historical samples',
            ),
          );
          for (const check of task.checks) row.append(node('p', check.command + ' · ' + check.status));
          button(
            'Open task',
            async () => {
              await api.taskOpen(task.id);
              power.close();
            },
            row,
          );
          content.append(row);
        }
        if (!tasks.length) content.append(node('p', 'No running or paused tasks.'));
        status.textContent = 'Updated ' + new Date().toLocaleTimeString();
      } catch (error) {
        if (current()) status.textContent = error.message;
      }
    };
    button('Refresh progress', refresh);
    await refresh();
    const tick = () =>
      setTimeout(async () => {
        if (!current()) return;
        await refresh();
        tick();
      }, 5000);
    tick();
  });
  window.atlasUi.register('tasks', 'Progress');
})();
