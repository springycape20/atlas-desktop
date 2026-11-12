(() => {
  const power = window.atlasPower;
  if (!power || !window.atlas.nodeDebugger) return;
  power.register('Debugger', async ({ body, node, button, status, current }) => {
    const request = power.request(),
      cwd = request.scope === 'colab' ? window.atlasColab.current().cwd : request.cwd;
    const call = (action, extra = {}) => window.atlas.nodeDebugger({ cwd, action, ...extra });
    body.append(
      node('h2', 'Node.js debugger'),
      node(
        'p',
        'Launch a JavaScript entry point using installed Node.js after approval. Add breakpoints, inspect paused scopes and step through code. Stop the session before running model tasks. No expressions are evaluated and getters are not invoked.',
      ),
    );
    const field = (label, value = '') => {
      const wrap = node('label', label),
        input = node('input');
      input.value = value;
      input.setAttribute('aria-label', label);
      wrap.append(input);
      body.append(wrap);
      return input;
    };
    const entry = field('Entry file', 'index.js'),
      args = field('Arguments (JSON array)', '[]');
    const runtime = field('Node.js executable (optional absolute path)');
    runtime.placeholder = 'Use installed Node.js from PATH';
    const controls = node('div'),
      results = node('section'),
      variables = node('pre'),
      logs = node('pre');
    controls.className = 'power-actions';
    body.append(controls);
    const startButton = button(
      'Start debugging…',
      async () => {
        const value = await call('start', {
          path: entry.value,
          args: JSON.parse(args.value),
          executable: runtime.value.trim(),
        });
        if (value.cancelled) status.textContent = 'Debugging cancelled.';
        else await refresh();
      },
      controls,
    );
    const executionButtons = new Map();
    for (const [label, action] of [
      ['Continue', 'resume'],
      ['Pause', 'pause'],
      ['Step over', 'step-over'],
      ['Step into', 'step-into'],
      ['Step out', 'step-out'],
      ['Stop', 'stop'],
    ])
      executionButtons.set(
        action,
        button(
          label,
          async () => {
            await call(action);
            await refresh();
          },
          controls,
        ),
      );
    const file = field('Breakpoint file', 'index.js'),
      line = field('Breakpoint line', '1');
    line.type = 'number';
    line.min = '1';
    const addBreakpoint = button('Add breakpoint', async () => {
      await call('breakpoint-add', { path: file.value, line: Number(line.value) });
      await refresh();
    });
    body.append(results, variables, logs);
    let signature = '';
    async function refresh() {
      const value = await call('status');
      if (!current()) return;
      startButton.disabled = Boolean(value.active);
      addBreakpoint.disabled = !value.connected;
      for (const [action, item] of executionButtons)
        item.disabled =
          action === 'stop'
            ? !value.active
            : action === 'pause'
              ? !value.connected || value.paused
              : !value.connected || !value.paused;
      status.textContent =
        value.error || (value.active ? (value.paused ? 'Paused · ' + value.reason : 'Running') : 'Debugger stopped');
      logs.textContent = value.output || 'No program output.';
      const next = JSON.stringify([value.frames, value.breakpoints]);
      if (next === signature) return;
      signature = next;
      results.replaceChildren();
      variables.textContent = '';
      results.append(node('h3', 'Breakpoints'));
      for (const row of value.breakpoints || [])
        button(
          'Remove ' + row.path + ':' + row.line,
          async () => {
            await call('breakpoint-remove', { id: row.id });
            await refresh();
          },
          results,
        );
      results.append(node('h3', 'Call stack and scopes'));
      for (const frame of value.frames || []) {
        const box = node('details');
        box.append(node('summary', frame.name + ' · ' + (frame.path || 'External source') + ':' + frame.line));
        if (frame.path)
          button('Open source', () => window.atlasProjectEditor.open({ cwd }, frame.path + ':' + frame.line), box);
        for (const scope of frame.scopes)
          button(
            'Inspect ' + scope.type,
            async () => {
              const value = await call('variables', { frame: frame.index, scope: scope.index });
              variables.textContent =
                value.variables.map((row) => row.name + ' = ' + row.value).join('\n') || 'No variables in this scope.';
            },
            box,
          );
        results.append(box);
      }
    }
    await refresh();
    const poll = () => {
      if (current())
        void refresh()
          .catch((error) => {
            status.textContent = error.message;
          })
          .finally(() => {
            if (current()) setTimeout(poll, 750);
          });
    };
    setTimeout(poll, 750);
    window.atlasUi.compactActions(controls, 2, 'Execution');
  });
  window.atlasUi.register('tasks', 'Debugger');
})();
