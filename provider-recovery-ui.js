(() => {
  const api = window.atlas,
    power = window.atlasPower,
    { node, button } = power;
  const hosts = {};
  let health = [],
    jobs = [],
    version = 0;
  const render = () => {
    for (const scope of ['assistant', 'colab']) {
      const host = hosts[scope];
      host.replaceChildren();
      const request = power.request(scope),
        chat = scope === 'colab' ? window.atlasColab.current() : null;
      const latest = window.atlasWorkOverview.newest(
        jobs.filter((j) =>
          scope === 'colab'
            ? j.colabChatId === chat.id
            : !j.collaboration && j.conversationId === request.conversationId,
        ),
      )[0];
      for (const provider of health.filter((h) => !h.available))
        host.append(
          node(
            'span',
            (provider.provider === 'claude' ? 'Claude' : 'Codex') +
              ' · ' +
              (provider.estimated ? 'estimated retry ' : 'retry ') +
              new Date(provider.retryAt).toLocaleString(),
          ),
        );
      if (latest && ['failed', 'limit_reached', 'needs_attention'].includes(latest.status)) {
        host.append(
          node('span', 'Last task: ' + String(latest.error || latest.statusText || latest.status).slice(0, 240)),
        );
        button('Connection help', () => window.atlasWorkspace.open.diagnostics(), host);
        const notice = node('span');
        for (const provider of scope === 'assistant' ? ['codex', 'claude'] : [])
          button(
            'Prepare retry with ' + (provider === 'codex' ? 'Codex' : 'Claude'),
            () => {
              const input = document.getElementById('prompt');
              if (input.value.trim()) {
                notice.textContent = 'Save or clear your draft before preparing a retry.';
                return;
              }
              input.value =
                'Use ' +
                (provider === 'codex' ? 'Codex' : 'Claude') +
                '. ' +
                latest.prompt +
                '\n\nThe previous attempt stopped with: ' +
                String(latest.error || latest.statusText || latest.status).slice(0, 1000) +
                '. Inspect current progress before repeating actions.';
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.focus();
            },
            host,
          );
        button('Prepare model handoff', () => window.atlasUi.open('tasks', 'Model handoff'), host);
        host.append(notice);
      }
      host.hidden = !host.childNodes.length;
    }
  };
  for (const [scope, selector] of [
    ['assistant', '.composer'],
    ['colab', '.colab-composer'],
  ]) {
    const host = node('div');
    host.className = 'provider-recovery';
    host.setAttribute('aria-label', 'Provider status for ' + scope);
    host.setAttribute('role', 'status');
    host.hidden = true;
    document.querySelector(selector).prepend(host);
    hosts[scope] = host;
  }
  const refresh = async () => {
    const id = ++version;
    try {
      const values = await Promise.all([api.providerHealth(), api.jobs()]);
      if (id !== version) return;
      [health, jobs] = values;
      render();
    } catch {}
  };
  api.onJobs(() => void refresh());
  window.addEventListener('atlas-colab-chat-change', () => void refresh());
  window.addEventListener('atlas-context-change', render);
  window.addEventListener('atlas-assistant-task', () => void refresh());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refresh();
  });
  void refresh();
})();
