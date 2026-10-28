(() => {
  const power = window.atlasPower,
    api = window.atlas;
  if (!power) return;
  const indicator = document.createElement('span');
  indicator.className = 'local-model-state';
  indicator.style.cssText = 'font:12px Segoe UI,sans-serif;color:#b4b4b4;margin-left:12px';
  document.querySelector('.composer')?.append(indicator);
  const update = (value) => {
    indicator.textContent = value.localModelEnabled
      ? 'Local model · text chat · ' + (value.localModel || 'choose a model')
      : '';
  };
  void api
    .getSettings()
    .then(update)
    .catch(() => {});
  power.register('Local models', async ({ body, status, node, button, current }) => {
    const value = await api.getSettings();
    if (!current()) return;
    body.append(
      node('h2', 'Connect your local model server'),
      node(
        'p',
        'Use a server you installed, such as Ollama or LM Studio. ATLAS sends text to its loopback API. The server controls whether a model runs locally; choose an installed local model for offline use.',
      ),
    );
    const enabledLabel = node('label');
    enabledLabel.className = 'power-toggle';
    const enabled = node('input');
    enabled.type = 'checkbox';
    enabled.id = 'localModelEnabled';
    enabled.checked = value.localModelEnabled === true;
    enabledLabel.append(enabled, node('span', 'Use local model for Assistant'));
    body.append(enabledLabel);
    const addressLabel = node('label', 'Local API base address'),
      address = node('input');
    address.value = value.localModelBaseUrl || 'http://127.0.0.1:11434/v1';
    address.id = 'localModelAddress';
    addressLabel.append(address);
    body.append(addressLabel);
    body.append(
      node(
        'p',
        'Ollama commonly uses port 11434; LM Studio commonly uses 1234. The API must accept local requests without an API key. Only localhost, 127.0.0.1 and ::1 are allowed.',
      ),
    );
    const modelLabel = node('label', 'Model identifier'),
      model = node('input');
    model.id = 'localModelName';
    model.value = value.localModel || '';
    modelLabel.append(model);
    body.append(modelLabel);
    const list = node('div');
    body.append(list);
    const actions = node('div');
    actions.className = 'power-actions';
    body.append(actions);
    button(
      'Find server models',
      async () => {
        status.textContent = 'Reading the local server model list…';
        const models = await api.localModel({ action: 'models', base: address.value.trim() });
        list.replaceChildren();
        if (!models.length) list.append(node('p', 'The server returned no models. Load a model in your server first.'));
        for (const id of models)
          button(
            id,
            () => {
              model.value = id;
            },
            list,
          );
        status.textContent = `${models.length} models reported by the local server. Model files and licences are managed by that server.`;
      },
      actions,
    );
    button(
      'Save local model settings',
      async () => {
        if (enabled.checked && !model.value.trim()) throw Error('Enter a model identifier first.');
        // Validation belongs to the main process; saving never starts a model request.
        const saved = await api.saveSettings({
          ...(await api.getSettings()),
          localModelEnabled: enabled.checked,
          localModelBaseUrl: address.value.trim(),
          localModel: model.value.trim(),
        });
        if (typeof settings === 'object') settings = saved;
        update(saved);
        status.textContent = saved.localModelEnabled
          ? 'Assistant now uses the local model. Requests never fall back to Codex or Claude automatically.'
          : 'Local model mode is off. Assistant uses its provider routing settings.';
      },
      actions,
    ).className = 'power-primary';
    status.textContent =
      'Text chat only: no model-driven file edits, shell commands or Colab roles. Selected text context is supported; images are not interpreted. Optional ElevenLabs speech and update checks can still use the internet.';
  });
})();
