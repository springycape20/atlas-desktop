(() => {
  const api = window.atlas,
    power = window.atlasPower,
    { field, folder } = window.atlasCapabilities;
  power.register('Plan a task', async ({ body, node, button, status, current }) => {
    body.append(
      node('h2', 'Review a plan before starting'),
      node(
        'p',
        'Prepare an editable local outline, inspect suggested files, then explicitly approve it. Approval fills an unsent Colab draft; sending it uses the normal workspace and permission checks.',
      ),
    );
    const picker = document.createElement('select');
    picker.setAttribute('aria-label', 'Saved task plans');
    picker.append(new Option('New plan', ''));
    const plans = await api.taskPlans({ action: 'list' });
    if (!current()) return;
    for (const row of plans) picker.append(new Option(row.task.slice(0, 80), row.id));
    body.append(picker);
    const fields = {};
    for (const [key, label, value, multi] of [
      ['cwd', 'Project folder', folder(), false],
      ['task', 'Task', power.request().prompt, true],
      ['steps', 'Editable steps', '', true],
      ['files', 'Expected affected files', '', true],
      ['criteria', 'Acceptance criteria', '', true],
      ['outOfScope', 'Out of scope', '', true],
    ])
      fields[key] = field(body, label, value, multi);
    picker.onchange = () => {
      const row = plans.find((item) => item.id === picker.value) || {};
      for (const [key, input] of Object.entries(fields)) input.value = row[key] || '';
    };
    const read = () => ({
      id: picker.value,
      ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])),
    });
    button('Prepare outline and find files', async () => {
      if (!fields.task.value.trim()) throw Error('Enter the task first.');
      fields.steps.value =
        '1. Inspect the relevant code and reproduce the current behavior.\n2. Implement the smallest complete change for: ' +
        fields.task.value.slice(0, 500) +
        '\n3. Run appropriate project checks and review the diff.';
      fields.criteria.value =
        'The requested behavior is implemented.\nRelevant checks pass or remaining failures are explained.\nChanges stay within the reviewed scope.';
      const result = await api.projectKnowledge({ cwd: fields.cwd.value, query: fields.task.value });
      if (!current()) return;
      fields.files.value = (result.results || [])
        .slice(0, 12)
        .map((row) => row.path)
        .filter(Boolean)
        .join('\n');
      status.textContent =
        'Local starter outline prepared. Review and edit every field; file matches are suggestions, not confirmed impact.';
    });
    button('Save draft plan', async () => {
      const saved = await api.taskPlans({ action: 'save', plan: read() });
      picker.append(new Option(saved.task.slice(0, 80), saved.id));
      picker.value = saved.id;
      status.textContent = 'Draft saved. Changes require approval again.';
    });
    button('Approve plan and prepare Colab draft', async () => {
      const saved = await api.taskPlans({ action: 'save', plan: read() });
      const approved = await api.taskPlans({ action: 'approve', id: saved.id, revision: saved.revision });
      window.atlasColab.applyWorkflow({
        name: 'Approved plan',
        mode: 'build',
        cwd: approved.cwd,
        criteria: approved.criteria,
        outOfScope: approved.outOfScope,
        task:
          approved.task +
          '\n\nApproved steps:\n' +
          approved.steps +
          '\n\nExpected affected files (verify before editing):\n' +
          approved.files,
      });
      power.close();
    });
    button('Delete saved plan', async () => {
      if (!picker.value) throw Error('Choose a saved plan.');
      await api.taskPlans({ action: 'delete', id: picker.value });
      await power.show('Plan a task');
    });
  });
  window.atlasUi.register('tasks', 'Plan a task');
})();
