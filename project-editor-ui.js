(() => {
  const api = window.atlas,
    power = window.atlasPower;
  if (!api?.projectFile || !power) return;
  const { node } = power,
    tabs = [],
    pane = node('aside'),
    nav = node('nav'),
    area = node('textarea'),
    highlighted = node('pre'),
    status = node('p');
  pane.className = 'project-editor-panel';
  pane.hidden = true;
  pane.setAttribute('aria-label', 'Project file editor');
  nav.setAttribute('aria-label', 'Open files');
  nav.setAttribute('role', 'tablist');
  area.setAttribute('aria-label', 'File contents');
  area.spellcheck = false;
  highlighted.hidden = true;
  status.setAttribute('role', 'status');
  let active,
    undo,
    syntaxGeneration = 0;
  const request = (context, action, extra = {}) => api.projectFile({ ...context, action, ...extra });
  const button = (text, action, parent) => {
    const item = node('button', text);
    item.type = 'button';
    item.className = 'quiet-button';
    item.onclick = async () => {
      item.disabled = true;
      try {
        await action();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        item.disabled = false;
      }
    };
    parent.append(item);
    return item;
  };
  const header = node('header');
  header.append(node('h1', 'ATLAS · Project editor'));
  button(
    'Hide editor',
    () => {
      pane.hidden = true;
      document.body.classList.remove('project-editor-open');
    },
    header,
  );
  const tools = node('div');
  tools.className = 'project-editor-actions';
  function visible() {
    pane.hidden = false;
    document.body.classList.add('project-editor-open');
  }
  function render() {
    nav.replaceChildren();
    for (const tab of tabs) {
      const item = button(tab.path + (tab.draft !== tab.text ? ' •' : ''), () => select(tab), nav);
      item.setAttribute('role', 'tab');
      item.setAttribute('aria-selected', String(tab === active));
      item.tabIndex = tab === active ? 0 : -1;
      item.onkeydown = (event) => {
        const index = tabs.indexOf(tab),
          next =
            event.key === 'ArrowRight'
              ? tabs[(index + 1) % tabs.length]
              : event.key === 'ArrowLeft'
                ? tabs[(index + tabs.length - 1) % tabs.length]
                : event.key === 'Home'
                  ? tabs[0]
                  : event.key === 'End'
                    ? tabs.at(-1)
                    : null;
        if (next) {
          event.preventDefault();
          select(next);
          nav.querySelector('[aria-selected=true]')?.focus();
        }
      };
    }
  }
  function select(tab) {
    active = tab;
    area.value = tab.draft;
    area.hidden = false;
    highlighted.hidden = true;
    render();
    visible();
    area.focus();
  }
  async function open(context, path) {
    const file = await request(context, 'editor-read', { path });
    let tab = tabs.find((tab) => JSON.stringify(tab.context) === JSON.stringify(context) && tab.path === file.path);
    if (!tab) {
      if (tabs.length >= 8) throw Error('Close a file tab before opening another (8 maximum).');
      tab = { ...file, context, draft: file.text };
      tabs.push(tab);
    }
    power.close();
    select(tab);
    status.textContent =
      'Edits stay local. Save checks for newer disk changes. Undo is available for one hour in this session.';
  }
  async function save() {
    if (!active) return;
    const tab = active,
      draft = tab.draft,
      result = await request(tab.context, 'editor-save', { path: tab.path, text: draft, version: tab.version });
    if (result.error) throw Error(result.error);
    undo = { context: tab.context, id: result.undoId };
    Object.assign(tab, result.file);
    if (tab.draft === draft) tab.draft = tab.text;
    render();
    status.textContent = 'Saved ' + tab.path;
  }
  button('Save', save, tools);
  button(
    'Reload from disk',
    async () => {
      if (!active || (active.draft !== active.text && !confirm('Discard unsaved edits and reload this file?'))) return;
      Object.assign(active, await request(active.context, 'editor-read', { path: active.path }));
      active.draft = active.text;
      select(active);
    },
    tools,
  );
  button(
    'Syntax preview',
    async () => {
      if (!active) return;
      const generation = ++syntaxGeneration,
        text = active.draft,
        path = active.path;
      const value = await window.atlasSyntax.highlight(text, path);
      if (generation !== syntaxGeneration || active?.path !== path || active.draft !== text) return;
      highlighted.replaceChildren();
      if (value.lines)
        for (const line of value.lines) {
          window.atlasSyntax.append(highlighted, line);
          highlighted.append(document.createTextNode('\n'));
        }
      else highlighted.textContent = text;
      highlighted.hidden = false;
      area.hidden = true;
    },
    tools,
  );
  button(
    'Edit text',
    () => {
      area.hidden = false;
      highlighted.hidden = true;
      area.focus();
    },
    tools,
  );
  button(
    'Close tab',
    () => {
      if (!active || (active.draft !== active.text && !confirm('Discard unsaved edits in ' + active.path + '?')))
        return;
      tabs.splice(tabs.indexOf(active), 1);
      active = null;
      if (tabs.length) select(tabs.at(-1));
      else {
        area.value = '';
        render();
        pane.hidden = true;
        document.body.classList.remove('project-editor-open');
      }
    },
    tools,
  );
  async function undoLast() {
    if (!undo) throw Error('No edit from this session to undo.');
    if (
      !confirm(
        'Undo the last saved edit or replacement? Later disk edits will be protected. Open tabs must be reloaded afterwards.',
      )
    )
      return;
    const result = await request(undo.context, 'editor-undo', { id: undo.id });
    if (result.error) throw Error(result.error);
    undo = null;
    status.textContent = 'Undo complete. Reload open files before further editing.';
  }
  button('Undo last edit', undoLast, tools);
  area.oninput = () => {
    if (active) {
      active.draft = area.value;
      render();
    }
  };
  pane.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save().catch((error) => (status.textContent = error.message));
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (tabs.some((tab) => tab.draft !== tab.text)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  pane.append(header, nav, tools, area, highlighted, status);
  document.body.append(pane);
  const context = () => {
    const input = power.request();
    if (input.scope === 'colab') {
      const chat = window.atlasColab.current();
      return { scope: 'colab', cwd: chat.cwd, chatId: chat.id, jobId: chat.jobId || chat.lastJob?.id };
    }
    return { scope: 'assistant', cwd: input.cwd, conversationId: input.conversationId };
  };
  power.register('Project editor', async ({ body, button, node }) => {
    const current = context();
    body.append(
      node('h2', 'Open files beside chat'),
      node('p', 'Choose a file from the project browser, then select Open in editor. Up to eight tabs can stay open.'),
    );
    button('Browse project files', () => window.atlasProjectFiles.browse(current));
    button('Show open editor', () => {
      if (active) {
        power.close();
        visible();
      } else throw Error('Open a project text file first.');
    });
    button('Undo last edit', undoLast);
  });
  power.register('Find and replace', async ({ body, button, node, status: message }) => {
    const current = context(),
      input = (label, multiline = false) => {
        const wrap = node('label', label),
          field = node(multiline ? 'textarea' : 'input');
        wrap.append(field);
        body.append(wrap);
        return field;
      };
    body.append(
      node('h2', 'Review replacements across the project'),
      node(
        'p',
        'Literal text only. Credential files, denied paths and dependency folders are excluded. Review each selected file before applying.',
      ),
    );
    const find = input('Find'),
      replacement = input('Replace with', true),
      exclusions = input('Exclude paths (comma separated, relative to project)');
    const caseLabel = node('label', 'Match case'),
      matchCase = node('input');
    matchCase.type = 'checkbox';
    caseLabel.prepend(matchCase);
    body.append(caseLabel);
    const results = node('div');
    let plan,
      revision = 0;
    const selected = new Set(),
      reviewed = new Set();
    for (const input of [find, replacement, exclusions, matchCase])
      input.addEventListener('input', () => {
        revision++;
        plan = null;
        results.replaceChildren();
        selected.clear();
        reviewed.clear();
        message.textContent = 'Search options changed. Preview replacements again.';
      });
    button('Preview replacements', async () => {
      const generation = ++revision;
      const next = await request(current, 'replace-preview', {
        find: find.value,
        replacement: replacement.value,
        exclusions: exclusions.value,
        matchCase: matchCase.checked,
      });
      if (generation !== revision) return;
      plan = next;
      results.replaceChildren();
      selected.clear();
      reviewed.clear();
      for (const file of plan.files) {
        const planId = plan.id;
        const row = node('section'),
          box = node('input'),
          label = node('label', file.path + ' · ' + file.count + ' replacements');
        box.type = 'checkbox';
        box.disabled = true;
        label.prepend(box);
        row.append(label);
        box.onchange = () => (box.checked ? selected.add(file.path) : selected.delete(file.path));
        button(
          'Review ' + file.path,
          async () => {
            const value = await request(current, 'replace-file', { id: planId, path: file.path });
            if (plan?.id !== planId) return;
            row.querySelector('pre')?.remove();
            row.append(node('pre', 'BEFORE\n' + value.before + '\n\nAFTER\n' + value.after));
            reviewed.add(file.path);
            box.disabled = false;
          },
          row,
        );
        results.append(row);
      }
      message.textContent =
        plan.files.length +
        ' files found.' +
        (plan.limited ? ' Search limit reached; refine exclusions and repeat for remaining files.' : '');
    });
    button('Apply selected replacements', async () => {
      if (!plan || !selected.size || [...selected].some((path) => !reviewed.has(path)))
        throw Error('Review and select files first.');
      const result = await request(current, 'replace-apply', { id: plan.id, paths: [...selected] });
      undo = { context: current, id: result.undoId };
      plan = null;
      results.replaceChildren();
      message.textContent = result.files.length + ' files written.' + (result.error ? ' Stopped: ' + result.error : '');
    });
    button('Undo last edit', undoLast);
    body.append(results);
  });
  window.atlasProjectEditor = { open };
  window.atlasUi.register('tasks', 'Project editor');
  window.atlasUi.register('tasks', 'Find and replace');
})();
