(() => {
  const { node, actionButton } = window.atlasUi,
    api = window.atlas;
  const section = node('section', undefined, 'setting-section');
  section.dataset.ephemeralSettings = 'true';
  section.append(
    node('h3', 'Automatic statistics'),
    node(
      'p',
      'Optional and off by default. Enabling is a separate choice from manual reports or normal app use. Future monthly samples contain the same fixed counters, with a new report receipt and deletion secret each time. No chats, prompts, files, paths, accounts, raw errors or device IDs are included.',
    ),
  );
  const recipient = node('p', undefined, 'statistics-recipient'),
    state = node('p'),
    payload = node('pre'),
    notice = node('p');
  payload.className = 'statistics-preview';
  payload.tabIndex = 0;
  payload.hidden = true;
  payload.setAttribute('aria-label', 'Current example of the report payload');
  state.setAttribute('role', 'status');
  section.append(recipient, state, notice);
  const choice = node('label', undefined, 'power-toggle'),
    agree = node('input');
  agree.type = 'checkbox';
  choice.append(
    agree,
    node('span', 'I reviewed the recipient, notice and sample. I opt in to future automatic monthly statistics.'),
  );
  let current,
    token,
    revision = 0;
  const apply = (value) => {
    current = value;
    recipient.textContent = value.recipient
      ? `${value.recipient.operator}\nRecipient: ${value.recipient.endpoint}\nPrivacy notice: ${value.recipient.privacyUrl}\nContact: ${value.recipient.contact}`
      : 'No receiving service is configured. Automatic reporting is unavailable in normal builds. The local prototype can be tried from source.';
    state.textContent =
      (value.enabled ? 'Automatic reporting is on. ' : 'Automatic reporting is off. ') + (value.result || '');
    notice.textContent = value.localDemo
      ? 'Local prototype only: sends to this computer. This is not a deployed service. Scheduled samples cover the previous completed UTC month; no earlier backfill. The example below uses the current month for an explicit local test.'
      : 'The service and its hosting providers can receive IP/network metadata even though the report omits it. Reports are not guaranteed anonymous. Future monthly values differ from this current example. Withdrawal stops future requests and attempts to abort an in-flight request; it cannot recall data already received.';
    preview.disabled = !value.configured;
    enable.disabled = value.enabled || !value.configured || !agree.checked || !token;
    stop.disabled = !value.enabled;
    send.hidden = !value.localDemo;
    send.disabled = !value.enabled || !token;
    remove.disabled = !(value.receipts || []).length;
  };
  const preview = actionButton(
    'Review recipient and current sample',
    async () => {
      const seq = ++revision,
        value = await api.automaticStatistics({ action: 'preview' });
      if (seq !== revision) return;
      token = value.token;
      payload.textContent = JSON.stringify(value.payload, null, 2);
      payload.hidden = false;
      agree.checked = false;
      apply(value);
    },
    section,
  );
  const enable = actionButton(
    'Enable automatic reporting',
    async () => apply(await api.automaticStatistics({ action: 'enable', token, confirmed: agree.checked })),
    section,
  );
  enable.disabled = true;
  const stop = actionButton(
    'Turn off and cancel pending report',
    async () => {
      revision++;
      token = null;
      agree.checked = false;
      payload.hidden = true;
      payload.textContent = '';
      apply(await api.automaticStatistics({ action: 'disable' }));
    },
    section,
  );
  const send = actionButton(
    'Send reviewed local sample once',
    async () => apply(await api.automaticStatistics({ action: 'send-demo', token, confirmed: true })),
    section,
  );
  send.hidden = true;
  const remove = actionButton(
    'Turn off and request deletion of submitted reports…',
    async () => apply(await api.automaticStatistics({ action: 'delete' })),
    section,
  );
  const refresh = actionButton(
    'Refresh reporting status',
    async () => apply(await api.automaticStatistics({ action: 'status' })),
    section,
  );
  agree.onchange = () => {
    enable.disabled = current?.enabled || !agree.checked || !token || !current?.configured;
  };
  section.append(
    payload,
    choice,
    node(
      'p',
      'The random deletion secret is a private receipt credential, not a user or device identifier. Keep the local app data if you may need to request deletion. Deleting ATLAS data first loses those credentials. The receiver can retain a receipt ID and hashed proof until retention expires to prevent deleted reports being replayed. Operators must separately handle exports, imported copies and backups.',
    ),
  );
  const actions = node('div', undefined, 'statistics-actions');
  for (const button of [preview, enable, stop, send, remove, refresh]) actions.append(button);
  section.insertBefore(actions, payload);
  window.atlasSettings.register(section);
  api
    .automaticStatistics({ action: 'status' })
    .then((value) => {
      if (value && typeof value.configured === 'boolean') apply(value);
    })
    .catch((error) => (state.textContent = error.message));
  document.getElementById('settingsDialog').addEventListener('close', () => {
    revision++;
    token = null;
    agree.checked = false;
    enable.disabled = true;
    payload.hidden = true;
    payload.textContent = '';
    void api.automaticStatistics({ action: 'discard' }).catch(() => {});
  });
})();
