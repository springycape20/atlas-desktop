(() => {
  const api = window.atlas,
    ui = window.atlasUi,
    { node, actionButton: button } = ui,
    model = window.atlasActivityModel,
    qol = window.atlasQol;
  const page = node('section', undefined, 'activity-page');
  page.id = 'activityPage';
  page.setAttribute('aria-labelledby', 'activityTitle');
  const nav = document.querySelector('.workspace-nav'),
    trigger = button('Activity', () => open(), nav);
  trigger.className = 'nav-item';
  trigger.dataset.destination = 'activity';
  trigger.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg><span>Activity</span>';
  nav.prepend(trigger);
  const header = node('header'),
    heading = node('div'),
    title = node('h1', 'ATLAS Activity'),
    intro = node('p', 'Your work, at a glance.');
  title.id = 'activityTitle';
  heading.append(title, intro);
  header.append(heading);
  const actions = node('div');
  actions.className = 'activity-actions';
  header.append(actions);
  button('Open Chat', () => window.atlasColab.selectAssistant(), actions);
  button('Open Colab', () => window.atlasColab.selectChat(window.atlasColab.current().id), actions);
  const scopeLabel = node('label', 'Project'),
    scope = node('select');
  scope.setAttribute('aria-label', 'Activity project');
  scope.append(new Option('All projects', ''));
  scopeLabel.append(scope);
  const filters = node('div');
  filters.className = 'activity-filters';
  filters.append(scopeLabel);
  button('Refresh activity', () => refresh(), filters);
  const stamp = node('p', 'Loading local activity…');
  stamp.setAttribute('role', 'status');
  filters.append(stamp);
  const selectedTasks = new Set(),
    bulk = node('div'),
    bulkStatus = node('span', 'Select stopped tasks to clean up'),
    undoButton = button(
      'Undo cleanup',
      async () => {
        const result = await api.jobs({ action: 'undo-organize', token: cleanupToken });
        jobs = result.jobs;
        cleanupToken = '';
        undoButton.disabled = true;
        undoButton.hidden = true;
        bulkStatus.textContent = 'Cleanup undone.';
        render();
      },
      bulk,
    );
  let cleanupToken = '',
    cleanupUntil = 0;
  bulk.className = 'activity-actions activity-cleanup';
  bulk.setAttribute('aria-label', 'Bulk task cleanup');
  undoButton.disabled = true;
  undoButton.hidden = true;
  const cleanup = async (operation) => {
    const result = await api.jobs({ action: 'organize-many', operation, ids: [...selectedTasks] });
    jobs = result.jobs;
    selectedTasks.clear();
    cleanupToken = result.undoToken;
    cleanupUntil = Date.now() + 300000;
    undoButton.disabled = false;
    undoButton.hidden = false;
    bulkStatus.textContent = result.count + ' tasks cleaned up. Undo is available for five minutes.';
    render();
  };
  const archiveMany = button('Archive selected', () => cleanup('archive'), bulk),
    dismissMany = button('Dismiss selected', () => cleanup('dismiss-attention'), bulk);
  archiveMany.disabled = dismissMany.disabled = true;
  const updateCleanupControls = () => {
    archiveMany.disabled = !selectedTasks.size;
    dismissMany.disabled =
      !selectedTasks.size ||
      [...selectedTasks].some(
        (id) => window.atlasWorkOverview.bucket(jobs.find((job) => job.id === id) || {}) !== 'attention',
      );
    dismissMany.title = dismissMany.disabled
      ? 'Select stopped tasks that need attention to dismiss them.'
      : 'Dismiss selected tasks from attention';
  };
  bulk.append(archiveMany, dismissMany, bulkStatus, undoButton);
  const counts = node('div');
  counts.className = 'activity-counts';
  counts.setAttribute('aria-label', 'Activity totals');
  const grid = node('div');
  grid.className = 'activity-grid';
  const work = node('div'),
    side = node('aside');
  work.className = 'activity-work';
  side.className = 'activity-side';
  const attention = node('section'),
    active = node('section'),
    recent = node('section'),
    providers = node('section');
  attention.setAttribute('aria-label', 'Work needing attention');
  active.setAttribute('aria-label', 'Working tasks');
  recent.setAttribute('aria-label', 'Recent results');
  providers.setAttribute('aria-label', 'Provider usage and availability');
  work.append(attention, active, recent);
  side.append(providers);
  grid.append(work, side);
  const links = node('section');
  links.className = 'activity-shortcuts';
  links.append(node('h2', 'Keep working'));
  button('Projects', () => window.atlasProjectHome.open(), links);
  button('Search all work', () => ui.open('library', 'Search all work'), links);
  button('Saved workspace', () => ui.open('tasks', 'Saved workspace'), links);
  button('Task centre', () => ui.open('tasks', 'Task centre'), links);
  button('Review inbox', () => ui.open('tasks', 'Review inbox'), links);
  button('Workflows', () => ui.open('library', 'Workflows'), links);
  side.append(links);
  const note = node(
    'p',
    'Activity covers work recorded by ATLAS on this PC. Opening a task never resumes it or approves an action.',
  );
  note.className = 'activity-note';
  page.append(header, filters, bulk, counts, grid, note);
  document.querySelector('.layout').append(page);
  let jobs = [],
    approvals = [],
    health = [],
    profiles = [],
    usage = {},
    jobsKnown = false,
    loading = false,
    usageLoading = false,
    lastUsageAttempt = null,
    timer,
    generation = 0,
    disposed = false,
    savedScroll = [],
    navigationRevision = 0;
  const visible = () => document.body.dataset.mainPage === 'activity';
  const showTask = async (job) => {
    await api.taskOpen(job.id);
    if (!visible()) return;
    leave();
    if (job.collaboration) window.atlasColab.selectChat(job.colabChatId);
    else if (job.conversationId) await window.atlasAssistant.open(job.conversationId, { job });
  };
  const task = (job, parent, kind) => {
    const row = node('article');
    row.className = 'activity-task';
    row.dataset.jobId = job.id;
    const text = node('div'),
      h = node('h3', window.atlasWorkOverview.title(job));
    if (!window.atlasTaskExperience.live(job) && !approvals.some((a) => a.jobId === job.id)) {
      const pick = node('input'),
        label = node('label');
      pick.type = 'checkbox';
      pick.checked = selectedTasks.has(job.id);
      pick.setAttribute('aria-label', 'Select task ' + window.atlasWorkOverview.title(job));
      pick.onchange = () => {
        if (pick.checked) selectedTasks.add(job.id);
        else selectedTasks.delete(job.id);
        updateCleanupControls();
        bulkStatus.textContent = selectedTasks.size + ' tasks selected';
      };
      label.prepend(pick);
      label.className = 'activity-task-select';
      text.append(label);
    }
    const provider = job.collaboration
      ? 'Codex + Claude'
      : job.provider === 'claude'
        ? 'Claude'
        : job.provider === 'codex'
          ? 'Codex'
          : job.provider === 'local'
            ? 'Local model'
            : 'Assistant';
    const state = approvals.some((a) => a.jobId === job.id)
      ? 'Waiting for your decision'
      : job.status === 'completed'
        ? 'Completed'
        : ['failed', 'limit_reached', 'needs_attention'].includes(job.status)
          ? window.atlasQol.errorInfo(job.error || job.statusText || job.status).title
          : job.statusText || job.status.replaceAll('_', ' ');
    text.append(h, node('p', provider + ' · ' + model.elapsed(job) + ' · ' + state));
    const checks = job.verification || job.result?.verification;
    if (checks?.status) text.append(node('p', 'Recorded checks: ' + checks.status));
    if (job.projectFolder || job.cwd) {
      const path = node('small', job.projectFolder || job.cwd);
      path.title = path.textContent;
      text.append(path);
    }
    const controls = node('div');
    controls.className = 'activity-actions';
    if (approvals.some((a) => a.jobId === job.id))
      button('Review request', () => ui.open('tasks', 'Approvals'), controls);
    else
      button(
        kind === 'recent' ? 'View result' : 'Open task',
        () => (kind === 'recent' ? window.atlasOutcomes.open(job.id) : showTask(job)),
        controls,
      );
    row.append(text, controls);
    if (kind === 'attention' && !window.atlasTaskExperience.live(job) && !approvals.some((a) => a.jobId === job.id)) {
      for (const [label, action] of [
        ['Dismiss', 'dismiss-attention'],
        ['Archive', 'archive'],
      ])
        button(
          label,
          async () => {
            await api.jobs({ action, id: job.id });
            await refresh();
          },
          controls,
        );
    }
    parent.append(row);
  };
  const renderUsage = () => {
    const focusLabel =
      providers.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON'
        ? document.activeElement.textContent
        : '';
    providers.replaceChildren(node('h2', 'Providers'));
    for (const [id, label] of [
      ['codex', 'Codex'],
      ['claude', 'Claude'],
    ]) {
      const group = node('article');
      group.className = 'activity-provider';
      group.append(node('h3', label));
      const status = health.find((h) => h.provider === id),
        value = usage[id];
      if (status && !status.available && status.retryAt > Date.now()) {
        const retry = node(
          'p',
          (status.estimated ? 'Estimated ' : '') + qol.resetTime(status.retryAt).replace('Resets', 'Retry'),
        );
        retry.title = qol.exactTime(status.retryAt);
        group.append(retry);
      }
      const windows = Array.isArray(value?.windows) ? value.windows : [];
      if (windows.length)
        for (const window of windows) {
          const fresh = !value.stale && (!window.resetsAt || window.resetsAt > Date.now());
          const available = Number.isFinite(window.remainingPercent);
          group.append(
            node(
              'p',
              window.label +
                ' · ' +
                (available
                  ? Math.round(window.remainingPercent) + '% remaining' + (fresh ? '' : ' · last reported')
                  : 'Unavailable'),
            ),
          );
          if (available) {
            const meter = node('meter');
            meter.min = 0;
            meter.max = 100;
            meter.value = window.remainingPercent;
            meter.setAttribute('aria-label', label + ' ' + window.label + ' remaining percent');
            group.append(meter);
          }
          if (window.resetsAt) {
            const reset = node('small', qol.resetTime(window.resetsAt));
            reset.title = qol.exactTime(window.resetsAt);
            group.append(reset);
          }
        }
      else
        group.append(
          node(
            'p',
            value?.message ||
              value?.error ||
              'Allowance unavailable. Refresh supported usage or open the account page.',
          ),
        );
      if (value?.updatedAt)
        group.append(node('small', 'Reported ' + qol.exactTime(value.updatedAt) + (value.stale ? ' · stale' : '')));
      button('Open ' + label + ' usage', () => api.openProviderUsage(id), group);
      providers.append(group);
    }
    button(
      'Refresh provider usage',
      async () => {
        stamp.textContent = 'Checking supported provider usage…';
        try {
          await refreshUsage(true);
          stamp.textContent = 'Provider usage checked. Missing allowance remains unavailable.';
        } catch (error) {
          stamp.textContent = error.message;
        }
      },
      providers,
    );
    providers.append(
      node(
        'p',
        'Checks automatically every minute while Activity is visible using supported account interfaces. Checks may contact your provider. Local task counts are separate from subscription allowance.',
      ),
    );
    if (focusLabel && !document.querySelector('dialog[open]'))
      [...providers.querySelectorAll('button')]
        .find((button) => button.textContent === focusLabel)
        ?.focus({ preventScroll: true });
  };
  const render = () => {
    if (cleanupToken && Date.now() >= cleanupUntil) {
      undoButton.disabled = true;
      undoButton.hidden = true;
      cleanupToken = '';
      bulkStatus.textContent = 'Undo expired. Tasks can still be restored from Task centre.';
    }
    for (const id of selectedTasks)
      if (
        !jobs.some((j) => j.id === id && !j.archived && !window.atlasTaskExperience.live(j)) ||
        approvals.some((a) => a.jobId === id)
      )
        selectedTasks.delete(id);
    updateCleanupControls();
    const focused = document.activeElement?.closest('.activity-task');
    const focusId = focused?.dataset.jobId;
    const focusLabel = focusId ? document.activeElement.textContent : '';
    const focusCheckbox = document.activeElement?.matches('input[type=checkbox]');
    const view = model.overview(jobs, approvals, scope.value);
    counts.replaceChildren();
    for (const [label, value] of [
      ['Working', view.active.length],
      ['Needs you', view.attention.length],
      ['Finished · last 24 hours', view.finished24h],
    ]) {
      const item = node('div');
      item.append(node('span', label), node('strong', jobsKnown ? String(value) : '—'));
      counts.append(item);
    }
    intro.textContent = !jobsKnown
      ? 'Local task status is unavailable.'
      : view.pending.length
        ? view.pending.length +
          ' pending ' +
          (view.pending.length === 1 ? 'request needs' : 'requests need') +
          ' your decision.'
        : view.attention.length
          ? view.attention.length + ' ' + (view.attention.length === 1 ? 'task needs' : 'tasks need') + ' attention.'
          : view.active.length
            ? 'Work is underway. Check progress or continue another project.'
            : 'Ready for your next task.';
    attention.replaceChildren(node('h2', 'Needs your attention'));
    for (const job of view.attention.slice(0, 4)) task(job, attention, 'attention');
    if (!view.attention.length)
      attention.append(
        node(
          'p',
          jobsKnown
            ? 'No retained tasks need your attention.'
            : 'Task records are unavailable. Refresh activity to try again.',
        ),
      );
    if (view.pending.some((a) => !jobs.some((j) => j.id === a.jobId)))
      button('Review pending requests', () => ui.open('tasks', 'Approvals'), attention);
    active.replaceChildren(node('h2', 'Working now'));
    for (const job of view.active.slice(0, 4)) task(job, active, 'active');
    if (!view.active.length)
      active.append(
        node(
          'p',
          jobsKnown
            ? 'No tasks are working right now. Open Chat or Colab to start.'
            : 'Working task status is unavailable.',
        ),
      );
    recent.replaceChildren(node('h2', 'Recent results'));
    for (const job of view.completed.slice(0, 3)) task(job, recent, 'recent');
    if (!view.completed.length)
      recent.append(
        node(
          'p',
          jobsKnown ? 'Completed tasks and their check evidence will appear here.' : 'Recent results are unavailable.',
        ),
      );
    if (view.attention.length > 4 || view.active.length > 4 || view.completed.length > 3)
      button('View all tasks', () => ui.open('tasks', 'Task centre'), recent);
    renderUsage();
    if (focusId && !document.querySelector('dialog[open]')) {
      const row = [...page.querySelectorAll('.activity-task')].find((row) => row.dataset.jobId === focusId);
      const control =
        (focusCheckbox && row?.querySelector('input[type=checkbox]')) ||
        [...(row?.querySelectorAll('button') || [])].find((button) => button.textContent === focusLabel) ||
        row?.querySelector('button');
      control?.focus({ preventScroll: true });
    }
  };
  const refreshUsage = async (manual = false) => {
    if (disposed || usageLoading || (!manual && (!visible() || document.hidden))) return;
    if (!manual && lastUsageAttempt !== null && Date.now() - lastUsageAttempt < 60000) return;
    usageLoading = true;
    lastUsageAttempt = Date.now();
    try {
      const value = await api.providerUsage({ refresh: manual });
      if (disposed) return;
      if (value && typeof value === 'object' && !Array.isArray(value)) usage = value;
      if (visible()) renderUsage();
    } catch (error) {
      for (const value of Object.values(usage)) value.stale = true;
      if (visible()) renderUsage();
      if (manual) throw error;
    } finally {
      usageLoading = false;
    }
  };
  const refresh = async () => {
    if (loading || disposed) return;
    loading = true;
    void refreshUsage();
    const id = ++generation;
    const values = await Promise.allSettled([api.jobs(), api.approvals(), api.providerHealth(), api.projects()]);
    try {
      if (id !== generation || disposed) return;
      const data = (i, fallback) =>
        values[i].status === 'fulfilled' && Array.isArray(values[i].value) ? values[i].value : fallback;
      jobs = data(0, jobs);
      if (values[0].status === 'fulfilled' && Array.isArray(values[0].value)) jobsKnown = true;
      approvals = data(1, approvals);
      health = data(2, health);
      profiles = data(3, profiles);
      const selection = scope.value;
      const options = [['', 'All projects'], ...profiles.map((p) => [p.cwd, p.name])];
      if (JSON.stringify([...scope.options].map((o) => [o.value, o.textContent])) !== JSON.stringify(options))
        scope.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
      scope.value = [...scope.options].some((o) => o.value === selection) ? selection : '';
      render();
      const failed = values.filter((v) => v.status === 'rejected').length;
      stamp.textContent = failed
        ? 'Some local records are unavailable. Refresh to try again.'
        : 'Updated ' + new Date().toLocaleTimeString();
    } finally {
      loading = false;
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    if (visible() && !document.hidden)
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, 5000);
  };
  function open() {
    navigationRevision++;
    if (!visible())
      savedScroll = [
        {
          element: document.getElementById('response'),
          id: window.atlasPower.request('assistant').conversationId,
          scope: 'assistant',
        },
        { element: document.getElementById('colabTranscript'), id: window.atlasColab.current().id, scope: 'colab' },
      ].map((row) => ({ ...row, top: row.element?.scrollTop || 0 }));
    window.atlasDock?.hide();
    selectWorkspaceView('');
    document.body.dataset.mainPage = 'activity';
    trigger.setAttribute('aria-current', 'page');
    for (const b of document.querySelectorAll('[data-chat-workspace]')) b.setAttribute('aria-current', 'false');
    void refresh();
    schedule();
  }
  function leave() {
    if (!visible()) return;
    const revision = ++navigationRevision;
    document.body.dataset.mainPage = 'workspace';
    trigger.setAttribute('aria-current', 'false');
    clearTimeout(timer);
    const positions = savedScroll;
    savedScroll = [];
    requestAnimationFrame(() => {
      if (visible() || revision !== navigationRevision) return;
      for (const row of positions) {
        const id =
          row.scope === 'assistant'
            ? window.atlasPower.request('assistant').conversationId
            : window.atlasColab.current().id;
        if (row.id === id && row.element?.getClientRects().length) row.element.scrollTop = row.top;
      }
    });
  }
  scope.onchange = () => {
    selectedTasks.clear();
    render();
  };
  api.onJobs((patch) => {
    if (!patch) return;
    for (const id of patch.removed || []) jobs = jobs.filter((j) => j.id !== id);
    for (const job of patch.upsert || []) {
      jobs = jobs.filter((j) => j.id !== job.id);
      jobs.push(job);
    }
    if (visible()) render();
  });
  api.onApprovals((rows) => {
    if (Array.isArray(rows)) {
      approvals = rows;
      if (visible()) render();
    }
  });
  api.onProviderUsage((value) => {
    if (value?.provider) {
      usage[value.provider] = value;
      if (visible()) renderUsage();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (visible() && !document.hidden) {
      void refresh();
      schedule();
    } else clearTimeout(timer);
  });
  window.atlasActivity = { open, leave, refresh, visible };
  open();
  window.addEventListener('beforeunload', () => {
    disposed = true;
    clearTimeout(timer);
  });
})();
