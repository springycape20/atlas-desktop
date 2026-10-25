(() => {
  const api = window.atlas,
    make = (tag, text) => {
      const node = document.createElement(tag);
      if (text) node.textContent = text;
      return node;
    };
  const section = [...document.querySelectorAll('#settingsDialog .setting-section')].find(
    (node) => node.querySelector('h3')?.textContent === 'Models',
  );
  const status = make('p', 'Checking provider model catalogues…');
  status.className = 'setting-note';
  status.setAttribute('role', 'status');
  const refresh = make('button', 'Refresh available models');
  refresh.type = 'button';
  refresh.className = 'quiet-button';
  section.querySelector('p').after(refresh, status);
  for (const custom of section.querySelectorAll('.add-model')) {
    const details = make('details'),
      summary = make('summary', 'Advanced: custom model ID');
    details.append(summary);
    custom.before(details);
    details.append(custom);
    const remove = custom.closest('.model-card').querySelector('.remove-model');
    if (remove) details.append(remove);
  }
  let scanning;
  async function scan() {
    if (scanning) return scanning;
    refresh.disabled = true;
    status.textContent = 'Checking provider model catalogues…';
    scanning = (async () => {
      try {
        const value = await api.discoverModels(true);
        window.atlasDiscoveredModels = value;
        for (const provider of ['codex', 'claude']) {
          const select = document.getElementById(provider + 'Model'),
            choice = select.value;
          renderModelList(provider);
          if ([...select.options].some((option) => option.value === choice)) select.value = choice;
        }
        window.atlasColab?.setCatalog(value);
        status.textContent = ['codex', 'claude']
          .map(
            (provider) =>
              provider.toUpperCase() +
              ': ' +
              value[provider].models.length +
              ' models' +
              (value[provider].stale ? ' · cached/fallback list; ' + value[provider].error : ' · refreshed'),
          )
          .join(' | ');
      } catch (error) {
        status.textContent = 'Model discovery failed: ' + error.message;
      } finally {
        refresh.disabled = false;
        scanning = null;
      }
    })();
    return scanning;
  }
  refresh.onclick = scan;
  const updateSection = make('section');
  updateSection.className = 'setting-section';
  updateSection.append(make('h3', 'App updates'));
  const updateText = make('p', 'Checking for app updates…');
  updateText.className = 'setting-note';
  updateText.setAttribute('role', 'status');
  updateSection.append(updateText);
  const actions = make('div');
  actions.className = 'workspace-actions';
  updateSection.append(actions);
  document.querySelector('#settingsDialog .setting-section').before(updateSection);
  function actionButton(label, action) {
    const button = make('button', label);
    button.type = 'button';
    button.className = 'quiet-button';
    button.onclick = async () => {
      button.disabled = true;
      try {
        render(await api.updates({ action }));
      } catch (error) {
        updateText.textContent = error.message;
        button.disabled = false;
      }
    };
    actions.append(button);
    return button;
  }
  let notified = '';
  function render(value) {
    actions.replaceChildren();
    const version = value.version ? ' ' + value.version : '';
    const messages = {
      idle: 'Updates have not been checked yet.',
      checking: 'Checking for app updates…',
      current: 'ATLAS ' + value.currentVersion + ' is up to date.',
      available: 'ATLAS' + version + ' is available.',
      downloading: 'Downloading ATLAS' + version + ' · ' + (value.percent || 0) + '%',
      downloaded: 'ATLAS' + version + ' is downloaded and ready to install.',
      installing: 'Restarting ATLAS to install the update…',
      source:
        'Source checkout ' +
        value.currentVersion +
        '. Automatic installation is available in the installed Windows app.',
      'source-available': 'ATLAS' + version + ' is available. Source checkouts update through Git or the installer.',
      error: value.error,
    };
    updateText.textContent = messages[value.status] || value.status;
    if (!['checking', 'downloading', 'installing'].includes(value.status)) actionButton('Check for updates', 'check');
    if (value.status === 'available') actionButton('Download update', 'download');
    if (value.status === 'downloaded') actionButton('Restart and install', 'install');
    if (['available', 'downloaded', 'source-available'].includes(value.status) && notified !== value.status) {
      notified = value.status;
      toast(updateText.textContent + ' Open Settings → App updates.');
    }
    const releases = make('button', 'Open GitHub Releases');
    releases.type = 'button';
    releases.className = 'quiet-button';
    releases.onclick = () => api.openLink('https://github.com/springycape20/atlas-desktop/releases/latest');
    actions.append(releases);
  }
  api.onUpdateStatus(render);
  void scan();
  void api
    .updates({ action: 'check' })
    .then(render)
    .catch((error) => {
      updateText.textContent = error.message;
    });
})();
