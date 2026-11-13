(() => {
  const api = window.atlas,
    power = window.atlasPower,
    model = window.atlasWorkOverview;
  if (!power || !model) return;
  let selected = '',
    taskView = 'active';
  let refreshTasks = () => {};
  api.onJobs((patch) => refreshTasks(patch));
  const close = () => {
    window.atlasUi.hub.close();
    power.close();
  };
  const openTask = async (job) => {
    await api.taskOpen(job.id);
    close();
  };
  const renderTask = (job, host, node, button, compact = false) => {
    const row = node('article');
    row.className = 'work-overview-row';
    row.dataset.taskId = job.id;
    row.append(
      node('h3', model.title(job)),
      node('p', job.status.replaceAll('_', ' ') + ' · ' + (job.statusText || '')),
    );
    const details = node('details');
    details.append(node('summary', 'Original request'), node('p', job.prompt || ''));
    if (!compact) row.append(details);
    const actions = node('div');
    actions.className = 'power-actions';
    button(job.status === 'running' ? 'Open progress' : 'Open task', () => openTask(job), actions);
    if (job.status !== 'running') button('View result', () => window.atlasOutcomes.open(job.id), actions);
    if (job.workspaceId && job.status !== 'running')
      button(
        'Review changes',
        () => {
          close();
          return window.atlasWorkspace.review(job.workspaceId);
        },
        actions,
      );
    if (job.status === 'running') button('Pause', () => api.jobs({ action: 'stop', id: job.id, pause: true }), actions);
    if (!window.atlasTaskExperience.live(job)) {
      const organize = async (action) => {
        const rows = await api.jobs({ action, id: job.id });
        refreshTasks({ upsert: rows, removed: [] });
      };
      if (model.bucket(job) === 'attention')
        button('Dismiss from attention', () => organize('dismiss-attention'), actions);
      if (window.atlasTaskExperience.dismissed(job))
        button('Restore attention', () => organize('restore-attention'), actions);
      button(
        job.archived ? 'Unarchive task' : 'Archive task',
        () => organize(job.archived ? 'unarchive' : 'archive'),
        actions,
      );
    }
    const rename = node('details'),
      label = node('label', 'Task title'),
      input = node('input');
    input.value = model.title(job);
    input.maxLength = 100;
    input.setAttribute('aria-label', 'Task title');
    label.append(input);
    rename.append(node('summary', 'Rename task'), label);
    button(
      'Save title',
      async () => {
        await api.jobs({ action: 'rename', id: job.id, title: input.value });
        job.title = input.value.trim();
        row.querySelector('h3').textContent = model.title(job);
      },
      rename,
    );
    row.append(actions);
    if (!compact) row.append(rename);
    host.append(row);
  };
  power.register('Task centre', async ({ body, node, button, current, status }) => {
    body.append(node('h2', 'Task centre'));
    const filters = node('div');
    filters.className = 'power-actions';
    filters.dataset.compactActions = 'true';
    filters.setAttribute('aria-label', 'Task views');
    const project = node('select');
    project.setAttribute('aria-label', 'Filter tasks by project');
    project.append(new Option('All projects', ''));
    const [jobs, profiles] = await Promise.all([api.jobs(), api.projects()]);
    if (!current()) return;
    for (const p of profiles) project.append(new Option(p.name, p.cwd));
    const search = node('input');
    search.type = 'search';
    search.placeholder = 'Search tasks…';
    search.setAttribute('aria-label', 'Search tasks');
    const list = node('section');
    list.setAttribute('aria-live', 'polite');
    const render = () => {
      list.replaceChildren();
      const matching = model
        .newest(jobs)
        .filter(
          (j) =>
            (!project.value || model.sameProject(j, project.value)) &&
            (j.prompt + ' ' + model.title(j)).toLowerCase().includes(search.value.toLowerCase()),
        );
      for (const b of filters.children) {
        b.setAttribute('aria-pressed', String(b.dataset.view === taskView));
        b.textContent =
          b.dataset.label + ' (' + matching.filter((j) => model.bucket(j) === b.dataset.view).length + ')';
      }
      const rows = matching.filter((j) => model.bucket(j) === taskView);
      for (const j of rows) renderTask(j, list, node, button);
      if (!rows.length)
        list.append(node('p', taskView === 'active' ? 'No tasks are running.' : 'No tasks in this view.'));
    };
    for (const [id, label] of [
      ['active', 'Active'],
      ['attention', 'Needs attention'],
      ['history', 'History'],
      ['archived', 'Archived'],
    ]) {
      const b = button(
        label,
        () => {
          taskView = id;
          render();
        },
        filters,
      );
      b.dataset.view = id;
      b.dataset.label = label;
    }
    project.onchange = search.oninput = render;
    refreshTasks = (patch) => {
      if (!current()) return;
      for (const id of patch.removed || []) {
        const at = jobs.findIndex((j) => j.id === id);
        if (at >= 0) jobs.splice(at, 1);
      }
      for (const j of patch.upsert || []) {
        const at = jobs.findIndex((row) => row.id === j.id);
        if (at >= 0) jobs[at] = j;
        else jobs.push(j);
      }
      if (!body.contains(document.activeElement) || !document.activeElement.matches('input')) render();
    };
    body.append(filters, project, search, list);
    button('Refresh tasks', () => power.show('Task centre'));
    render();
    status.textContent = 'Task status and recorded checks are separate evidence. Opening a task does not resume it.';
  });
  power.register('Project home', async ({ body, node, button, current, status }) => {
    body.append(node('h2', 'Projects'));
    const [profiles, jobs, chats, approvals] = await Promise.all([
      api.projects(),
      api.jobs(),
      api.historyList({ provider: 'atlas' }),
      api.approvals(),
    ]);
    if (!current()) return;
    await window.atlasWorkspace.refreshProfiles();
    if (!current()) return;
    const picker = node('select');
    picker.setAttribute('aria-label', 'Project home project');
    picker.append(new Option('Choose a project', ''), ...profiles.map((p) => new Option(p.name, p.id)));
    if (profiles.some((p) => p.id === selected)) picker.value = selected;
    else
      picker.value =
        profiles.find((p) => p.id === window.atlasWorkspace.context(power.request().scope).profileId)?.id ||
        profiles[0]?.id ||
        '';
    body.append(picker);
    const actions = node('div');
    actions.className = 'power-actions';
    body.append(actions);
    button(
      'Project settings',
      () => {
        close();
        return window.atlasWorkspace.open.projects();
      },
      actions,
    );
    button('Set up a project', () => window.atlasSetupAssistant.open(), actions);
    button('Refresh project home', () => power.show('Project home'), actions);
    const detail = node('section');
    detail.className = 'project-home-detail';
    body.append(detail);
    const render = () => {
      selected = picker.value;
      const p = profiles.find((p) => p.id === selected);
      detail.replaceChildren();
      if (!p) {
        detail.append(node('p', 'Create a project profile to organise your work.'));
        return;
      }
      const overview = model.summary(jobs, p.cwd);
      detail.append(node('h3', p.name), node('p', p.cwd));
      const primary = node('div');
      primary.className = 'power-actions';
      detail.append(primary);
      const recent = model
        .newest([
          ...chats.filter((c) => model.sameProject(c, p.cwd)),
          ...window.atlasColab
            .history()
            .filter(
              (c) =>
                model.sameProject(c, p.cwd) &&
                (c.messages?.length || c.turns?.length || c.draft || c.title !== 'New Colab chat'),
            )
            .map((c) => ({ ...c, provider: 'colab' })),
        ])
        .slice(0, 5);
      button(
        'Continue working',
        async () => {
          if (recent[0]) {
            close();
            if (recent[0].provider === 'colab') window.atlasColab.selectChat(recent[0].id);
            else await window.atlasAssistant.open(recent[0].id);
          } else {
            window.atlasWorkspace.useProfile(p);
            close();
          }
        },
        primary,
      );
      button(
        'New project chat',
        () => {
          if (document.getElementById('prompt').value.trim()) throw Error('Save or clear your current draft first.');
          window.atlasAssistant.newChat();
          window.atlasWorkspace.useProfile(p);
          close();
        },
        primary,
      );
      const sections = node('div');
      sections.className = 'project-home-sections';
      const attention = node('section'),
        active = node('section'),
        conversations = node('section'),
        approvalList = node('section');
      sections.append(attention, active, conversations, approvalList);
      detail.append(sections);
      attention.append(node('h3', 'Needs attention · ' + overview.attention.length));
      for (const j of overview.attention.slice(0, 2)) renderTask(j, attention, node, button, true);
      if (!overview.attention.length) attention.append(node('p', 'No retained tasks need attention.'));
      active.append(node('h3', 'Active · ' + overview.active.length));
      for (const j of overview.active.slice(0, 2)) renderTask(j, active, node, button, true);
      if (!overview.active.length) active.append(node('p', 'No tasks are running for this project.'));
      conversations.append(node('h3', 'Recent conversations'));
      for (const c of recent)
        button(
          c.title || 'Untitled chat',
          async () => {
            close();
            if (c.provider === 'colab') window.atlasColab.selectChat(c.id);
            else await window.atlasAssistant.open(c.id);
          },
          conversations,
        );
      if (!recent.length) conversations.append(node('p', 'No saved conversations for this project.'));
      const pending = (Array.isArray(approvals) ? approvals : approvals?.pending || []).filter(
        (a) =>
          model.sameProject(a, p.cwd) ||
          jobs.some((j) => model.sameProject(j, p.cwd) && (a.jobId === j.id || a.taskId === j.id)),
      );
      approvalList.append(node('h3', 'Pending approvals · ' + pending.length));
      if (pending.length) button('Review approvals', () => window.atlasUi.open('tasks', 'Approvals'), approvalList);
      else approvalList.append(node('p', 'No pending approvals for this project.'));
      button(
        'View all project tasks',
        async () => {
          taskView = 'history';
          await power.show('Task centre');
          const filter = power.body.querySelector('[aria-label="Filter tasks by project"]');
          filter.value = p.cwd;
          filter.dispatchEvent(new Event('change'));
        },
        detail,
      );
    };
    picker.onchange = render;
    render();
    status.textContent =
      'Project records stay local. Continue opens saved work; tasks resume only through their existing controls.';
  });
  window.atlasUi.register('tasks', 'Task centre');
  window.atlasUi.register('library', 'Project home');
  // The former destination remains an alias for command-menu and older links.
  const project = document.querySelector('[data-destination="projects"]');
  if (project) project.onclick = () => power.show('Project home');
  window.atlasProjectHome = { open: () => power.show('Project home') };
})();
