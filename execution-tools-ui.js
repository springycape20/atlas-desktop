(() => {
  const api = window.atlas,
    power = window.atlasPower;
  if (!power || !api.taskBudgets) return;
  const field = (body, node, label, value = '', multiline = false) => {
    const wrap = node('label', label),
      input = node(multiline ? 'textarea' : 'input');
    input.value = value ?? '';
    input.setAttribute('aria-label', label);
    if (multiline) input.rows = 7;
    wrap.append(input);
    body.append(wrap);
    return input;
  };
  const select = (body, node, label, rows, text = (row) => row.name) => {
    const wrap = node('label', label),
      input = node('select');
    input.setAttribute('aria-label', label);
    for (const row of rows) input.append(new Option(text(row), row.id));
    wrap.append(input);
    body.append(wrap);
    return input;
  };
  const register = (name, render) => {
    power.register(name, render);
    window.atlasUi.register('tasks', name);
  };
  register('Task budgets', async ({ body, node, button, status, current }) => {
    const { cwd } = power.request(),
      limits = await api.taskBudgets({ cwd });
    if (!current()) return;
    body.append(
      node('h2', 'Set limits before starting a task'),
      node(
        'p',
        'Applies to new Assistant and Colab tasks in this project. Resumed tasks retain their original limits and counters. Duration, ATLAS provider calls, repair passes and outgoing text estimates can pause a task. Provider-internal tools, retries and hidden context are outside these measurements; this is not a spending cap.',
      ),
    );
    const enabled = node('input');
    enabled.type = 'checkbox';
    enabled.checked = limits.enabled;
    const enabledLabel = node('label', ' Enable project task budgets');
    enabledLabel.prepend(enabled);
    body.append(enabledLabel);
    const fields = {};
    for (const [key, label] of [
      ['seconds', 'Duration limit (seconds)'],
      ['providerCalls', 'ATLAS provider-call limit'],
      ['repairAttempts', 'Repair-attempt limit'],
      ['estimatedTokens', 'Outgoing text estimate limit (tokens)'],
    ]) {
      fields[key] = field(body, node, label, limits[key]);
      fields[key].type = 'number';
      fields[key].min = key === 'repairAttempts' ? '0' : '1';
    }
    body.append(
      node(
        'p',
        'Leave a limit blank for no limit. Zero repair attempts prevents repair passes. Text estimates use four characters per token and count ATLAS-supplied prompts before provider context reuse.',
      ),
    );
    const confirm = node('input');
    confirm.type = 'checkbox';
    confirm.checked = limits.confirmEscalation !== false;
    const confirmLabel = node('label', ' Ask before a stronger-model repair');
    confirmLabel.prepend(confirm);
    body.append(confirmLabel);
    button('Save task budgets', async () => {
      await api.taskBudgets({
        action: 'save',
        cwd,
        limits: {
          enabled: enabled.checked,
          confirmEscalation: confirm.checked,
          ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])),
        },
      });
      status.textContent = 'Limits saved for new tasks. No task started.';
    });
    const results = node('section');
    body.append(results);
    const refresh = async () => {
      const jobs = await api.jobs();
      if (!current()) return;
      results.replaceChildren(node('h3', 'Recorded task budgets'));
      for (const job of jobs
        .filter((job) => job.budget?.limits)
        .slice(-30)
        .reverse()) {
        const b = job.budget,
          box = node('details');
        box.append(
          node('summary', job.prompt + ' · ' + job.status),
          node(
            'p',
            (b.limits.enabled ? 'Limits enabled' : 'No hard limits') +
              ' · ' +
              b.calls +
              ' ATLAS calls · ' +
              b.repairs +
              ' repair passes · ~' +
              b.estimatedTokens +
              ' outgoing text tokens',
          ),
          node(
            'p',
            'Reported input: ' +
              (b.reportedInput ?? 'unknown') +
              ' · output: ' +
              (b.reportedOutput ?? 'unknown') +
              (b.usageComplete ? '' : ' · partial usage'),
          ),
        );
        if (b.stopReason) box.append(node('p', b.stopReason));
        results.append(box);
      }
      if (results.children.length === 1) results.append(node('p', 'No task budget records yet.'));
    };
    button('Refresh recorded budgets', refresh);
    await refresh();
  });
  register('Trial promotion', async ({ body, node, button, status, current }) => {
    body.append(
      node('h2', 'Promote reviewed trial files'),
      node(
        'p',
        'Compare a trial against its checkpoint and the original project. Select safe text changes, review the patch, then approve the exact files. Conflicts and unsupported files stay untouched. Undo protects later edits.',
      ),
    );
    const state = await api.workSession({ action: 'list' });
    if (!current()) return;
    const trial = select(body, node, 'Trial to promote', state.branches || []),
      result = node('section');
    body.append(result);
    button('Preview promotion', async () => {
      const value = await api.workSession({ action: 'promotion-preview', id: trial.value });
      if (!current()) return;
      result.replaceChildren(node('h3', 'Original: ' + value.source));
      const choices = [];
      for (const row of value.files) {
        const box = node('details'),
          label = node(
            'label',
            row.path + (row.conflict ? ' · conflict' : row.alreadyApplied ? ' · already applied' : ''),
          ),
          check = node('input');
        check.type = 'checkbox';
        check.disabled = row.conflict || row.unsupported || row.alreadyApplied;
        check.checked = false;
        label.prepend(check);
        box.append(
          node('summary', 'Review ' + row.path),
          label,
          node('pre', row.patch || row.reason || 'No text change'),
        );
        result.append(box);
        choices.push({ check, path: row.path });
      }
      if (!value.files.length) result.append(node('p', 'No trial changes to promote.'));
      else
        button(
          'Apply selected promotion…',
          async () => {
            const applied = await api.workSession({
              action: 'promotion-apply',
              id: value.id,
              paths: choices.filter((row) => row.check.checked).map((row) => row.path),
            });
            status.textContent = applied.cancelled
              ? 'Promotion cancelled.'
              : (applied.applied?.length || 0) +
                ' files applied.' +
                (applied.error ? ' Stopped: ' + applied.error : '') +
                (applied.undoId ? ' Undo record saved.' : '');
            await refreshUndo();
          },
          result,
        );
    });
    const undoList = node('section');
    body.append(undoList);
    const refreshUndo = async () => {
      const rows = await api.workSession({ action: 'promotion-list' });
      if (!current()) return;
      undoList.replaceChildren(node('h3', 'Promotion undo records'));
      for (const row of rows) {
        const box = node('details');
        box.append(
          node('summary', new Date(row.at).toLocaleString() + ' · ' + row.files + ' files'),
          node('p', row.source),
        );
        button(
          'Undo promotion…',
          async () => {
            const value = await api.workSession({ action: 'promotion-undo', id: row.id });
            status.textContent = value.cancelled ? 'Undo cancelled.' : value.error || 'Promotion undone.';
            await refreshUndo();
          },
          box,
        );
        button(
          'Forget undo record (preserve project)',
          async () => {
            await api.workSession({ action: 'promotion-forget', id: row.id });
            await refreshUndo();
          },
          box,
        );
        undoList.append(box);
      }
      if (!rows.length) undoList.append(node('p', 'No promotion undo records.'));
    };
    await refreshUndo();
  });
  register('Workflow benchmarks', async ({ body, node, button, status, current }) => {
    body.append(
      node('h2', 'Compare fixed tasks in fresh trial copies'),
      node(
        'p',
        'Save a fixed case set and configurations, then explicitly approve a batch. Every run starts from the same checkpoint. No results are merged automatically. Provider accounts may incur usage; project checks can execute code. Inspect actual check evidence as well as the measurements.',
      ),
    );
    const [trials, state, preferences] = await Promise.all([
      api.workSession({ action: 'list' }),
      api.workflowBenchmarks({ action: 'status' }),
      api.getSettings(),
    ]);
    if (!current()) return;
    const create = node('details');
    create.append(node('summary', 'Create a benchmark suite'));
    body.append(create);
    const name = field(create, node, 'Suite name'),
      checkpoint = select(create, node, 'Benchmark checkpoint', trials.snapshots || []),
      builder = window.atlasBenchmarkBuilder({
        body: create,
        node,
        button,
        settings: preferences,
        catalog: window.atlasDiscoveredModels || {},
      });
    create.append(
      node(
        'p',
        'Providers: codex, claude or colab. Enter explicit model IDs available to your account before saving. Colab requires codexModel and claudeModel and accepts mode. Default run limits: 600 seconds, 8 ATLAS calls, 2 repair passes and ~64,000 outgoing text tokens. Specify seconds, providerCalls, repairAttempts or estimatedTokens to change them.',
      ),
    );
    button(
      'Save benchmark suite',
      async () => {
        await api.workflowBenchmarks({
          action: 'save',
          name: name.value,
          checkpointId: checkpoint.value,
          ...builder.read(),
        });
        await power.show('Workflow benchmarks');
      },
      create,
    );
    const suite = select(
        body,
        node,
        'Benchmark suite',
        (state.suites || []).map((row) => ({ ...row, name: row.name + (row.archived ? ' · archived' : '') })),
      ),
      repeat = field(body, node, 'Repeats per case/configuration', '1');
    repeat.type = 'number';
    repeat.min = '1';
    repeat.max = '5';
    const details = node('details');
    details.append(node('summary', 'Review saved suite'));
    const definition = node('pre');
    details.append(definition);
    body.append(details);
    const showDefinition = () =>
      (definition.textContent = JSON.stringify(
        (state.suites || []).find((row) => row.id === suite.value) || {},
        null,
        2,
      ));
    suite.onchange = showDefinition;
    showDefinition();
    const actions = node('div');
    actions.className = 'power-actions';
    body.append(actions);
    button(
      'Run reviewed benchmark batch…',
      async () => {
        status.textContent = 'Benchmark running. You can inspect Tasks or cancel the batch.';
        try {
          await api.workflowBenchmarks({ action: 'run', id: suite.value, repeat: Number(repeat.value) });
        } finally {
          if (current()) await refresh();
        }
      },
      actions,
    );
    button('Cancel benchmark batch', () => api.workflowBenchmarks({ action: 'cancel' }), actions);
    button(
      'Archive suite (preserve results)',
      async () => {
        await api.workflowBenchmarks({ action: 'remove-suite', id: suite.value });
        await power.show('Workflow benchmarks');
      },
      actions,
    );
    button('Export benchmark results…', () => api.workflowBenchmarks({ action: 'export', id: suite.value }));
    const results = node('section');
    body.append(results);
    async function refresh() {
      const latest = await api.workflowBenchmarks({ action: 'status' }),
        rows = await api.workflowBenchmarks({ action: 'summary', id: suite.value });
      if (!current()) return;
      results.replaceChildren(node('h3', 'Results'));
      if (latest.active)
        results.append(node('p', latest.active.completed + ' of ' + latest.active.total + ' runs complete.'));
      for (const row of rows) {
        const box = node('article');
        box.append(
          node('h3', row.caseName + ' · ' + row.configuration),
          node(
            'p',
            row.checksPassed +
              ' / ' +
              row.runs +
              ' runs passed executed checks · median ' +
              (row.medianMs === null ? 'unknown' : (row.medianMs / 1000).toFixed(2) + ' s'),
          ),
          node(
            'p',
            'Reported tokens: ' +
              (row.inputTokens ?? 'unknown') +
              ' input / ' +
              (row.outputTokens ?? 'unknown') +
              ' output · ' +
              row.knownUsageRuns +
              ' / ' +
              row.runs +
              ' runs reported both.',
          ),
        );
        results.append(box);
      }
      for (const row of (latest.runs || [])
        .filter((row) => row.suiteId === suite.value)
        .slice()
        .reverse()) {
        const box = node('details');
        box.append(
          node('summary', row.caseName + ' · ' + row.config.name + ' · ' + row.status),
          node('p', row.cwd || 'No trial folder created'),
          node(
            'pre',
            JSON.stringify(
              {
                jobId: row.jobId,
                verification: row.verification,
                error: row.error,
                actualProvider: row.actualProvider,
                configurationMatched: row.configurationMatched,
                environment: row.environment,
              },
              null,
              2,
            ),
          ),
        );
        if (row.jobId) button('Open benchmark task', () => api.taskOpen(row.jobId), box);
        button(
          'Delete result (preserve trial files)',
          async () => {
            await api.workflowBenchmarks({ action: 'remove-run', id: row.id });
            await refresh();
          },
          box,
        );
        results.append(box);
      }
      if (!rows.length)
        results.append(
          node(
            'p',
            'No finished benchmark results for this suite. Unknown usage stays unknown; check success does not establish that all acceptance criteria are met.',
          ),
        );
    }
    button('Refresh benchmark results', refresh);
    await refresh();
    const tick = async () => {
      if (!current()) return;
      try {
        await refresh();
      } catch (error) {
        if (current()) status.textContent = error.message;
      }
      if (current()) setTimeout(tick, 1500);
    };
    setTimeout(tick, 1500);
  });
})();
