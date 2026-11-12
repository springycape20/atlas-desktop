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
        'Save open file paths, the preview address and terminal layout locally. Draft contents, terminal output and commands are excluded. Restoring terminals asks for approval for each new shell.',
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
    button('Save current workspace', async () => {
      const preview = await window.atlas.livePreview({ ...context, action: 'status' });
      let url = '';
      try {
        const value = new URL(preview.url);
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
        editor: window.atlasProjectEditor.snapshot(cwd),
        terminal: window.atlasTerminal.snapshot(cwd),
        url,
      };
      localStorage.setItem(key, JSON.stringify([...read().filter((row) => row.cwd !== cwd), value].slice(-50)));
      status.textContent = 'Workspace saved. Query strings and fragments are excluded from preview addresses.';
    });
    button('Restore file tabs', async () => {
      const row = read().find((item) => item.cwd === cwd);
      if (!row) throw Error('Save a workspace first.');
      const failures = await window.atlasProjectEditor.restore(context, row.editor);
      status.textContent = failures.length
        ? failures.join('\n')
        : 'File tabs restored. Existing unsaved drafts were retained.';
    });
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
