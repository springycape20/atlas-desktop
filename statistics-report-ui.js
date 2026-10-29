(() => {
  const { node, actionButton } = window.atlasUi,
    api = window.atlas;
  const section = node('section', undefined, 'setting-section');
  section.dataset.ephemeralSettings = 'true';
  section.append(
    node('h3', 'Optional statistics report'),
    node(
      'p',
      'Create a local report only when you choose. Nothing is uploaded or sent automatically. Normal app use does not require a report.',
    ),
  );
  section.append(
    node(
      'p',
      'Included: month, release family, a report-only receipt and rounded counts from retained finished tasks. Excluded: chats, prompts, replies, files, paths, accounts, device details and raw errors. Counts are a sample, rounded to five, and can omit deleted or older tasks.',
    ),
  );
  const months = node('select');
  months.setAttribute('aria-label', 'Reporting month (UTC)');
  section.append(months);
  const consent = node('label', undefined, 'power-toggle'),
    agree = node('input');
  agree.type = 'checkbox';
  consent.append(agree, node('span', 'I want to prepare this optional report and review its contents.'));
  section.append(consent);
  const preview = node('pre');
  preview.className = 'statistics-preview';
  preview.hidden = true;
  preview.tabIndex = 0;
  preview.setAttribute('aria-label', 'Exact statistics report contents');
  const reviewed = node('label', undefined, 'power-toggle'),
    reviewedBox = node('input');
  reviewedBox.type = 'checkbox';
  reviewed.append(reviewedBox, node('span', 'I reviewed the report. Save a file on this computer only.'));
  reviewed.hidden = true;
  let token,
    generation = 0;
  const status = node('p');
  status.setAttribute('role', 'status');
  const make = actionButton(
    'Preview optional report',
    async () => {
      const revision = ++generation;
      const result = await api.statisticsReport({ action: 'preview', period: months.value, confirmed: agree.checked });
      if (revision !== generation || !agree.checked) return;
      token = result.token;
      preview.textContent = JSON.stringify(result.report, null, 2);
      preview.hidden = false;
      reviewed.hidden = false;
      reviewedBox.checked = false;
      save.disabled = true;
      status.textContent = 'Review every field below. Saving does not share this file.';
    },
    section,
  );
  make.disabled = true;
  const save = actionButton(
    'Save reviewed report…',
    async () => {
      const result = await api.statisticsReport({ action: 'export', token });
      if (result.saved) {
        clear();
        status.textContent =
          'Saved locally. Nothing was sent. Keep the report receipt if you later request deletion from a recipient.';
      }
    },
    section,
  );
  save.disabled = true;
  const clear = () => {
    generation++;
    token = null;
    preview.hidden = true;
    preview.textContent = '';
    reviewed.hidden = true;
    reviewedBox.checked = false;
    save.disabled = true;
    void api.statisticsReport({ action: 'discard' }).catch(() => {});
  };
  agree.onchange = () => {
    make.disabled = !agree.checked;
    clear();
  };
  reviewedBox.onchange = () => {
    save.disabled = !reviewedBox.checked || !token;
  };
  months.onchange = clear;
  section.append(
    preview,
    reviewed,
    status,
    node(
      'p',
      'Sharing is a separate choice outside ATLAS. Email, GitHub or another delivery service can identify you and has its own privacy terms. Avoid public issue attachments. No anonymity guarantee is made.',
    ),
  );
  actionButton('Discard preview', clear, section);
  window.atlasSettings.register(section);
  api
    .statisticsReport({ action: 'months' })
    .then((values) => {
      for (const value of Array.isArray(values) ? values : []) months.append(new Option(value, value));
    })
    .catch((error) => {
      status.textContent = error.message;
    });
  document.getElementById('settingsDialog').addEventListener('close', () => {
    agree.checked = false;
    make.disabled = true;
    clear();
  });
})();
