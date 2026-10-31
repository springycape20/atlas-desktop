(() => {
  const api = window.atlas,
    power = window.atlasPower;
  if (!power) return;
  const field = (body, node, label, value, multiline = false) => {
    const wrap = node('label', label),
      input = node(multiline ? 'textarea' : 'input');
    input.value = value;
    input.setAttribute('aria-label', label);
    if (multiline) input.rows = 6;
    wrap.append(input);
    body.append(wrap);
    return input;
  };
  power.register('Power tools', async ({ body, node, button }) => {
    body.append(
      node('h2', 'Choose the next step for this project'),
      node('p', 'Work stays in the current project. Each tool shows its own execution and model-usage controls.'),
    );
    const tools = [
      [
        'Language intelligence',
        'Language intelligence',
        'Definitions, references and diagnostics from an installed language server.',
      ],
      [
        'Verification and repair',
        'Repair loops',
        'Run recorded checks and bounded repair attempts; review model usage before starting.',
      ],
      [
        'Isolated tasks',
        'Parallel',
        'Queue independent Colab tasks in isolated Git worktrees, then review integration.',
      ],
      [
        'Project knowledge',
        'Project memory',
        'Maintain editable project decisions, conventions and commands. Use Context freshness to detect changed source.',
      ],
      ['Context selection', 'Context', 'Inspect ranked code excerpts and the estimated request-text budget.'],
      [
        'Browser checks',
        'Live preview',
        'Run reusable interaction and assertion steps against the local preview.',
        'Repeatable browser checks',
      ],
      ['Resume a task', 'Recovery', 'Inspect stopped tasks and verified stage checkpoints before resuming.'],
      ['Model routing', 'Model routing', 'Configure fast/strong models and opt-in failure-driven escalation.'],
      [
        'Visual change review',
        'Live preview',
        'Compare baseline/current screenshots at the same page and viewport.',
        'Visual comparison',
      ],
      ['Task recipes', 'Workflows', 'Prepare reusable task recipes with steps, checks and stopping conditions.'],
      ['Local models', 'Local models', 'Use an existing local server for text chat without provider-account requests.'],
      [
        'Project profiling',
        'Live preview',
        'Measure renderer memory/CPU, DOM size and navigation timings.',
        'Project preview profile',
      ],
    ];
    for (const [name, view, description, heading] of tools) {
      const row = node('section');
      row.className = 'upgrade-tool-row';
      button(
        name,
        async () => {
          await power.show(view);
          if (heading)
            [...document.querySelectorAll('.power-body h3')]
              .find((item) => item.textContent === heading)
              ?.scrollIntoView({ block: 'start' });
        },
        row,
      );
      row.append(node('p', description));
      body.append(row);
    }
  });
  power.register('Language intelligence', async ({ body, node, button, status, current }) => {
    const input = power.request();
    body.append(
      node('h2', 'Navigate code with a language server'),
      node(
        'p',
        'Configure an installed stdio language server for this project. Starting it requires approval. No server is downloaded. Results are limited to allowed project files; the server itself runs with your account permissions.',
      ),
    );
    const saved = await api.languageServer({ action: 'settings', cwd: input.cwd });
    if (!current()) return;
    const command = field(body, node, 'Server executable (absolute path)', saved.config.command),
      args = field(body, node, 'Arguments (JSON array)', JSON.stringify(saved.config.args)),
      languageId = field(body, node, 'Language ID', saved.config.languageId || 'typescript');
    const actions = node('div');
    actions.className = 'power-actions';
    body.append(actions);
    button(
      'Save server configuration',
      async () => {
        await api.languageServer({
          action: 'save',
          cwd: input.cwd,
          config: { command: command.value, args: JSON.parse(args.value), languageId: languageId.value },
        });
        status.textContent = 'Configuration saved. No server was started.';
      },
      actions,
    );
    button(
      'Stop language server',
      async () => {
        await api.languageServer({ action: 'stop' });
        status.textContent = 'Language server stopped.';
      },
      actions,
    );
    const file = field(body, node, 'Project file', ''),
      line = field(body, node, 'Line (starting at 1)', '1'),
      column = field(body, node, 'Column (starting at 1)', '1');
    line.type = column.type = 'number';
    line.min = column.min = '1';
    const queries = node('div');
    queries.className = 'power-actions';
    body.append(queries);
    const result = node('section');
    body.append(result);
    for (const [action, label] of [
      ['definition', 'Go to definition'],
      ['references', 'Find references'],
      ['diagnostics', 'Refresh diagnostics'],
    ])
      button(
        label,
        async () => {
          status.textContent = 'Querying language server…';
          const value = await api.languageServer({
            action,
            cwd: input.cwd,
            path: file.value,
            line: Number(line.value),
            column: Number(column.value),
          });
          if (!current()) return;
          result.replaceChildren(node('h3', label), node('p', value.note));
          if (!value.rows.length) result.append(node('p', 'No results received.'));
          for (const row of value.rows) {
            const location = (row.path || file.value) + ':' + row.line;
            const box = node('section');
            if (row.message) box.append(node('p', 'Line ' + row.line + ' · ' + row.message));
            button('Open ' + location, () => window.atlasProjectFiles.preview({ cwd: input.cwd }, location), box);
            result.append(box);
          }
          status.textContent = value.rows.length + ' results. Server stops after two idle minutes.';
        },
        queries,
      );
  });
  const style = document.createElement('style');
  style.textContent =
    '.upgrade-tool-row{display:grid;grid-template-columns:minmax(140px,200px) 1fr;gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid #444}.upgrade-tool-row p{margin:0}.preview-evidence-images{display:grid;grid-template-columns:1fr 1fr;gap:12px}.preview-evidence-images img{width:100%;height:auto;display:block}.preview-evidence-images figure{margin:0;min-width:0}.preview-evidence-images figcaption{margin-bottom:8px}@media(max-width:640px){.upgrade-tool-row,.preview-evidence-images{grid-template-columns:1fr}.upgrade-tool-row{gap:8px}.upgrade-tool-row button{justify-self:start}}';
  document.head.append(style);
  style.textContent +=
    '.preview-profile table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;margin:12px 0}.preview-profile th,.preview-profile td{font-weight:400;padding:8px 4px;border-bottom:1px solid #444;text-align:right}.preview-profile th:first-child{text-align:left}.preview-profile tr:first-child th{color:#aaa}';
  window.atlasUi.register('tasks', 'Power tools');
  window.atlasUi.register('tasks', 'Language intelligence');
})();
