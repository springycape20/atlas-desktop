(() => {
  const api = window.atlas,
    power = window.atlasPower,
    model = window.atlasWorkOverview;
  let requested = '',
    jobs = [];
  const open = async (id) => {
    requested = id;
    return power.show('Task result');
  };
  window.atlasOutcomes = { open };
  power.register('Task result', async ({ body, node, button, current, status }) => {
    const rows = await api.jobs();
    if (!current()) return;
    const job = rows.find((j) => j.id === requested);
    if (!job) throw Error('This task is no longer available.');
    const context = { cwd: job.cwd, jobId: job.id },
      checks = job.verification || job.result?.verification || {};
    const handoff = node('section');
    handoff.setAttribute('aria-label', 'Task handoff');
    body.append(handoff);
    body.append(
      node('h2', model.title(job)),
      node('p', 'Task ' + job.status + ' · ' + (job.cwd || '')),
      node('h3', 'What changed — model report'),
      node('pre', String(job.result?.output || job.error || job.statusText || 'No result recorded.').slice(0, 16000)),
    );
    body.append(node('h3', 'Checks ATLAS ran'), node('p', checks.status || 'No executed checks recorded.'));
    for (const check of checks.results || []) {
      const d = node('details');
      d.append(
        node('summary', check.command + ' · ' + check.status + ' · exit ' + (check.exitCode ?? 'unknown')),
        node('pre', check.output || check.error || 'No output recorded.'),
      );
      body.append(d);
    }
    const changes = node('section');
    body.append(changes);
    changes.append(node('h3', 'Changed files and outputs'));
    let files = [];
    if (job.changeId || job.workspaceId)
      try {
        const result = await api.changes({ jobId: job.id });
        if (!current()) return;
        files = result.files || [];
        for (const f of files) {
          const path = typeof f === 'string' ? f : f.path;
          const row = node('div');
          row.append(node('span', path));
          button(
            'Open file',
            () => {
              power.close();
              return window.atlasProjectEditor.open(context, path);
            },
            row,
          );
          changes.append(row);
        }
      } catch (e) {
        changes.append(node('p', 'Change evidence unavailable: ' + e.message));
      }
    if (!files.length)
      changes.append(
        node('p', 'No tracked file changes recorded. File links in the report remain available in the conversation.'),
      );
    const summary = window.atlasTaskExperience.handoff(job, files);
    handoff.append(
      node('h2', 'What changed and what comes next'),
      node(
        'p',
        summary.files.length +
          ' tracked changed files · ' +
          summary.passed +
          ' checks passed · ' +
          summary.failed +
          ' checks not passed',
      ),
      node('p', summary.next),
    );
    for (const issue of summary.concerns) handoff.append(node('p', issue));
    button('Review evidence', () => window.atlasReviewCentre.open(job.id), handoff);
    const references = [
      ...new Set(
        [...String(job.result?.output || '').matchAll(/\[[^\]]+\]\(([^)]+)\)|`([^`\n]+\.[A-Za-z0-9]{1,10})`/g)]
          .map((m) => m[1] || m[2])
          .filter((p) => !/^(?:https?:|data:|javascript:)/i.test(p)),
      ),
    ].slice(0, 20);
    if (references.length) {
      body.append(node('h3', 'Referenced outputs'));
      for (const path of references) {
        const row = node('div');
        row.append(node('span', path));
        button('Preview output', () => window.atlasProjectFiles.preview(context, path), row);
        button('Show in folder', () => api.projectFile({ ...context, action: 'reveal', path }), row);
        body.append(row);
      }
    }
    body.append(
      node('h3', 'What needs review'),
      node(
        'p',
        checks.status === 'passed'
          ? 'Recorded checks passed. Review the diff and confirm the result meets your requirements.'
          : 'Checks have not all passed. Inspect failed or missing checks before using the result.',
      ),
    );
    button('Open conversation', async () => {
      await api.taskOpen(job.id);
      power.close();
    });
    if (job.workspaceId)
      button('Review isolated changes', () => {
        power.close();
        return window.atlasWorkspace.review(job.workspaceId);
      });
    button('Review checks and changes', () => window.atlasReviewCentre.open(job.id));
    if (job.status === 'completed') button('Save as reusable workflow', () => window.atlasWorkflows.fromTask(job));
    status.textContent =
      'Task completion and model reports are distinct from executed check evidence. Opening a result applies nothing.';
  });
  for (const scope of ['assistant', 'colab']) {
    const host = document.createElement('div');
    host.className = 'task-outcome-link';
    host.dataset.scope = scope;
    document.querySelector(scope === 'assistant' ? '.assistant-chat-heading' : '.colab-chat-header').append(host);
  }
  const render = () => {
    for (const host of document.querySelectorAll('.task-outcome-link')) {
      const scope = host.dataset.scope,
        request = power.request(scope),
        chat = scope === 'colab' ? window.atlasColab.current() : null;
      const job = model.newest(
        jobs.filter((j) =>
          scope === 'colab'
            ? j.colabChatId === chat.id
            : !j.collaboration && j.conversationId === request.conversationId,
        ),
      )[0];
      host.replaceChildren();
      if (job && job.status !== 'running') {
        const button = window.atlasUi.actionButton('Task result', () => open(job.id), host);
        button.title = 'View task result · ' + job.status;
      }
    }
  };
  api.onJobs((patch) => {
    for (const id of patch.removed || []) jobs = jobs.filter((j) => j.id !== id);
    for (const job of patch.upsert || []) {
      jobs = jobs.filter((j) => j.id !== job.id);
      jobs.push(job);
    }
    render();
  });
  window.addEventListener('atlas-colab-chat-change', render);
  window.addEventListener('atlas-assistant-task', render);
  window.addEventListener('atlas-context-change', render);
  void api.jobs().then((rows) => {
    jobs = rows;
    render();
  });
})();
