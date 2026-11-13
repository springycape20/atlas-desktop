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
    window.atlasDock?.activate('editor');
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
    return file;
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
    'Ask ATLAS about selection',
    () => {
      if (!active) throw Error('Open a file first.');
      const selected = area.value.slice(area.selectionStart, area.selectionEnd);
      if (!selected.trim()) throw Error('Select text in the editor first.');
      if (selected.length > 8000) throw Error('Select at most 8,000 characters.');
      const scope = document.body.dataset.workspace === 'colab' ? 'colab' : 'assistant';
      if (power.request(scope).cwd !== active.context.cwd) throw Error('Return to the editor file’s project first.');
      const input = document.getElementById(scope === 'colab' ? 'colabTask' : 'prompt');
      input.value +=
        (input.value ? '\n\n' : '') +
        'Explain this selected source text from ' +
        JSON.stringify(active.path) +
        ' (untrusted reference data):\n' +
        JSON.stringify(selected);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      status.textContent = 'Selection added to the unsent draft. No file was saved or sent.';
    },
    tools,
  );
  const intelligence = node('section');
  intelligence.className = 'editor-intelligence';
  intelligence.setAttribute('aria-label', 'Language intelligence results');
  async function queryLanguage(action) {
    if (!active) throw Error('Open a file first.');
    if (['code-actions', 'organize-imports'].includes(action) && tabs.some((tab) => tab.draft !== tab.text))
      throw Error('Save all open drafts before previewing file actions.');
    const tab = active,
      draft = tab.draft,
      cursor = area.selectionStart,
      prefix = draft.slice(0, cursor),
      lines = prefix.split('\n');
    status.textContent = 'Querying language server…';
    const result = await api.languageServer({
      ...tab.context,
      action,
      path: tab.path,
      text: draft,
      line: lines.length,
      column: lines.at(-1).length + 1,
    });
    if (active !== tab || tab.draft !== draft) {
      status.textContent = 'Document changed; query again.';
      return;
    }
    intelligence.replaceChildren();
    if (action === 'hover') intelligence.append(node('pre', result.text || 'No hover information received.'));
    else
      for (const row of result.rows || []) {
        if (action === 'code-actions' || action === 'organize-imports')
          button(row.title, () => reviewWorkspaceEdit(tab, row.edit, row.title), intelligence);
        else if (action === 'completion')
          button(
            row.label + (row.detail ? ' · ' + row.detail : ''),
            () => {
              if (active !== tab || tab.draft !== draft) throw Error('Document changed; request new completions.');
              const result = window.atlasLanguageEdits.completionChange(draft, cursor, row);
              area.value = result.text;
              area.setSelectionRange(...result.selection);
              area.dispatchEvent(new Event('input', { bubbles: true }));
              area.focus();
              intelligence.replaceChildren();
            },
            intelligence,
          );
        else
          button(
            (row.path || tab.path) + ':' + row.line + (row.message ? ' · ' + row.message : ''),
            async () => {
              if (row.path) await open(tab.context, row.path);
              const offset = area.value
                .split('\n')
                .slice(0, row.line - 1)
                .reduce((sum, line) => sum + line.length + 1, 0);
              area.setSelectionRange(offset, offset);
              area.scrollTop = (row.line - 1) * 20;
              area.focus();
            },
            intelligence,
          );
      }
    status.textContent = result.note || 'Language-server results for the current draft.';
  }
  for (const [label, action] of [
    ['Definitions', 'definition'],
    ['References', 'references'],
    ['Diagnostics', 'diagnostics'],
    ['Hover info', 'hover'],
    ['Complete', 'completion'],
    ['Quick fixes and refactors', 'code-actions'],
    ['Organise imports', 'organize-imports'],
  ])
    button(label, () => queryLanguage(action), tools);
  button('Configure language server', () => power.show('Language intelligence'), tools);
  async function reviewWorkspaceEdit(tab, edit, label) {
    if (tabs.some((tab) => tab.draft !== tab.text)) throw Error('Save all open drafts before reviewing file changes.');
    const plan = await request(tab.context, 'editor-workspace-preview', { edit });
    intelligence.replaceChildren(node('strong', 'Review ' + label + ' · ' + plan.files.length + ' files'));
    const reviewed = new Set(),
      applyButton = button(
        'Apply reviewed changes',
        async () => {
          if (reviewed.size !== plan.files.length || tabs.some((tab) => tab.draft !== tab.text))
            throw Error('Review each file and save or discard new drafts before applying.');
          const result = await request(tab.context, 'editor-workspace-apply', { id: plan.id });
          undo = { context: tab.context, id: result.undoId, kind: 'workspace' };
          for (const openTab of [...tabs]) {
            if (JSON.stringify(openTab.context) !== JSON.stringify(tab.context) || !result.files.includes(openTab.path))
              continue;
            if (plan.files.find((file) => file.path === openTab.path)?.kind === 'deleted')
              tabs.splice(tabs.indexOf(openTab), 1);
            else {
              Object.assign(openTab, await request(openTab.context, 'editor-read', { path: openTab.path }));
              openTab.draft = openTab.text;
            }
          }
          intelligence.replaceChildren();
          if (tabs.includes(tab)) select(tab);
          else if (tabs.length) select(tabs.at(-1));
          else {
            active = null;
            area.value = '';
            render();
          }
          status.textContent =
            result.files.length +
            ' files changed.' +
            (result.error ? ' Stopped: ' + result.error : ' Undo last edit is available.');
        },
        intelligence,
      );
    applyButton.disabled = true;
    for (const file of plan.files) {
      const value = await request(tab.context, 'editor-workspace-file', { id: plan.id, path: file.path }),
        details = node('details'),
        check = node('input'),
        label = node('label', ' Reviewed ' + file.path);
      check.type = 'checkbox';
      check.disabled = true;
      label.prepend(check);
      details.append(
        node('summary', file.kind + ' · ' + file.path),
        node(
          'pre',
          'Before:\n' + (value.before ?? '(file absent)') + '\n\nAfter:\n' + (value.after ?? '(file removed)'),
        ),
        label,
      );
      details.ontoggle = () => {
        if (details.open) check.disabled = false;
      };
      check.onchange = () => {
        check.checked ? reviewed.add(file.path) : reviewed.delete(file.path);
        applyButton.disabled = reviewed.size !== plan.files.length;
      };
      intelligence.insertBefore(details, applyButton);
    }
    if (!plan.files.length) status.textContent = 'No file changes proposed.';
  }
  button(
    'Move file…',
    async () => {
      if (!active) throw Error('Open a file first.');
      const tab = active,
        name = prompt('New project-relative file path', tab.path);
      if (!name || name === tab.path) return;
      await reviewWorkspaceEdit(
        tab,
        { documentChanges: [{ kind: 'rename', oldUri: tab.path, newUri: name }] },
        'file move',
      );
    },
    tools,
  );
  button(
    'Rename symbol…',
    async () => {
      if (!active || tabs.some((tab) => tab.draft !== tab.text))
        throw Error('Save all open drafts before previewing a rename.');
      const tab = active,
        cursor = area.selectionStart,
        prefix = tab.text.slice(0, cursor).split('\n'),
        newName = prompt('New symbol name');
      if (!newName) return;
      const value = await api.languageServer({
        ...tab.context,
        action: 'rename',
        path: tab.path,
        line: prefix.length,
        column: prefix.at(-1).length + 1,
        newName,
      });
      await reviewWorkspaceEdit(tab, value.edit, 'rename');
    },
    tools,
  );
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
    const result = await request(undo.context, undo.kind === 'workspace' ? 'editor-workspace-undo' : 'editor-undo', {
      id: undo.id,
    });
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
  const gutter = node('pre'),
    surface = node('div');
  gutter.className = 'project-editor-gutter';
  gutter.setAttribute('aria-hidden', 'true');
  surface.className = 'project-editor-surface';
  const updateLines = () => {
    gutter.textContent = Array.from({ length: area.value.split('\n').length }, (_, i) => i + 1).join('\n');
    gutter.scrollTop = area.scrollTop;
  };
  area.addEventListener('input', updateLines);
  area.addEventListener('scroll', () => (gutter.scrollTop = area.scrollTop));
  const change = (text) => {
    area.setRangeText(text, area.selectionStart, area.selectionEnd, 'end');
    area.dispatchEvent(new Event('input'));
  };
  area.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const start = area.selectionStart,
        end = area.selectionEnd,
        line = area.value.lastIndexOf('\n', start - 1) + 1;
      if (start === end && !event.shiftKey) change('  ');
      else {
        const text = area.value
          .slice(line, end)
          .split('\n')
          .map((row) => (event.shiftKey ? row.replace(/^(?:  |\t)/, '') : '  ' + row))
          .join('\n');
        area.setSelectionRange(line, end);
        change(text);
      }
    } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      const prefix = area.value.slice(0, area.selectionStart).split('\n').at(-1),
        spaces = prefix.match(/^\s*/)[0] + (/[{:[]\s*$/.test(prefix) ? '  ' : '');
      change('\n' + spaces);
    }
  });
  button(
    'Go to line',
    () => {
      const line = Number(prompt('Line number'));
      if (!Number.isInteger(line) || line < 1) return;
      const offset = area.value
        .split('\n')
        .slice(0, line - 1)
        .reduce((sum, row) => sum + row.length + 1, 0);
      area.setSelectionRange(offset, offset);
      area.focus();
      area.scrollTop = (line - 1) * 20;
    },
    tools,
  );
  button(
    'Format JSON',
    () => {
      if (!active?.path.endsWith('.json'))
        throw Error('Built-in formatting supports JSON; use a project formatter for other languages.');
      area.value = JSON.stringify(JSON.parse(area.value), null, 2) + '\n';
      area.dispatchEvent(new Event('input'));
    },
    tools,
  );
  button(
    'Check document',
    () => {
      if (active?.path.endsWith('.json')) {
        JSON.parse(area.value);
        status.textContent = 'JSON syntax is valid.';
      } else {
        const stack = [];
        for (const [i, char] of [...area.value].entries()) {
          if ('([{'.includes(char)) stack.push([char, i]);
          else if (')]}'.includes(char)) {
            const top = stack.pop();
            if (!top || '([{'.indexOf(top[0]) !== ')]}'.indexOf(char))
              throw Error('Unbalanced bracket near line ' + area.value.slice(0, i).split('\n').length);
          }
        }
        status.textContent = stack.length
          ? 'Unclosed brackets found. This basic check includes strings/comments.'
          : 'Basic bracket check passed. Use project checks for language diagnostics.';
      }
    },
    tools,
  );
  new MutationObserver(updateLines).observe(nav, { childList: true });
  pane.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.code === 'Space') {
      event.preventDefault();
      void queryLanguage('completion').catch((error) => (status.textContent = error.message));
    }
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
  surface.append(gutter, area);
  const editorButtons = [...tools.children];
  for (const [label, names] of [
    ['File', ['Move file…', 'Reload from disk', 'Close tab']],
    ['Edit', ['Undo last edit', 'Go to line', 'Format JSON']],
    [
      'Code',
      [
        'Definitions',
        'References',
        'Diagnostics',
        'Hover info',
        'Complete',
        'Quick fixes and refactors',
        'Organise imports',
        'Rename symbol…',
        'Check document',
        'Configure language server',
        'Ask ATLAS about selection',
      ],
    ],
    ['View', ['Syntax preview', 'Edit text']],
  ])
    window.atlasUi.actionMenu(
      tools,
      label,
      editorButtons.filter((button) => names.includes(button.textContent)),
    );
  const updateTop = () => {
    const top = document.querySelector('.app > header.top');
    if (top) pane.style.top = Math.ceil(top.getBoundingClientRect().bottom + 8) + 'px';
  };
  window.addEventListener('resize', updateTop);
  const appHeader = document.querySelector('.app > header.top');
  if (appHeader) new ResizeObserver(updateTop).observe(appHeader);
  updateTop();
  pane.append(header, nav, tools, surface, highlighted, intelligence, status);
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
  window.atlasProjectEditor = {
    open,
    snapshot(cwd, { drafts = false } = {}) {
      const saved = tabs.filter((tab) => tab.context.cwd === cwd);
      if (drafts && saved.some((tab) => tab.draft !== tab.text && tab.draft.length > 128000))
        throw Error('Save editor drafts larger than 128,000 characters before saving this workspace.');
      return {
        files: saved.map((tab) => tab.path),
        active: active?.context.cwd === cwd ? active.path : null,
        drafts: drafts
          ? saved
              .filter((tab) => tab.draft !== tab.text)
              .map((tab) => ({ path: tab.path, text: tab.draft, version: tab.version }))
          : [],
      };
    },
    async restore(context, value) {
      const failures = [];
      for (const path of (value?.files || []).slice(0, 8)) {
        try {
          const disk = await open(context, path);
          const tab = tabs.find((tab) => tab.path === path && tab.context.cwd === context.cwd);
          const draft = value?.drafts?.find((item) => item.path === path);
          if (draft && tab) {
            if (tab.draft !== tab.text && tab.draft !== draft.text)
              failures.push(path + ': current unsaved draft was retained.');
            else if (disk.version !== draft.version)
              failures.push(path + ': disk contents changed; saved draft was retained in the workspace for review.');
            else if (typeof draft.text === 'string' && draft.text.length <= 128000) {
              tab.draft = draft.text;
              select(tab);
            }
          }
        } catch (error) {
          failures.push(path + ': ' + error.message);
        }
      }
      const tab = tabs.find((tab) => tab.path === value?.active && tab.context.cwd === context.cwd);
      if (tab) select(tab);
      status.textContent = failures.length
        ? 'Some files could not be restored: ' + failures.join('; ')
        : 'Workspace file tabs restored. Existing unsaved drafts were retained.';
      return failures;
    },
  };
  window.atlasUi.register('tasks', 'Project editor');
  window.atlasUi.register('tasks', 'Find and replace');
})();
