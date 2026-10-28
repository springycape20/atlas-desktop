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
})();
