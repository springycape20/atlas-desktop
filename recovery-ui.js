(() => {
  const power = window.atlasPower,
    api = window.atlas;
  if (!power) return;
  power.register('Recovery', async ({ body, status, node, button, current }) => {
    const jobs = (await api.jobs()).filter((job) => job.status !== 'running').sort((a, b) => b.startedAt - a.startedAt);
    if (!current()) return;
    body.append(
      node('h2', 'Saved tasks'),
      node(
        'p',
        'Review interrupted work before resuming. Restores affect only recorded task files and refuse conflicting later edits.',
      ),
    );
    if (!jobs.length) {
      const empty = node('p', 'No stopped or finished tasks are saved yet.');
      empty.className = 'power-empty';
      body.append(empty);
      return;
    }
    for (const job of jobs.slice(0, 40)) {
      const details = node('details');
      details.append(node('summary', (job.prompt || 'Task').slice(0, 100) + ' · ' + job.status));
      details.append(node('p', job.recoveryNote || job.statusText || ''), node('p', job.cwd || ''));
      const actions = node('div');
      actions.className = 'power-actions';
      details.append(actions);
      const preview = node('div');
      details.append(preview);
      if (api.advancedWorkflows) {
        button(
          'Verify saved checkpoint',
          async () => {
            const value = await api.advancedWorkflows({ tool: 'recovery', jobId: job.id, action: 'inspect' });
            preview.replaceChildren(
              node('h3', value.verified ? 'Checkpoint verified' : 'Review required'),
              node('p', value.reason),
              node('p', value.remaining),
            );
            if (value.changedFiles?.length) preview.append(node('pre', value.changedFiles.join('\n')));
            if (value.verified)
              button(
                'Open task to resume',
                async () => {
                  await api.taskOpen(job.id);
                  power.close();
                },
                preview,
              );
          },
          actions,
        );
        if (job.resumeCheckpoint)
          button(
            'Preview restore to last saved stage',
            async () => {
              const value = await api.advancedWorkflows({ tool: 'recovery', jobId: job.id, action: 'restore-preview' });
              preview.replaceChildren(
                node('h3', 'Restore last saved stage'),
                node('pre', value.files.join('\n') || 'No files to restore.'),
              );
              if (value.files.length)
                button(
                  'Restore listed files',
                  async () => {
                    const result = await api.advancedWorkflows({
                      tool: 'recovery',
                      jobId: job.id,
                      action: 'restore',
                      token: value.token,
                    });
                    preview.replaceChildren(node('p', result.message));
                  },
                  preview,
                );
            },
            actions,
          );
      }
      button(
        'Open task',
        async () => {
          await api.taskOpen(job.id);
          power.close();
        },
        actions,
      );
      button(
        'Inspect changed files',
        async () => {
          const changes = await api.changes({ jobId: job.id, refresh: true });
          preview.replaceChildren(
            node(
              'p',
              changes.message ||
                `${changes.files.length} changed files · +${changes.added} / −${changes.removed} lines`,
            ),
          );
          for (const file of changes.files || []) {
            const row = node('details');
            row.append(node('summary', file.path));
            button(
              'View before and current',
              async () => {
                const value = await api.changes({ jobId: job.id, action: 'file', path: file.path });
                row.append(
                  node(
                    'pre',
                    'Before task:\n' +
                      (value.originalContent ?? '(absent or not available)') +
                      '\n\nCurrent:\n' +
                      (value.content ?? '(absent or not available)'),
                  ),
                );
              },
              row,
            );
            preview.append(row);
          }
        },
        actions,
      );
      function restoreButton(label, recovery = false) {
        button(
          label,
          async () => {
            const result = await api.changes({ jobId: job.id, action: 'restore-preview', recovery });
            preview.replaceChildren(
              node('h3', 'Restore preview'),
              node('p', result.cwd),
              node('pre', result.files.join('\n') || 'No files to restore.'),
            );
            if (result.files.length)
              button(
                'Restore ' + result.files.length + (result.files.length === 1 ? ' file' : ' files'),
                async () => {
                  const restored = await api.changes({
                    jobId: job.id,
                    action: 'restore',
                    recovery,
                    token: result.token,
                  });
                  preview.replaceChildren(node('p', restored.message));
                  await power.show('Recovery');
                  status.textContent = 'Restore complete. A recovery snapshot is available to undo it.';
                },
                preview,
              );
          },
          actions,
        );
      }
      if (job.changeId) restoreButton('Preview restore to before task');
      if (job.recoveryChangeId) restoreButton('Preview undo of last restore', true);
      if (job.collaboration && job.checkpoints?.length) {
        const stages = node('div');
        stages.className = 'power-actions';
        const left = node('select'),
          right = node('select');
        left.setAttribute('aria-label', 'First saved stage');
        right.setAttribute('aria-label', 'Second saved stage');
        for (const [index, report] of job.checkpoints.entries()) {
          left.append(new Option(`${index + 1}. ${report.phase} · ${report.provider}`, index));
          right.append(new Option(`${index + 1}. ${report.phase} · ${report.provider}`, index));
        }
        right.selectedIndex = right.options.length - 1;
        stages.append(left, right);
        details.append(stages);
        button(
          'Compare stage reports',
          async () => {
            const reports = await Promise.all(
              [left.value, right.value].map((index) => api.collabReport({ id: job.id, index: Number(index) })),
            );
            preview.replaceChildren(node('h3', 'Saved reports (model-reported)'));
            for (const report of reports)
              preview.append(
                node('h3', report.phase + ' · ' + report.provider),
                node('pre', report.output || '(No report text)'),
              );
          },
          stages,
        );
      }
      body.append(details);
    }
    status.textContent =
      'Nothing resumes automatically. An incomplete or conflicting file checkpoint may require recovery with Git.';
  });
})();
