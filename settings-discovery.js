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
  const dataSection = [...document.querySelectorAll('#settingsDialog .setting-section')].find(
    (node) => node.querySelector('h3')?.textContent === 'Tools and data',
  );
  const logExport = make('button', 'Export redacted diagnostic log');
  const resetData = make('button', 'Delete local ATLAS data…');
  const notices = make('button', 'Third-party notices');
  const dataActions = make('div');
  dataActions.className = 'workspace-actions';
  dataSection.append(dataActions);
  for (const button of [logExport, resetData, notices]) {
    button.type = 'button';
    button.className = 'quiet-button';
    dataActions.append(button);
  }
  const dataNote = make(
    'p',
    'Review diagnostics before sharing: redaction cannot detect every private detail. Deletion restarts ATLAS and keeps downloaded models and runtimes; project files, exports, Git recovery snapshots, legacy folders and provider histories remain.',
  );
  dataNote.className = 'setting-note';
  dataSection.append(dataNote);
  notices.onclick = async () => {
    try {
      await api.showNotices();
    } catch (error) {
      toast(error.message);
    }
  };
  logExport.onclick = async () => {
    try {
      await api.exportDiagnostics();
    } catch (error) {
      toast(error.message);
    }
  };
  resetData.onclick = async () => {
    try {
      await api.resetLocalData();
    } catch (error) {
      toast(error.message);
    }
  };
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
  const automatic = make('input'),
    automaticLabel = make('label', ' Automatically download updates');
  automatic.type = 'checkbox';
  automatic.id = 'autoDownloadUpdates';
  automatic.checked = settings.autoDownloadUpdates === true;
  automaticLabel.prepend(automatic);
  const automaticNote = make(
    'p',
    'Check for updates on launch and download them in the background when enabled. Choose Restart and install when you are ready; ATLAS never restarts automatically. Save settings to apply this choice.',
  );
  automaticNote.className = 'setting-note';
  updateSection.append(automaticLabel, automaticNote);
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
  const prompt = make('dialog'),
    promptTitle = make('h2'),
    promptText = make('p'),
    promptNote = make(
      'p',
      'You can keep working while an update downloads. Installation requires your confirmation and waits until running work has stopped.',
    ),
    promptActions = make('div'),
    later = make('button', 'Later'),
    primary = make('button');
  prompt.id = 'updatePrompt';
  prompt.className = 'app-update-prompt';
  promptTitle.id = 'updatePromptTitle';
  promptText.id = 'updatePromptText';
  promptText.setAttribute('role', 'status');
  prompt.setAttribute('aria-labelledby', promptTitle.id);
  prompt.setAttribute('aria-describedby', promptText.id);
  promptActions.className = 'workspace-actions';
  later.type = primary.type = 'button';
  later.className = primary.className = 'quiet-button';
  later.autofocus = true;
  later.onclick = () => prompt.close();
  promptActions.append(later, primary);
  prompt.append(promptTitle, promptText, promptNote, promptActions);
  document.body.append(prompt);
  const prompted = new Set();
  let latest = {};
  function offerUpdate() {
    if (prompt.open && ['current', 'source'].includes(latest.status)) {
      prompt.close();
      return;
    }
    if (!prompt.open) {
      if (
        !latest.version ||
        prompted.has(latest.version) ||
        !['available', 'downloading', 'downloaded', 'source-available'].includes(latest.status)
      )
        return;
      if (document.querySelector('dialog[open]')) return;
      prompted.add(latest.version);
      prompt.showModal();
    }
    promptTitle.textContent =
      latest.status === 'error'
        ? 'ATLAS could not finish updating'
        : latest.status === 'downloaded'
          ? 'Your ATLAS update is ready'
          : 'An ATLAS update is available';
    promptText.textContent = updateText.textContent;
    primary.textContent =
      latest.status === 'downloaded'
        ? 'Restart and install'
        : latest.status === 'source-available'
          ? 'Open GitHub Releases'
          : latest.status === 'available'
            ? 'Download update'
            : latest.status === 'error'
              ? 'Try again'
              : latest.status === 'installing'
                ? 'Restarting…'
                : 'Downloading…';
    primary.disabled = ['checking', 'downloading', 'installing'].includes(latest.status);
    promptNote.textContent =
      latest.source || latest.status === 'source-available'
        ? 'This is a source checkout. Use Git or the published installer to update it.'
        : 'You can keep working while an update downloads. Installation requires your confirmation and waits until running work has stopped.';
  }
  primary.onclick = async () => {
    if (latest.status === 'source-available') {
      await api.openLink('https://github.com/springycape20/atlas-desktop/releases/latest');
      return;
    }
    const action = latest.status === 'downloaded' ? 'install' : latest.status === 'available' ? 'download' : 'check';
    primary.disabled = true;
    try {
      render(await api.updates({ action }));
    } catch (error) {
      promptText.textContent = error.message;
      primary.disabled = false;
    }
  };
  new MutationObserver(offerUpdate).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  function render(value) {
    latest = value;
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
    offerUpdate();
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
