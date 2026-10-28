// Local activity is not subscription allowance. No quota polling runs here.
(() => {
  const api = window.atlas;
  const { node, actionButton } = window.atlasUi;
  const section = node('section', undefined, 'setting-section');
  section.append(
    node('h3', 'Provider activity'),
    node(
      'p',
      'Activity recorded by ATLAS on this computer. These counts are not subscription usage, tokens, cost or remaining allowance.',
    ),
  );
  const content = node('div');
  const status = node('p', undefined, 'setting-note');
  status.setAttribute('role', 'status');
  section.append(content, status);
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    refreshButton.disabled = true;
    status.textContent = 'Reading local activity…';
    try {
      const [jobs, health] = await Promise.all([api.jobs(), api.providerHealth()]);
      if (!Array.isArray(jobs) || !Array.isArray(health)) throw Error('Local activity is unavailable.');
      content.replaceChildren();
      for (const [provider, label] of [
        ['codex', 'Codex'],
        ['claude', 'Claude'],
        ['atlas', 'Colab · Codex + Claude'],
      ]) {
        const rows = jobs.filter((job) =>
          provider === 'atlas' ? job.collaboration : !job.collaboration && job.provider === provider,
        );
        const group = node('section', undefined, 'provider-activity-row');
        group.append(node('h4', label + ' · ' + rows.length + ' retained tasks'));
        const counts = [
          'running',
          'completed',
          'failed',
          'paused',
          'cancelled',
          'needs_attention',
          'limit_reached',
        ].map(
          (key) =>
            rows.filter((job) => job.status === key).length +
            ' ' +
            ({ cancelled: 'stopped', needs_attention: 'need attention', limit_reached: 'limited' }[key] || key),
        );
        group.append(node('p', counts.join(' · ')));
        if (provider !== 'atlas') {
          const current = health.find((item) => item.provider === provider);
          group.append(
            node(
              'p',
              !current
                ? 'Limit status: no local status available.'
                : current.available
                  ? 'No active limit cooldown recorded by ATLAS. Account allowance is unknown.'
                  : 'Limit reported · ' +
                    (current.estimated ? 'estimated retry ' : 'retry ') +
                    new Date(current.retryAt).toLocaleString(),
            ),
          );
          actionButton(
            'Open ' + label + ' account usage',
            async () => {
              try {
                await api.openProviderUsage(provider);
              } catch {
                status.textContent = 'Could not open the provider usage page.';
              }
            },
            group,
          );
        }
        content.append(group);
      }
      status.textContent =
        'Updated ' +
        new Date().toLocaleTimeString() +
        '. Counts cover retained ATLAS tasks only; activity in other apps is not included.';
    } catch (error) {
      status.textContent = 'Could not read local activity. ' + error.message;
    } finally {
      refreshing = false;
      refreshButton.disabled = false;
    }
  };
  const refreshButton = actionButton('Refresh local activity', refresh, section);
  window.atlasSettings.register(section);
  const trigger = actionButton(
    'Provider activity',
    async () => {
      await window.atlasUi.settings('Provider activity');
      await refresh();
    },
    document.querySelector('.topright'),
  );
  trigger.id = 'providerActivityOpen';
  trigger.style.order = '-2';
  window.atlasProviderActivity = { refresh };
})();
