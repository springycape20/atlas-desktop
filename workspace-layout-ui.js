(() => {
  const power = window.atlasPower,
    key = 'atlas.saved-workspaces.v1';
  if (!power) return;
  power.register('Saved workspace', async ({ body, node, button, status }) => {
    let context = power.request();
    const cwd = context.scope === 'colab' ? window.atlasColab.current().cwd : context.cwd;
    context = { cwd };
    if (!cwd) throw Error('Choose a project first.');
    const read = () => {
      try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value)
          ? value.filter(
              (row) =>
                typeof row?.cwd === 'string' &&
                Array.isArray(row.editor?.files) &&
                row.terminal &&
                row.editor.files.every((name) => typeof name === 'string'),
            )
          : [];
      } catch {
        return [];
      }
    };
    const rows = read(),
      saved = rows.find((row) => row.cwd === cwd);
    body.append(
      node('h2', 'Saved workspace'),
      node(
        'p',
        'Save file tabs, workbench layout, preview address and terminal definitions on this PC. Optionally include unsent chat and editor drafts. Restoring never sends a message or runs saved commands. Starting saved terminals asks for approval for each new shell.',
      ),
    );
    const detail = node(
      'p',
      saved
        ? 'Saved ' +
            new Date(saved.at).toLocaleString() +
            ' · ' +
            saved.editor.files.length +
            ' files · ' +
            saved.terminal.count +
            ' terminal definitions'
        : 'No workspace saved for this project.',
    );
    body.append(detail);
    const includeDrafts = node('input'),
      draftLabel = node('label', 'Include unsent chat and editor drafts in this local snapshot');
    includeDrafts.type = 'checkbox';
    draftLabel.className = 'power-toggle';
    draftLabel.prepend(includeDrafts);
    body.append(draftLabel);
    button('Save current workspace', async () => {
      const preview = await window.atlas.livePreview({ ...context, action: 'status' });
      let url = '';
      try {
        const value = new URL(preview.url || window.atlasDock?.snapshot().url);
        if (
          value.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(value.hostname) &&
          !value.username &&
          !value.password
        )
          url = value.origin + value.pathname;
      } catch {}
      const value = {
        cwd,
        at: Date.now(),
        editor: window.atlasProjectEditor.snapshot(cwd, { drafts: includeDrafts.checked }),
        terminal: window.atlasTerminal.snapshot(cwd),
        url,
        scope: power.request().scope,
        conversationId: power.request().conversationId,
        chatId: power.request().chatId,
        draft: includeDrafts.checked ? power.request().prompt : undefined,
        dock: { ...window.atlasDock?.snapshot(), url },
      };
      if (value.draft?.length > 128000)
        throw Error('Chat drafts are limited to 128,000 characters per saved workspace.');
      localStorage.setItem(key, JSON.stringify([...read().filter((row) => row.cwd !== cwd), value].slice(-50)));
      status.textContent = 'Workspace saved. Query strings and fragments are excluded from preview addresses.';
    });
    button('Restore working session', async () => {
      const row = read().find((item) => item.cwd === cwd);
      if (!row) throw Error('Save a workspace first.');
      const current = power.request();
      if (current.cwd !== cwd || (row.scope && current.scope !== row.scope))
        throw Error('Open the saved project and chat type before restoring this session.');
      if (
        row.draft !== undefined &&
        (row.scope === 'colab' ? current.chatId !== row.chatId : current.conversationId !== row.conversationId)
      )
        throw Error('Open the saved conversation before restoring its draft.');
      const input = document.getElementById(current.scope === 'colab' ? 'colabTask' : 'prompt');
      if (row.draft !== undefined && input.value.trim() && input.value !== row.draft)
        throw Error('Save or clear the current chat draft before restoring the saved draft.');
      const failures = await window.atlasProjectEditor.restore(context, row.editor);
      if (typeof row.draft === 'string') {
        input.value = row.draft;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      window.atlasDock?.restore(row.dock);
      status.textContent = failures.length
        ? failures.join('\n')
        : 'Working session restored. Start saved terminals and open the preview separately when ready.';
    });
    button('Restore file tabs', async () => {
      const row = read().find((item) => item.cwd === cwd);
      if (!row) throw Error('Save a workspace first.');
      const failures = await window.atlasProjectEditor.restore(context, row.editor);
      status.textContent = failures.length
        ? failures.join('\n')
        : 'File tabs restored. Existing unsaved drafts were retained.';
    });
    if (saved?.conversationId || saved?.chatId)
      button('Open saved conversation', async () => {
        const input = document.getElementById(power.request().scope === 'colab' ? 'colabTask' : 'prompt');
        if (input.value.trim()) throw Error('Save or clear the current draft before changing conversations.');
        if (saved.scope === 'colab') {
          if (!window.atlasColab.history().some((chat) => chat.id === saved.chatId))
            throw Error('Saved Colab chat is no longer available.');
          window.atlasColab.selectChat(saved.chatId);
        } else await window.atlasAssistant.open(saved.conversationId);
        power.close();
      });
    if (saved?.editor?.drafts?.length) {
      const drafts = node('details');
      drafts.append(node('summary', 'Review saved editor drafts'));
      for (const draft of saved.editor.drafts) drafts.append(node('h3', draft.path), node('pre', draft.text));
      body.append(drafts);
    }
    button('Open saved preview', async () => {
      const row = read().find((item) => item.cwd === cwd);
      if (!row?.url) throw Error('No preview address was saved. Start its development server separately.');
      await window.atlas.livePreview({ ...context, action: 'open', url: row.url });
      status.textContent = 'Saved preview opened.';
    });
    button('Start saved terminals…', async () => {
      const row = read().find((item) => item.cwd === cwd);
      if (!row) throw Error('Save a workspace first.');
      await window.atlasTerminal.restore(row.terminal, cwd);
    });
    button('Forget saved workspace', () => {
      localStorage.setItem(key, JSON.stringify(read().filter((row) => row.cwd !== cwd)));
      status.textContent = 'Saved workspace removed.';
    });
  });
  window.atlasUi.register('tasks', 'Saved workspace');
})();
