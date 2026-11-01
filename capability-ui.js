(() => {
  const api = window.atlas,
    power = window.atlasPower;
  const field = (body, label, value = '', multiline = false) => {
    const row = document.createElement('label');
    row.append(document.createTextNode(label));
    const input = document.createElement(multiline ? 'textarea' : 'input');
    input.value = value;
    if (multiline) input.rows = 5;
    row.append(input);
    body.append(row);
    return input;
  };
  const folder = () => window.atlasPower.request().cwd;
  const launcher = (sectionName, label, view) => {
    const section = [...document.querySelectorAll('.setting-section')].find(
      (item) => item.querySelector('h3')?.textContent === sectionName,
    );
    window.atlasUi.actionButton(
      label,
      () => {
        document.getElementById('settingsDialog').close();
        return power.show(view);
      },
      section,
    );
  };
  window.atlasCapabilities = { field, folder, launcher };
  power.register('Project memory', async ({ body, node, button, status, current }) => {
    const cwd = field(body, 'Project folder', folder());
    const category = document.createElement('select');
    category.setAttribute('aria-label', 'Memory category');
    for (const name of ['decision', 'project', 'preference', 'task']) category.append(new Option(name, name));
    body.append(
      node(
        'p',
        'Project memories are included only for this exact project folder. Saved reference data never grants tool permissions.',
      ),
      category,
    );
    const text = field(body, 'Decision, convention or preferred command', '', true);
    let editing = '';
    const list = node('div');
    const load = async () => {
      const rows = await api.memory({ action: 'list' });
      if (!current()) return;
      list.replaceChildren();
      for (const row of rows.filter((item) => item.projectFolder)) {
        const item = node('details');
        item.append(node('summary', row.category + ' · ' + row.projectFolder), node('pre', row.text));
        button(
          'Edit',
          () => {
            editing = row.id;
            cwd.value = row.projectFolder;
            category.value = row.category;
            text.value = row.text;
          },
          item,
        );
        button(
          'Delete',
          async () => {
            await api.memory({ action: 'delete', item: { id: row.id } });
            await load();
          },
          item,
        );
        list.append(item);
      }
      if (!list.children.length) list.append(node('p', 'No project memories saved yet.'));
    };
    button('Save project memory', async () => {
      if (!cwd.value.trim()) throw Error('Choose a project folder.');
      await api.memory({
        action: 'save',
        item: { id: editing || undefined, text: text.value, category: category.value, projectFolder: cwd.value.trim() },
      });
      editing = '';
      text.value = '';
      await load();
      status.textContent = 'Project memory saved locally.';
    });
    body.append(list);
    await load();
  });
  window.atlasUi.register('library', 'Project memory');
  power.register('Memory review', async ({ body, node, button, status, current }) => {
    body.append(
      node(
        'p',
        'Everything ATLAS remembers, for every project. Up to 12 relevant memories are sent with a message when Memories is on in Context.',
      ),
    );
    const onlyFlagged = document.createElement('select');
    onlyFlagged.setAttribute('aria-label', 'Which memories to show');
    onlyFlagged.append(new Option('All memories', ''), new Option('Worth a look', 'flagged'));
    onlyFlagged.onchange = () => void load();
    body.append(onlyFlagged);
    const prompt = field(body, 'Check a message: which memories would be sent?'),
      cwd = field(body, 'From project folder', folder());
    let checked = false;
    button('Check message', async () => {
      if (!prompt.value.trim()) throw Error('Type a message to check.');
      checked = true;
      await load();
    });
    const list = node('div');
    body.append(list);
    const flags = (row) =>
      [
        row.duplicate && 'same as another memory',
        row.missingFolder && 'project folder is gone',
        row.old && 'not changed in 6 months',
      ].filter(Boolean);
    async function load() {
      const { rows = [], limit } = await api.memory({
        action: 'review',
        item: checked ? { prompt: prompt.value, cwd: cwd.value } : {},
      });
      if (!current()) return;
      list.replaceChildren();
      const sent = rows.filter((row) => row.sent).length;
      status.textContent =
        rows.length +
        ' of ' +
        limit +
        ' memories. At the limit, saving a new one removes the oldest.' +
        (checked ? ' This message would send ' + sent + '.' : '');
      for (const row of [...rows].reverse()) {
        if (onlyFlagged.value && !flags(row).length) continue;
        const item = node('details'),
          text = document.createElement('textarea'),
          date = row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : 'Date unknown';
        text.value = row.text;
        text.rows = 3;
        text.setAttribute('aria-label', 'Memory text');
        item.append(
          node(
            'summary',
            [
              row.sent && 'Would be sent',
              row.category,
              row.projectFolder || 'All projects',
              date,
              ...flags(row),
              row.text.slice(0, 60),
            ]
              .filter(Boolean)
              .join(' · '),
          ),
          text,
        );
        const save = (projectFolder) =>
          api.memory({
            action: 'save',
            item: { id: row.id, text: text.value, category: row.category, projectFolder },
          });
        button(
          'Save changes',
          async () => {
            await save(row.projectFolder);
            await load();
          },
          item,
        );
        if (row.missingFolder)
          button(
            'Use for all projects',
            async () => {
              await save('');
              await load();
            },
            item,
          );
        button(
          'Delete',
          async () => {
            await api.memory({ action: 'delete', item: { id: row.id } });
            await load();
          },
          item,
        );
        list.append(item);
      }
      if (!list.children.length) list.append(node('p', rows.length ? 'Nothing to look at.' : 'No memories saved yet.'));
    }
    await load();
  });
  window.atlasUi.register('library', 'Memory review');
})();
