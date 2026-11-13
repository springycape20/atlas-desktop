(() => {
  const power = window.atlasPower,
    api = window.atlas;
  if (!power) return;
  window.atlasWorkflows = {
    async fromTask(job) {
      const template = window.atlasTaskWorkflow.fromTask(job);
      await power.show('Workflows');
      for (const [key, value] of Object.entries(template)) {
        const input = document.getElementById('workflow-' + key);
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('change'));
        }
      }
      const mode = power.body.querySelector('[aria-label="Workflow mode"]');
      if (mode) mode.value = template.mode;
      power.status.textContent =
        'Review the task, scope and commands before saving. Use {{parameter}} placeholders for inputs that change.';
    },
  };
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
      ['steps', 'Ordered workflow steps (task instructions)', 3],
      ['stopConditions', 'Stopping conditions / decisions requiring your input', 2],
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
    mode.setAttribute('aria-label', 'Workflow mode');
    for (const value of ['build', 'debug', 'plan', 'compare']) mode.append(new Option(value, value));
    modeLabel.append(mode);
    body.append(modeLabel);
    const params = node('section');
    params.setAttribute('aria-label', 'Workflow inputs');
    body.append(params);
    const parameterFields = new Map();
    const updateParameters = () => {
      const names = window.atlasTaskWorkflow.parameters(
        Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])),
      );
      const previous = Object.fromEntries([...parameterFields].map(([key, input]) => [key, input.value]));
      params.replaceChildren();
      parameterFields.clear();
      for (const name of names) {
        const label = node('label', name),
          input = node('input');
        input.setAttribute('aria-label', 'Workflow input ' + name);
        input.value = previous[name] || '';
        label.append(input);
        params.append(label);
        parameterFields.set(name, input);
      }
    };
    for (const input of Object.values(fields))
      input.addEventListener('change', () => {
        try {
          updateParameters();
        } catch (error) {
          status.textContent = error.message;
        }
      });
    const read = () => ({
      id: picker.value,
      ...Object.fromEntries(Object.entries(fields).map(([id, input]) => [id, input.value])),
      mode: mode.value,
    });
    picker.onchange = () => {
      const value = templates.find((row) => row.id === picker.value) || {};
      for (const [id, input] of Object.entries(fields)) input.value = value[id] || '';
      mode.value = value.mode || 'build';
      updateParameters();
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
        const workflow = window.atlasTaskWorkflow.fill(
          read(),
          Object.fromEntries([...parameterFields].map(([key, input]) => [key, input.value])),
        );
        if (!workflow.task.trim()) throw Error('Enter a task first.');
        window.atlasColab.applyWorkflow(workflow);
        power.close();
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
