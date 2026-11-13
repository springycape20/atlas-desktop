(() => {
  const api = window.atlas,
    power = window.atlasPower;
  const { node, button } = power;
  let referenceScope = 'assistant',
    referenceKind = 'file',
    referenceQuery = '';
  const inputs = { assistant: document.getElementById('prompt'), colab: document.getElementById('colabTask') };
  const strips = {};
  const refresh = () => {
    for (const scope of ['assistant', 'colab']) {
      const selected = power.selection(scope),
        savedInfo = power.previewInfo(scope),
        info = savedInfo?.prompt === inputs[scope].value ? savedInfo : undefined,
        strip = strips[scope];
      if (!strip) continue;
      strip.replaceChildren();
      const add = (label) => button(label, () => power.show('Context'), strip);
      add(selected.project ? 'Project excerpts · ' + (info?.projectCount ?? 'preview') : 'Project excerpts off');
      if (selected.vault)
        add(
          'Notes · ' +
            ((selected.vaultPaths || []).length || info?.vaultCount || 'relevant') +
            ' · ' +
            (selected.vaultPreview ? 'preview reviewed' : 'preview required'),
        );
      add(
        (selected.attachments ? window.atlasWorkspace.context(scope).attachments.length : 0) +
          ' attachments' +
          (selected.attachments ? '' : ' · excluded'),
      );
      const exclusions = [
        !selected.instructions && 'instructions',
        !selected.history && 'history',
        !selected.memories && 'memories',
      ].filter(Boolean);
      if (exclusions.length) add('Excluded: ' + exclusions.join(', '));
      if (info?.estimatedTokens) add('~' + info.estimatedTokens.toLocaleString() + ' text tokens');
      button('Add reference…', () => open(scope), strip);
      button('Workbench', () => window.atlasDock?.open(), strip);
    }
  };
  for (const scope of ['assistant', 'colab']) {
    const strip = node('div');
    strip.className = 'composer-context-strip';
    strip.setAttribute('aria-label', 'Context included with ' + scope + ' message');
    (scope === 'assistant' ? inputs[scope].closest('.cmd') : inputs[scope]).before(strip);
    strips[scope] = strip;
    inputs[scope].addEventListener('input', () => {
      const selected = power.selection(scope),
        info = power.previewInfo(scope);
      if (selected.vaultPreview && info?.prompt !== inputs[scope].value) {
        delete selected.vaultPreview;
        power.setSelection(scope, selected);
      }
      const match = inputs[scope].value.slice(0, inputs[scope].selectionStart).match(/(?:^|\s)#(file|note|symbol)\s*$/);
      if (match) void open(scope, match[1]);
      refresh();
    });
  }
  function open(scope, kind = 'file', query = '') {
    referenceScope = scope;
    referenceKind = kind;
    referenceQuery = query;
    return power.show('Context references');
  }
  power.register('Context references', async ({ body, node, button, current, status }) => {
    const scope = referenceScope,
      context = power.request(scope),
      chat = scope === 'colab' ? window.atlasColab.current().id : context.conversationId;
    body.append(
      node('h2', 'Reference files, notes or symbols'),
      node(
        'p',
        'Files become selected attachments. Notes use the read-only vault and require a fresh Context preview before sending.',
      ),
    );
    const kind = node('select');
    kind.setAttribute('aria-label', 'Reference type');
    for (const [id, label] of [
      ['file', 'Project file'],
      ['note', 'Markdown note'],
      ['symbol', 'Code symbol'],
    ])
      kind.append(new Option(label, id));
    kind.value = referenceKind;
    const query = node('input');
    query.setAttribute('aria-label', 'Find reference');
    query.placeholder = 'Search by name or symbol…';
    query.value = referenceQuery;
    const results = node('section');
    body.append(kind, query, results);
    let revision = 0;
    const unchanged = () =>
      current() &&
      power.request(scope).cwd === context.cwd &&
      (scope === 'colab' ? window.atlasColab.current().id : power.request(scope).conversationId) === chat;
    const search = async () => {
      const version = ++revision;
      results.replaceChildren();
      const term = query.value.trim();
      if (term.length < 2) {
        status.textContent = 'Enter at least two characters.';
        return;
      }
      status.textContent = 'Searching locally…';
      const type = kind.value;
      let rows,
        limited = false;
      if (type === 'note') {
        const value = await api.vaultReferences({ query: term });
        rows = value.results || [];
        limited = value.truncated;
      } else if (type === 'symbol') {
        const value = await api.projectKnowledge({ ...context, query: term });
        rows = value.results || [];
        limited = value.truncated;
      } else {
        const value = await api.projectFile({ ...context, action: 'search', query: term });
        rows = value.entries || [];
        limited = value.limited;
      }
      if (!unchanged() || version !== revision) return;
      for (const row of rows.slice(0, 50)) {
        const box = node('section');
        box.append(node('h3', row.path + (row.line ? ':' + row.line : '')));
        if (row.excerpt) box.append(node('pre', row.excerpt));
        button(
          'Add reference',
          async () => {
            if (!unchanged()) throw Error('Chat or project changed. Open the picker again.');
            if (type === 'note') {
              const selection = power.selection(scope),
                paths = selection.vaultPaths || [];
              if (!paths.includes(row.path) && paths.length >= 8) throw Error('Select at most eight notes.');
              selection.vault = true;
              selection.vaultPaths = [...new Set([...paths, row.path])];
              delete selection.vaultPreview;
              power.setSelection(scope, selection);
            } else {
              const files = await api.projectFile({ ...context, action: 'attach', path: row.path });
              if (!unchanged()) throw Error('Chat changed; the reference was not added.');
              await window.atlasWorkspace.addAttachments(scope, async () => files);
              const selection = power.selection(scope);
              selection.attachments = true;
              delete selection.vaultPreview;
              power.setSelection(scope, selection);
            }
            const input = inputs[scope];
            input.value =
              input.value.replace(/#(?:file|note|symbol)\s*$/, '') +
              ' ' +
              JSON.stringify(
                (type === 'note' ? 'Vault note: ' : 'Project reference: ') +
                  row.path +
                  (row.line ? ':' + row.line : ''),
              );
            input.dispatchEvent(new Event('input', { bubbles: true }));
            status.textContent = 'Reference added to the unsent draft.';
            refresh();
          },
          box,
        );
        results.append(box);
      }
      status.textContent =
        rows.length +
        ' matches' +
        (limited ? ' · search limited' : '') +
        '. Choose a reference; nothing has been sent.';
    };
    button('Search references', search);
    query.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void search().catch((e) => (status.textContent = e.message));
      }
    };
    kind.onchange = () => {
      revision++;
      results.replaceChildren();
    };
    if (query.value) await search();
  });
  window.atlasReferences = { open };
  window.addEventListener('atlas-context-change', refresh);
  window.addEventListener('atlas-colab-chat-change', refresh);
  for (const el of document.querySelectorAll('.attachment-chips'))
    new MutationObserver(refresh).observe(el, { childList: true });
  refresh();
})();
