(() => {
  const api = window.atlas,
    power = window.atlasPower;
  let requestedJob;
  window.atlasReviewCentre = {
    open(id) {
      requestedJob = id;
      return power.show('Review centre');
    },
  };
  power.register('Review centre', async ({ body, node, button, current, status }) => {
    body.append(
      node('h2', 'Changes, checks and review evidence'),
      node(
        'p',
        'Inspect the actual diff and executed checks together. Model review reports remain model-reported evidence. Applying or restoring changes uses the existing conflict checks.',
      ),
    );
    const jobs = (await api.jobs()).filter((job) => job.status !== 'running').sort((a, b) => b.startedAt - a.startedAt);
    if (!current()) return;
    if (!jobs.length) {
      body.append(node('p', 'No finished or stopped tasks to review.'));
      return;
    }
    const picker = document.createElement('select');
    picker.setAttribute('aria-label', 'Task to review');
    for (const job of jobs)
      picker.append(new Option((job.prompt || 'Task').slice(0, 100) + ' · ' + job.status, job.id));
    body.append(picker);
    if (jobs.some((job) => job.id === requestedJob)) picker.value = requestedJob;
    requestedJob = null;
    const content = node('div');
    body.append(content);
    let revision = 0;
    const load = async () => {
      const version = ++revision,
        job = jobs.find((row) => row.id === picker.value);
      content.replaceChildren(node('h3', job.prompt || 'Task'), node('p', job.cwd || ''));
      const checks = job.verification || {};
      content.append(
        node('h3', 'Completion report'),
        node('p', 'Task: ' + job.status + ' · checks: ' + (checks.status || 'not run')),
      );
      const failed = (checks.results || []).filter((row) => row.status !== 'passed');
      content.append(
        node(
          'p',
          failed.length
            ? failed.length + ' checks need attention. Inspect the results below before accepting changes.'
            : checks.status === 'passed'
              ? 'Recorded checks passed. Review the diff and model reports below.'
              : 'Successful verification has not been recorded.',
        ),
      );
      button(
        'Open task / prepare follow-up',
        async () => {
          await api.taskOpen(job.id);
          power.close();
        },
        content,
      );
      button(
        'Prepare Colab follow-up draft',
        () => {
          window.atlasColab.applyWorkflow({
            name: 'Follow-up',
            cwd: job.originalCwd || job.cwd,
            mode: 'debug',
            task:
              'Follow up on this task: ' +
              job.prompt +
              '\n\nRecorded status: ' +
              job.status +
              '\nChecks: ' +
              (checks.status || 'not run') +
              '\n' +
              failed
                .map((row) => row.command + ': ' + (row.error || row.output || row.status).slice(-2000))
                .join('\n') +
              '\n\nInspect current files and resolve remaining problems. Do not assume the earlier task succeeded.',
          });
          power.close();
        },
        content,
      );
      content.append(node('h3', 'Executed checks · ' + (checks.status || 'not recorded')));
      for (const result of checks.results || []) {
        const row = node('details');
        row.append(
          node('summary', result.command + ' · ' + result.status),
          node('pre', result.output || result.error || 'No output recorded.'),
        );
        content.append(row);
      }
      if (checks.reason) content.append(node('p', checks.reason));
      if (job.environment) {
        const row = node('details');
        row.append(
          node('summary', 'Environment setup · ' + job.environment.status),
          node(
            'pre',
            (job.environment.results || [])
              .map((item) => item.command + ' · ' + item.status + '\n' + (item.output || ''))
              .join('\n\n'),
          ),
        );
        content.append(row);
      }
      content.append(node('h3', 'Review reports · model-reported'));
      for (const [index, report] of (job.checkpoints || []).entries())
        if (/review/i.test(report.phase || ''))
          button(
            'Read ' + report.phase + ' · ' + report.provider,
            async () => {
              const evidence = await api.collabReport({ id: job.id, index });
              if (current() && version === revision)
                content.append(node('pre', evidence.output || 'No saved report text.'));
            },
            content,
          );
      if (job.workspaceId)
        button(
          'Review isolated workspace for apply / discard',
          () => window.atlasWorkspace.review(job.workspaceId),
          content,
        );
      if (!job.changeId) {
        content.append(node('p', 'No tracked file snapshot for this task.'));
        return;
      }
      const changes = await api.changes({ jobId: job.id, refresh: true });
      if (!current() || version !== revision) return;
      content.append(
        node('h3', 'Changed files'),
        node('p', changes.message || `${changes.files.length} files · +${changes.added} / −${changes.removed} lines`),
      );
      for (const file of changes.files || []) {
        const row = node('details');
        row.append(node('summary', file.path));
        let loaded = false;
        row.addEventListener('toggle', async () => {
          if (!row.open || loaded) return;
          loaded = true;
          try {
            const detail = await api.changes({ jobId: job.id, action: 'file', path: file.path });
            row.append(
              node(
                'pre',
                detail.patch ||
                  'Before:\n' +
                    (detail.originalContent ?? '(not available)') +
                    '\n\nCurrent:\n' +
                    (detail.content ?? '(not available)'),
              ),
            );
          } catch (error) {
            row.append(node('p', error.message));
          }
        });
        content.append(row);
      }
      button(
        'Preview rollback to before this task',
        async () => {
          const preview = await api.changes({ jobId: job.id, action: 'restore-preview' });
          const box = node('section');
          box.append(node('h3', 'Rollback preview'), node('pre', preview.files.join('\n') || 'No files to restore.'));
          content.append(box);
          if (preview.files.length)
            button(
              'Restore these ' + preview.files.length + ' files',
              async () => {
                const result = await api.changes({ jobId: job.id, action: 'restore', token: preview.token });
                status.textContent = result.message;
                await load();
              },
              box,
            );
        },
        content,
      );
    };
    picker.onchange = () => load().catch((error) => (status.textContent = error.message));
    await load();
  });
  window.atlasUi.register('tasks', 'Review centre');
})();
