(() => {
  const api = window.atlas,
    power = window.atlasPower,
    { node, button } = power;
  const dock = node('aside');
  dock.className = 'connected-workbench';
  dock.hidden = true;
  dock.setAttribute('aria-label', 'Connected project workbench');
  const header = node('header'),
    title = node('strong', 'Project workbench'),
    tabs = node('nav'),
    tools = node('div'),
    status = node('p');
  status.setAttribute('role', 'status');
  tabs.setAttribute('aria-label', 'Workbench panels');
  header.append(title);
  dock.append(header, tabs, tools, status);
  document.body.append(dock);
  const editor = document.querySelector('.project-editor-panel'),
    terminal = document.querySelector('.terminal-dock');
  const views = { editor, terminal },
    preview = node('section'),
    changes = node('section');
  preview.className = 'workbench-preview';
  changes.className = 'workbench-changes';
  views.preview = preview;
  views.changes = changes;
  dock.append(editor, terminal, preview, changes);
  let active = 'editor',
    context = null,
    previewContext = null,
    width = 560,
    generation = 0;
  try {
    width = Math.max(360, Math.min(900, Number(localStorage.getItem('atlas.workbench.width')) || 560));
  } catch {}
  const currentContext = () => {
    const r = power.request();
    return { cwd: r.cwd, scope: r.scope };
  };
  const layout = () => {
    const top = Math.ceil(document.querySelector('.app>header.top').getBoundingClientRect().bottom + 8);
    dock.style.top = top + 'px';
    const value = Math.min(width, Math.max(320, innerWidth - 360));
    document.documentElement.style.setProperty('--atlas-workbench-width', value + 'px');
    if (previewContext) {
      const rect = canvas.getBoundingClientRect(),
        hidden = dock.hidden || active !== 'preview' || Boolean(document.querySelector('dialog[open]'));
      void api
        .livePreview({
          ...previewContext,
          action: 'dock-layout',
          visible: !hidden,
          x: rect.x,
          y: rect.y,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        })
        .catch(() => {});
    }
  };
  const activate = (name) => {
    if (!views[name]) return;
    active = name;
    dock.hidden = false;
    document.body.classList.add('atlas-workbench-open');
    for (const [key, view] of Object.entries(views)) view.hidden = key !== name;
    for (const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.view === name));
    document.body.classList.remove('project-editor-open', 'terminal-dock-open');
    context = currentContext();
    title.textContent = 'Workbench · ' + (context.cwd.split(/[\\/]/).pop() || 'Choose project');
    layout();
  };
  const hide = () => {
    dock.hidden = true;
    document.body.classList.remove('atlas-workbench-open');
    layout();
  };
  button('Hide', hide, header);
  const size = node('input');
  size.type = 'range';
  size.min = '360';
  size.max = '900';
  size.value = width;
  size.setAttribute('aria-label', 'Workbench width');
  size.oninput = () => {
    width = Number(size.value);
    layout();
    try {
      localStorage.setItem('atlas.workbench.width', String(width));
    } catch {}
  };
  header.append(size);
  for (const [id, label] of [
    ['editor', 'Editor'],
    ['terminal', 'Terminal'],
    ['preview', 'Preview'],
    ['changes', 'Changes'],
  ]) {
    const b = button(
      label,
      async () => {
        if (id === 'terminal') {
          activate(id);
          await window.atlasTerminal.open();
          activate(id);
        } else {
          activate(id);
          if (id === 'changes') await loadChanges();
        }
      },
      tabs,
    );
    b.dataset.view = id;
  }
  const url = node('input');
  url.value = 'http://127.0.0.1:5173/';
  url.setAttribute('aria-label', 'Workbench preview URL');
  preview.append(url);
  const previewActions = node('div');
  previewActions.className = 'power-actions';
  preview.append(previewActions);
  button(
    'Open local preview',
    async () => {
      const request = currentContext();
      await api.livePreview({ ...request, action: 'open', dock: true, url: url.value });
      previewContext = request;
      status.textContent = 'Sandboxed local preview; other origins and app APIs are blocked.';
      layout();
    },
    previewActions,
  );
  button('Reload', () => api.livePreview({ ...currentContext(), action: 'reload' }), previewActions);
  button('Preview tools', () => power.show('Live preview'), previewActions);
  const canvas = node('div');
  canvas.className = 'workbench-preview-canvas';
  preview.append(canvas);
  const loadChanges = async () => {
    const id = ++generation,
      ctx = currentContext();
    changes.replaceChildren(node('h3', 'Recent task changes'));
    const jobs = await api.jobs();
    if (id !== generation) return;
    const rows = window.atlasWorkOverview.newest(
      jobs.filter((j) => window.atlasWorkOverview.sameProject(j, ctx.cwd) && j.status !== 'running'),
    );
    for (const job of rows.slice(0, 10)) {
      const row = node('section');
      row.append(node('h3', window.atlasWorkOverview.title(job)));
      button('View task result', () => window.atlasOutcomes.open(job.id), row);
      if (job.changeId || job.workspaceId)
        try {
          const result = await api.changes({ jobId: job.id });
          if (id !== generation) return;
          for (const file of result.files || []) {
            const path = typeof file === 'string' ? file : file.path;
            button(path, () => window.atlasProjectEditor.open({ cwd: job.cwd, jobId: job.id }, path), row);
          }
        } catch (e) {
          row.append(node('p', e.message));
        }
      changes.append(row);
    }
    if (!rows.length) changes.append(node('p', 'No finished tasks in this project yet.'));
  };
  window.atlasDock = {
    activate,
    open: () => {
      activate(active);
      if (active === 'changes') return loadChanges();
    },
    hide,
    layout,
    snapshot: () => ({ active, width, visible: !dock.hidden, url: url.value }),
    restore(value) {
      if (!value) return;
      width = Math.max(360, Math.min(900, Number(value.width) || 560));
      if (typeof value.url === 'string') url.value = value.url;
      if (value.visible && views[value.active]) activate(value.active);
      else hide();
      size.value = width;
    },
  };
  const projectChanged = () => {
    if (!dock.hidden && context?.cwd !== currentContext().cwd) hide();
  };
  window.addEventListener('atlas-colab-chat-change', projectChanged);
  window.addEventListener('atlas-assistant-task', projectChanged);
  window.addEventListener('resize', layout);
  const observer = new MutationObserver(() => {
    if (editor && !editor.hidden && active !== 'editor') activate('editor');
    else if (terminal && !terminal.hidden && active !== 'terminal') activate('terminal');
    layout();
  });
  observer.observe(editor, { attributes: true, attributeFilter: ['hidden'] });
  observer.observe(terminal, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver((changes) => {
    if (changes.some((change) => change.target.tagName === 'DIALOG')) layout();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  for (const panel of [editor, terminal]) {
    const buttons = [...panel.querySelectorAll('button')];
    const b = buttons.find((b) => b.textContent === 'Hide editor' || b.textContent === 'Hide');
    if (b) b.addEventListener('click', hide);
  }
})();
