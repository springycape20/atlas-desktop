(() => {
  window.atlasBenchmarkBuilder = ({ body, node, button, settings = {}, catalog = {} }) => {
    const cases = [],
      configurations = [];
    const field = (host, label, value = '', area = false) => {
      const wrap = node('label', label),
        input = node(area ? 'textarea' : 'input');
      input.value = value;
      input.setAttribute('aria-label', label);
      if (area) input.rows = 3;
      wrap.append(input);
      host.append(wrap);
      return input;
    };
    const select = (host, label, values, value) => {
      const wrap = node('label', label),
        input = node('select');
      input.setAttribute('aria-label', label);
      for (const [id, name] of values) input.append(new Option(name, id));
      input.value = value;
      wrap.append(input);
      host.append(wrap);
      return input;
    };
    const caseList = node('section'),
      configList = node('section');
    body.append(node('h3', 'Fixed tasks'), caseList);
    function addCase() {
      if (cases.length >= 8) throw Error('Up to eight cases can be added.');
      const box = node('details'),
        number = cases.length + 1;
      box.open = !cases.length;
      box.append(node('summary', 'Case ' + number));
      caseList.append(box);
      const row = {
        box,
        name: field(box, 'Case name', 'Case ' + number),
        task: field(box, 'Task', '', true),
        criteria: field(box, 'Acceptance criteria', '', true),
        checks: field(box, 'Check commands', '', true),
      };
      cases.push(row);
      button(
        'Remove case',
        () => {
          cases.splice(cases.indexOf(row), 1);
          box.remove();
        },
        box,
      );
    }
    button('Add task case', addCase);
    addCase();
    body.append(node('h3', 'Model configurations'), configList);
    const models = (provider) => {
      const ids = new Map();
      for (const row of catalog[provider]?.models || [])
        if (row.id) ids.set(row.id, row.name || row.displayName || row.id);
      for (const id of [...(settings[provider + 'Models'] || []), settings[provider + 'Model']].filter(Boolean))
        if (!ids.has(id)) ids.set(id, id);
      return [['', 'Choose a pinned model'], ...ids.entries(), ['__custom__', 'Enter a custom model ID…']];
    };
    function addConfiguration(provider = 'codex') {
      if (configurations.length >= 4) throw Error('Up to four configurations can be added.');
      const box = node('details'),
        number = configurations.length + 1;
      box.open = !configurations.length;
      box.append(node('summary', 'Configuration ' + number));
      configList.append(box);
      const row = {
        box,
        name: field(box, 'Configuration name', 'Configuration ' + number),
        provider: select(
          box,
          'Provider',
          [
            ['codex', 'Codex'],
            ['claude', 'Claude'],
            ['colab', 'Colab'],
          ],
          provider,
        ),
        effort: select(
          box,
          'Effort',
          [
            ['low', 'Low'],
            ['medium', 'Medium'],
            ['high', 'High'],
            ['xhigh', 'Extra high'],
            ['max', 'Maximum'],
          ],
          'medium',
        ),
        models: {},
      };
      for (const key of ['codex', 'claude']) {
        const group = node('div'),
          model = select(
            group,
            key === 'codex' ? 'Codex model' : 'Claude model',
            models(key),
            settings[key + 'Model'] || '',
          ),
          custom = field(group, 'Custom ' + key + ' model ID');
        custom.parentElement.hidden = model.value !== '__custom__';
        model.onchange = () => {
          custom.parentElement.hidden = model.value !== '__custom__';
        };
        box.append(group);
        row.models[key] = { group, model, custom };
      }
      row.mode = select(
        box,
        'Colab mode',
        [
          ['build', 'Build and review'],
          ['debug', 'Debug'],
          ['plan', 'Plan'],
          ['compare', 'Compare'],
        ],
        'build',
      );
      const show = () => {
        for (const key of ['codex', 'claude'])
          row.models[key].group.hidden = row.provider.value !== 'colab' && row.provider.value !== key;
        row.mode.parentElement.hidden = row.provider.value !== 'colab';
      };
      row.provider.onchange = show;
      show();
      const limits = node('details');
      limits.append(node('summary', 'Per-run limits'));
      box.append(limits);
      row.limits = {};
      for (const [key, label, value] of [
        ['seconds', 'Duration (seconds)', 600],
        ['providerCalls', 'ATLAS invocation limit', 8],
        ['repairAttempts', 'Repair-pass limit', 2],
        ['estimatedTokens', 'Outgoing text estimate limit', 64000],
      ]) {
        const input = field(limits, label, value);
        input.type = 'number';
        input.min = key === 'repairAttempts' ? '0' : '1';
        row.limits[key] = input;
      }
      configurations.push(row);
      button(
        'Remove configuration',
        () => {
          configurations.splice(configurations.indexOf(row), 1);
          box.remove();
        },
        box,
      );
    }
    button('Add model configuration', () => addConfiguration());
    addConfiguration();
    body.append(
      node(
        'p',
        'Model choices use the already available catalogue and saved IDs. Opening this form makes no provider request. Pin models you can access; real benchmark runs still require separate approval.',
      ),
    );
    const advanced = node('details'),
      use = node('input');
    use.type = 'checkbox';
    advanced.append(node('summary', 'Advanced: JSON definitions'));
    const label = node('label', ' Use JSON instead of the form');
    label.prepend(use);
    advanced.append(label);
    const rawCases = field(advanced, 'Cases JSON', '[]', true),
      rawConfigs = field(advanced, 'Configurations JSON', '[]', true);
    button(
      'Copy form values to JSON',
      () => {
        const value = readForm();
        rawCases.value = JSON.stringify(value.cases, null, 2);
        rawConfigs.value = JSON.stringify(value.configs, null, 2);
      },
      advanced,
    );
    body.append(advanced);
    function readForm() {
      if (!cases.length || !configurations.length) throw Error('Add at least one task and model configuration.');
      return {
        cases: cases.map((row) => ({
          name: row.name.value,
          task: row.task.value,
          criteria: row.criteria.value,
          checks: row.checks.value,
        })),
        configs: configurations.map((row) => {
          const pin = (key) =>
            row.models[key].model.value === '__custom__'
              ? row.models[key].custom.value.trim()
              : row.models[key].model.value;
          const provider = row.provider.value;
          return {
            name: row.name.value,
            provider,
            ...(provider === 'colab'
              ? { codexModel: pin('codex'), claudeModel: pin('claude'), mode: row.mode.value }
              : { model: pin(provider) }),
            effort: row.effort.value,
            ...Object.fromEntries(Object.entries(row.limits).map(([key, input]) => [key, Number(input.value)])),
          };
        }),
      };
    }
    return {
      read: () =>
        use.checked ? { cases: JSON.parse(rawCases.value), configs: JSON.parse(rawConfigs.value) } : readForm(),
    };
  };
})();
