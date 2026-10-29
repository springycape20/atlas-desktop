(() => {
  const api = window.atlas,
    power = window.atlasPower;
  if (!api?.advancedWorkflows || !power) return;
  power.register('Project intelligence', async ({ body, node, button, status, current }) => {
    const context = power.request();
    body.append(
      node('h2', 'Understand a change before editing'),
      node(
        'p',
        'Trace local imports, symbol references and likely related tests. Results are bounded static hints and can miss dynamic behaviour.',
      ),
    );
    const field = (label) => {
      const wrap = node('label', label),
        input = node('input');
      wrap.append(input);
      body.append(wrap);
      return input;
    };
    const file = field('Project-relative file (optional)'),
      symbol = field('Symbol name (optional)');
    const results = node('div');
    button('Analyze project', async () => {
      if (!file.value.trim() && !symbol.value.trim()) throw Error('Enter a file or symbol to inspect.');
      const value = await api.advancedWorkflows({
        ...context,
        tool: 'intelligence',
        file: file.value.trim(),
        symbol: symbol.value.trim(),
      });
      if (!current()) return;
      results.replaceChildren(node('p', value.note));
      const pathButton = (label, path, line) =>
        button(
          label,
          () => window.atlasProjectFiles.preview({ cwd: context.cwd }, path + (line ? ':' + line : '')),
          results,
        );
      results.append(node('h3', 'Definitions'));
      for (const row of value.definitions) pathButton(row.name + ' · ' + row.path + ':' + row.line, row.path, row.line);
      results.append(node('h3', 'References'));
      for (const row of value.references)
        pathButton(row.path + ':' + row.line + ' · ' + row.excerpt, row.path, row.line);
      results.append(node('h3', 'Imports'));
      for (const path of value.imports) pathButton(path, path);
      results.append(node('h3', 'Affected files'));
      for (const row of value.affected) pathButton(row.path + ' · ' + row.distance + ' import steps away', row.path);
      results.append(node('h3', 'Related tests'));
      for (const path of value.tests) pathButton(path, path);
      status.textContent =
        value.indexed +
        ' files analyzed' +
        (value.truncated ? ' · scan limited' : '') +
        '. No code or checks were executed.';
    });
    body.append(results);
  });
  power.register('Repair loops', async ({ body, node, button, status, current }) => {
    const jobs = (await api.jobs()).filter(
      (job) =>
        job.status !== 'running' &&
        (job.verification || job.result?.verification)?.results?.some((row) => row.status === 'failed'),
    );
    if (!current()) return;
    body.append(
      node('h2', 'Repair failing checks with limits'),
      node(
        'p',
        'Select recorded checks. ATLAS runs them, requests a narrow provider repair when they fail, and checks again. Native approval names the commands and limits before anything runs. Existing provider permissions still apply.',
      ),
    );
    const label = node('label', 'Task'),
      choice = node('select');
    for (const job of jobs) choice.append(new Option((job.prompt || job.id).slice(0, 100), job.id));
    label.append(choice);
    body.append(label);
    const checks = node('div'),
      selected = new Set();
    const update = () => {
      checks.replaceChildren();
      selected.clear();
      const job = jobs.find((row) => row.id === choice.value);
      for (const command of [
        ...new Set((job?.verification || job?.result?.verification)?.results?.map((row) => row.command) || []),
      ]) {
        const label = node('label', command),
          box = node('input');
        box.type = 'checkbox';
        box.checked = true;
        selected.add(command);
        box.onchange = () => (box.checked ? selected.add(command) : selected.delete(command));
        label.prepend(box);
        checks.append(label);
      }
    };
    choice.onchange = update;
    update();
    body.append(checks);
    const number = (title, value, min, max) => {
      const label = node('label', title),
        input = node('input');
      input.type = 'number';
      Object.assign(input, { value, min, max });
      label.append(input);
      body.append(label);
      return input;
    };
    const attempts = number('Maximum repair attempts', 2, 1, 3),
      seconds = number('Total time limit in seconds', 300, 30, 1800),
      results = node('div');
    const call = (action, extra = {}) => api.advancedWorkflows({ tool: 'repair', action, ...extra });
    let previous;
    const refresh = async () => {
      const rows = await call('list');
      if (!current()) return;
      const signature = JSON.stringify(rows);
      if (signature === previous) return;
      previous = signature;
      results.replaceChildren();
      for (const row of rows) {
        const section = node('section');
        section.append(
          node('h3', row.status + ' · ' + row.runs.filter((run) => run.repairJobId).length + ' repairs'),
          node('p', row.reason || ''),
        );
        for (const run of row.runs) {
          const details = node('details');
          details.append(
            node('summary', 'Check pass ' + (run.attempt + 1)),
            node(
              'pre',
              run.results
                .map((value) => value.command + ' · ' + value.status + '\n' + (value.output || value.error || ''))
                .join('\n\n'),
            ),
          );
          section.append(details);
        }
        if (row.status === 'running')
          button(
            'Stop this loop',
            async () => {
              await call('stop', { id: row.id });
              await refresh();
            },
            section,
          );
        results.append(section);
      }
      status.textContent = jobs.length
        ? 'Repair attempts create ordinary saved Assistant tasks and preserve their evidence.'
        : 'No retained tasks have recorded failing checks yet.';
    };
    button('Start bounded repair…', async () => {
      await call('start', {
        jobId: choice.value,
        commands: [...selected],
        attempts: Number(attempts.value),
        seconds: Number(seconds.value),
      });
      await refresh();
    });
    button('Refresh progress', refresh);
    body.append(results);
    await refresh();
    const poll = async () => {
      if (!current()) return;
      try {
        await refresh();
      } catch (error) {
        status.textContent = error.message;
      }
      if (current()) setTimeout(poll, 1000);
    };
    setTimeout(poll, 1000);
  });
  power.register('Saved task evidence', async ({ body, node, button, status, current }) => {
    const rows = await api.workflowTools({ action: 'archive-list' });
    if (!current()) return;
    body.append(
      node('h2', 'Completion-time task evidence'),
      node(
        'p',
        'Local archives retain the captured diff and executed checks after project files change or an isolated workspace is removed. Integrity hashes detect accidental file changes; they are not digital signatures.',
      ),
    );
    if (!rows.length)
      body.append(node('p', 'New finished tasks will appear here. Older tasks are not silently backfilled.'));
    for (const row of rows) {
      const details = node('details');
      details.append(
        node('summary', row.title + ' · ' + row.status + ' · ' + new Date(row.capturedAt).toLocaleString()),
      );
      button(
        'Read evidence',
        async () => {
          const value = await api.workflowTools({ action: 'archive-read', id: row.id });
          details.querySelector('pre')?.remove();
          details.append(node('pre', JSON.stringify(value, null, 2)));
        },
        details,
      );
      button(
        'Delete local evidence',
        async () => {
          if (!confirm('Delete this task evidence archive? Project files and chats are preserved.')) return;
          await api.workflowTools({ action: 'archive-delete', id: row.id });
          await power.show('Saved task evidence');
        },
        details,
      );
      body.append(details);
    }
    status.textContent =
      'Nothing is uploaded. Archives can contain project source and check output; review before sharing.';
  });
  for (const name of ['Project intelligence', 'Terminal', 'Repair loops', 'Saved task evidence'])
    window.atlasUi.register('tasks', name);
})();
