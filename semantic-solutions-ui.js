(() => {
  const api = window.atlas,
    power = window.atlasPower;
  const indexes = new Map();
  power.register('Semantic solution search', async ({ body, node, button, status, current }) => {
    const context = power.request(),
      cwd = context.cwd;
    body.append(
      node('h2', 'Find past solutions by meaning'),
      node(
        'p',
        'Optional local embeddings for completed task text only. Review the excerpts before sending them to your chosen loopback embedding server. The server may have its own cloud routing or logs. ATLAS downloads no model and makes no cloud fallback.',
      ),
    );
    const field = (label, value) => {
      const wrap = node('label', label),
        input = node('input');
      input.value = value;
      input.setAttribute('aria-label', label);
      wrap.append(input);
      body.append(wrap);
      return input;
    };
    const base = field('Local embedding API', 'http://127.0.0.1:11434/v1'),
      model = field('Installed embedding model', '');
    const review = node('section'),
      consent = node('input'),
      label = node('label', 'I reviewed these task excerpts and approve sending them to this local server.');
    consent.type = 'checkbox';
    label.prepend(consent);
    body.append(review, label);
    let token = '',
      busy = false;
    const invalidate = () => {
      token = '';
      consent.checked = false;
    };
    base.oninput = model.oninput = invalidate;
    button('Preview tasks to index', async () => {
      const value = await api.semanticSolutions({ action: 'preview', cwd });
      if (!current()) return;
      token = value.token;
      consent.checked = false;
      review.replaceChildren(
        node('p', value.documents.length + ' tasks · ' + value.characters.toLocaleString() + ' characters'),
        node('p', value.note),
      );
      for (const doc of value.documents) {
        const d = node('details');
        d.append(node('summary', doc.title), node('pre', doc.text));
        review.append(d);
      }
      status.textContent = 'Preview is local. No embedding request has been made.';
    });
    button('Build reviewed local index', async () => {
      if (busy) throw Error('Indexing is already running.');
      if (!token || !consent.checked) throw Error('Preview and approve the task excerpts first.');
      busy = true;
      try {
        const value = await api.semanticSolutions({
          action: 'build',
          cwd,
          token,
          consent: true,
          base: base.value,
          model: model.value,
        });
        if (!current()) return;
        indexes.set(cwd, value.id);
        status.textContent =
          value.count + ' tasks indexed in memory. The index disappears when cleared or ATLAS closes.';
      } finally {
        busy = false;
        invalidate();
      }
    });
    const query = field('Describe the solution you need', ''),
      results = node('section');
    body.append(results);
    button('Search by meaning', async () => {
      const value = await api.semanticSolutions({ action: 'search', cwd, id: indexes.get(cwd), query: query.value });
      if (!current()) return;
      results.replaceChildren();
      for (const row of value.results) {
        const d = node('details');
        d.append(node('summary', row.title), node('pre', row.text));
        button(
          'Open source task',
          async () => {
            await api.taskOpen(row.id);
            power.close();
          },
          d,
        );
        results.append(d);
      }
      status.textContent =
        value.note + (value.stale ? ' ' + value.stale + ' changed or removed tasks omitted; rebuild to refresh.' : '');
    });
    button('Clear all semantic indexes', async () => {
      await api.semanticSolutions({ action: 'clear' });
      indexes.clear();
      invalidate();
      review.replaceChildren();
      results.replaceChildren();
      status.textContent = 'In-memory indexes and review receipts cleared.';
    });
    button('Use ordinary local search', () => window.atlasUi.open('library', 'Search all work'));
  });
  window.atlasUi.register('library', 'Semantic solution search');
})();
