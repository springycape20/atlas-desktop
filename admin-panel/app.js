(() => {
  const api = window.atlasInsights,
    schema = window.atlasStatistics,
    $ = (id) => document.getElementById(id);
  let reports = [];
  const text = (tag, value) => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };
  function bars(id, values) {
    const host = $(id);
    host.replaceChildren();
    const max = Math.max(1, ...Object.values(values));
    for (const [key, count] of Object.entries(values)) {
      const row = text('div', '');
      row.className = 'bar-row';
      row.dataset.kind = key;
      const meter = document.createElement('meter');
      meter.min = 0;
      meter.max = max;
      meter.value = count;
      meter.setAttribute('aria-label', schema.labels[key] || key);
      row.append(text('span', schema.labels[key] || key), meter, text('strong', count.toLocaleString()));
      host.append(row);
    }
    if (!host.children.length) {
      const empty = text('p', 'No reports for this selection.');
      empty.className = 'empty';
      host.append(empty);
    }
  }
  function render() {
    const selected = reports.filter((row) => !$('month').value || row.period === $('month').value),
      total = schema.aggregate(selected);
    for (const [id, value] of Object.entries({
      reports: total.reports,
      tasks: total.tasks,
      completed: total.outcomes.completed,
      versions: Object.keys(total.versions).length,
    }))
      $(id).textContent = value.toLocaleString();
    $('finding').textContent = total.reports
      ? total.reports.toLocaleString() +
        ' voluntarily shared reports in this selection. Activity is an approximate sample.'
      : 'Import voluntarily shared reports to see reported activity.';
    bars('outcomes', total.reports ? total.outcomes : {});
    bars('features', total.reports ? total.features : {});
    bars('months', total.months);
    bars('families', total.versions);
    $('receipts').replaceChildren();
    const query = $('receiptSearch').value.trim().toLowerCase();
    for (const row of selected.filter((row) => row.reportId.includes(query)).slice(0, 100)) {
      const tr = document.createElement('tr');
      for (const value of [
        row.reportId,
        row.period,
        row.versionFamily,
        Object.values(row.outcomes)
          .reduce((a, b) => a + b, 0)
          .toLocaleString(),
      ])
        tr.append(text('td', value));
      tr.children[3].className = 'number';
      const actions = document.createElement('td'),
        remove = text('button', 'Delete…');
      remove.setAttribute('aria-label', 'Delete receipt ' + row.reportId);
      remove.onclick = () =>
        perform(async () => {
          await api.action({ action: 'remove', id: row.reportId });
          await refresh();
        });
      actions.append(remove);
      tr.append(actions);
      $('receipts').append(tr);
    }
    if (!$('receipts').children.length) {
      const tr = document.createElement('tr'),
        td = text('td', 'No matching report receipts.');
      td.colSpan = 5;
      tr.append(td);
      $('receipts').append(tr);
    }
    $('export').disabled = reports.length === 0;
    $('clear').disabled = reports.length === 0;
  }
  async function refresh() {
    reports = (await api.action({ action: 'list' })).map(schema.validate);
    const selected = $('month').value;
    $('month').replaceChildren(new Option('All retained months', ''));
    for (const month of [...new Set(reports.map((row) => row.period))].sort().reverse())
      $('month').append(new Option(month, month));
    if ([...$('month').options].some((row) => row.value === selected)) $('month').value = selected;
    render();
  }
  async function perform(action) {
    try {
      await action();
    } catch (error) {
      $('status').textContent = error.message;
    }
  }
  $('import').onclick = () =>
    perform(async () => {
      const result = await api.action({ action: 'import' });
      if (result.cancelled) return;
      await refresh();
      $('status').textContent =
        `${result.accepted} imported · ${result.duplicates} duplicates · ${result.rejected} rejected · ${result.expired} outside retention · ${result.capacity} over capacity. Source files were not copied into the store.`;
    });
  $('refresh').onclick = () => perform(refresh);
  $('clear').onclick = () =>
    perform(async () => {
      const result = await api.action({ action: 'clear' });
      await refresh();
      if (!result.cancelled)
        $('status').textContent =
          'Imported reports deleted locally. Original files, sharing messages, exports and backups are separate.';
    });
  $('export').onclick = () =>
    perform(async () => {
      const result = await api.action({ action: 'export' });
      if (result.saved)
        $('status').textContent =
          'Aggregate summary saved locally. No receipts, identities or raw reports are included.';
    });
  $('month').onchange = render;
  $('receiptSearch').oninput = render;
  perform(refresh);
})();
