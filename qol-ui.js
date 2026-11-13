(() => {
  const model = window.atlasQol,
    api = window.atlas;
  window.atlasResponseErrors = {
    render(target, error) {
      const info = model.errorInfo(error),
        box = document.createElement('section');
      box.className = 'response-error-card';
      const title = document.createElement('strong'),
        help = document.createElement('p'),
        details = document.createElement('details'),
        summary = document.createElement('summary'),
        raw = document.createElement('pre');
      title.textContent = info.title;
      help.textContent = info.help;
      summary.textContent = 'Technical details';
      raw.textContent = info.detail;
      details.append(summary, raw);
      box.append(title, help);
      window.atlasUi.actionButton(
        info.action === 'connection'
          ? 'Connection help'
          : info.action === 'usage'
            ? 'Check provider usage'
            : 'Review task progress',
        () => {
          if (info.action === 'connection') return window.atlasWorkspace.open.diagnostics();
          if (info.action === 'usage') return window.atlasActivity.open();
          return window.atlasUi.open('tasks', 'Task centre');
        },
        box,
      );
      box.append(details);
      target.replaceChildren(box);
    },
  };
  const input = document.getElementById('prompt'),
    store = model.createDraftStore({
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
    });
  let active = '',
    pending,
    timer,
    warned = false;
  const fail = (error) => {
    input.title = 'Draft recovery unavailable: ' + error.message;
    if (!warned) {
      warned = true;
      toast(input.title);
    }
  };
  const flush = () => {
    clearTimeout(timer);
    if (!pending) return;
    const value = pending;
    pending = null;
    try {
      store.put(value.key, value.text);
      input.title = 'Unsent draft saved on this PC';
    } catch (error) {
      fail(error);
    }
  };
  const activate = () => {
    const request = window.atlasPower.request('assistant'),
      key = store.identity(request.conversationId, request.cwd);
    if (key === active) return;
    flush();
    active = key;
    try {
      const saved = store.get(key);
      input.value = saved;
      sizeAssistantComposer();
      if (saved) input.title = 'Recovered unsent draft from this PC';
    } catch (error) {
      fail(error);
    }
  };
  input.addEventListener('input', () => {
    if (!active) {
      const request = window.atlasPower.request('assistant');
      active = store.identity(request.conversationId, request.cwd);
    }
    pending = { key: active, text: input.value };
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  });
  window.atlasDraftRecovery = {
    activate,
    identity: () => active,
    sent(key) {
      pending = null;
      clearTimeout(timer);
      try {
        if (key) store.remove(key);
        if (active && active !== key) store.remove(active);
      } catch (error) {
        fail(error);
      }
    },
    flush,
  };
  window.addEventListener('atlas-assistant-task', activate);
  window.addEventListener('beforeunload', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
  void window.atlasAssistant.ready.then(activate);
  let jobs = [],
    approvals = [],
    read = {};
  const openedAt = Date.now(),
    readKey = 'atlas.chat-result-read.v1';
  try {
    read = JSON.parse(localStorage.getItem(readKey) || '{}');
    if (!read || Array.isArray(read) || typeof read !== 'object') read = {};
  } catch {}
  const changed = () => window.dispatchEvent(new Event('atlas-chat-badges'));
  window.atlasChatBadges = {
    label(scope, id) {
      const rows = jobs.filter((job) =>
          scope === 'colab' ? job.colabChatId === id : !job.collaboration && job.conversationId === id,
        ),
        key = scope + ':' + id;
      const current = window.atlasPower.request(scope);
      const viewing =
        !document.hidden &&
        !document.querySelector('dialog[open]') &&
        document.body.dataset.mainPage === 'workspace' &&
        (document.body.dataset.workspace === 'colab' ? scope === 'colab' : scope === 'assistant') &&
        (scope === 'colab' ? current.chatId : current.conversationId) === id;
      const last = Math.max(
        0,
        ...rows.filter((j) => j.status === 'completed').map((j) => j.endedAt || j.startedAt || 0),
      );
      if (viewing && last > (read[key] || openedAt)) {
        read[key] = last;
        const entries = Object.entries(read)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 500);
        try {
          localStorage.setItem(readKey, JSON.stringify(Object.fromEntries(entries)));
        } catch {}
      }
      return model.badge(rows, approvals, read[key] || openedAt);
    },
  };
  api.onJobs((patch) => {
    if (!patch) return;
    for (const id of patch.removed || []) jobs = jobs.filter((j) => j.id !== id);
    for (const job of patch.upsert || []) {
      jobs = jobs.filter((j) => j.id !== job.id);
      jobs.push(job);
    }
    changed();
  });
  api.onApprovals((value) => {
    if (Array.isArray(value)) {
      approvals = value;
      changed();
    }
  });
  void Promise.all([api.jobs(), api.approvals()])
    .then(([j, a]) => {
      if (Array.isArray(j)) jobs = j;
      if (Array.isArray(a)) approvals = a;
      changed();
    })
    .catch(() => {});
  new MutationObserver(changed).observe(document.body, {
    attributes: true,
    attributeFilter: ['data-main-page', 'data-workspace'],
  });
  document.addEventListener('visibilitychange', changed);
})();
