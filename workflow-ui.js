(() => {
  const power = window.atlasPower,
    api = window.atlas;
  if (!power) return;
  power.register('Workflows', async ({ body, status, node, button, current }) => {
    let templates = await api.workflows();
    if (!current()) return;
    body.append(
      node('h2', 'Reusable Colab workflows'),
      node(
        'p',
        'Save a task, acceptance criteria and checks. Applying a workflow opens a draft; checks run only when you send that task.',
      ),
    );
    const picker = node('select');
    picker.setAttribute('aria-label', 'Choose workflow');
    picker.append(
      new Option('New workflow', ''),
      ...templates.map((row) => new Option(row.name + (row.builtin ? ' · starter' : ''), row.id)),
    );
    body.append(picker);
    const fields = {};
    for (const [id, label, rows] of [
      ['name', 'Workflow name', 1],
      ['task', 'Task', 4],
      ['criteria', 'Acceptance criteria (one per line)', 3],
      ['outOfScope', 'Out of scope', 2],
      ['checks', 'Check commands (one per line)', 2],
    ]) {
      const field = node('label', label),
        input = node(rows === 1 ? 'input' : 'textarea');
      input.rows = rows;
      input.id = 'workflow-' + id;
      fields[id] = input;
      field.append(input);
      body.append(field);
    }
    const modeLabel = node('label', 'Colab mode'),
      mode = node('select');
    for (const value of ['build', 'debug', 'plan', 'compare']) mode.append(new Option(value, value));
    modeLabel.append(mode);
    body.append(modeLabel);
    const read = () => ({
      id: picker.value,
      ...Object.fromEntries(Object.entries(fields).map(([id, input]) => [id, input.value])),
      mode: mode.value,
    });
    picker.onchange = () => {
      const value = templates.find((row) => row.id === picker.value) || {};
      for (const [id, input] of Object.entries(fields)) input.value = value[id] || '';
      mode.value = value.mode || 'build';
    };
    const actions = node('div');
    actions.className = 'power-actions';
    body.append(actions);
    button(
      'Save workflow',
      async () => {
        templates = await api.workflows({ action: 'save', template: read() });
        await power.show('Workflows');
        status.textContent = 'Workflow saved locally.';
      },
      actions,
    );
    button(
      'Use draft in Colab',
      () => {
        const workflow = read();
        if (!workflow.task.trim()) throw Error('Enter a task first.');
        window.atlasColab.applyWorkflow(workflow);
        power.dialog.close();
      },
      actions,
    ).className = 'power-primary';
    button(
      'Delete saved workflow',
      async () => {
        if (!picker.value || templates.find((row) => row.id === picker.value)?.builtin)
          throw Error('Starter workflows remain available. Choose a saved workflow to delete.');
        await api.workflows({ action: 'delete', id: picker.value });
        await power.show('Workflows');
      },
      actions,
    );
    status.textContent =
      'Commands in read-only Plan and Compare modes do not run. Workflow checks override project checks only for this task; project settings are preserved.';
  });
})();
