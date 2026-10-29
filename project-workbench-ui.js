(() => {
  const api = window.atlas,
    power = window.atlasPower;
  const context = () => ({
    cwd:
      document.body.dataset.workspace === 'colab'
        ? window.atlasColab.current().cwd
        : typeof cwd === 'string'
          ? cwd
          : '',
  });
  power.register('Project health', async ({ body, node, button, status, current }) => {
    body.append(
      node('h2', 'Check this project before starting work'),
      node(
        'p',
        'Checks installed tools, project manifests and dependency folders. Project commands run only through the existing approval flow.',
      ),
    );
    const result = node('div');
    body.append(result);
    button('Run local health check', async () => {
      status.textContent = 'Checking local tools…';
      const value = await api.projectWorkbench({ ...context(), action: 'health' });
      if (!current()) return;
      result.replaceChildren(
        node('h3', value.name),
        node('p', value.types.join(', ') || 'No recognised project manifest'),
      );
      for (const row of value.results) result.append(node('h3', row.name + ' · ' + row.status), node('p', row.detail));
      result.append(
        node('h3', 'Suggested checks'),
        node('pre', value.checks.join('\n') || 'No checks detected.'),
        node('p', value.note),
      );
      status.textContent = 'Health check complete.';
    });
  });
  power.register('Named checkpoints', async ({ body, node, button, current, status }) => {
    const input = context();
    body.append(
      node('h2', 'Named project checkpoints'),
      node(
        'p',
        'Save a local text-file snapshot before a larger change. Binary and large files require Git. Review and select files before restoring; a recovery checkpoint is kept.',
      ),
    );
    const name = node('input');
    name.placeholder = 'Checkpoint name';
    name.setAttribute('aria-label', 'Checkpoint name');
    body.append(name);
    const list = node('div');
    const refresh = async () => {
      const rows = await api.projectWorkbench({ ...input, action: 'list' });
      if (!current()) return;
      list.replaceChildren();
      for (const row of rows.slice().reverse()) {
        const box = node('details');
        box.append(node('summary', row.name + ' · ' + new Date(row.createdAt).toLocaleString()));
        list.append(box);
        button(
          'Delete this saved checkpoint',
          async () => {
            await api.projectWorkbench({ ...input, id: row.id, action: 'remove' });
            status.textContent = 'Checkpoint deleted; project files were preserved.';
            await refresh();
          },
          box,
        );
        button(
          'Review changed files',
          async () => {
            const report = await api.projectWorkbench({ ...input, id: row.id, action: 'report' });
            const selection = node('section');
            box.append(selection);
            selection.append(
              node(
                'p',
                report.limited
                  ? 'Partial snapshot: some files were excluded or exceeded limits.'
                  : 'Select files to restore.',
              ),
            );
            const chosen = [];
            for (const file of report.files) {
              const label = node('label'),
                check = node('input');
              check.type = 'checkbox';
              check.checked = true;
              label.append(check, node('span', file.path + ' · ' + file.status));
              selection.append(label);
              chosen.push({ check, path: file.path });
              button(
                'Compare checkpoint and current file',
                async () => {
                  const value = await api.projectWorkbench({ ...input, id: row.id, action: 'file', path: file.path });
                  selection.append(
                    node(
                      'pre',
                      file.path +
                        '\n\nCheckpoint:\n' +
                        (value.originalContent ?? '(absent, binary or unavailable)') +
                        '\n\nCurrent:\n' +
                        (value.content ?? '(absent, binary or unavailable)'),
                    ),
                  );
                },
                selection,
              );
            }
            if (!chosen.length) selection.append(node('p', 'No changes since this checkpoint.'));
            else
              button(
                'Review selected restore',
                async () => {
                  const preview = await api.projectWorkbench({
                    ...input,
                    id: row.id,
                    action: 'preview',
                    files: chosen.filter((row) => row.check.checked).map((row) => row.path),
                  });
                  const confirm = node('section');
                  confirm.append(
                    node('h3', 'Restore confirmation'),
                    node('pre', preview.files.join('\n') || 'No files selected.'),
                  );
                  selection.append(confirm);
                  if (preview.files.length)
                    button(
                      'Restore these files',
                      async () => {
                        const restored = await api.projectWorkbench({
                          ...input,
                          id: row.id,
                          action: 'restore',
                          token: preview.token,
                        });
                        status.textContent = restored.message;
                        await refresh();
                      },
                      confirm,
                    );
                },
                selection,
              );
          },
          box,
        );
      }
      if (!rows.length) list.append(node('p', 'No named checkpoints for this project.'));
    };
    button('Create checkpoint', async () => {
      await api.projectWorkbench({ ...input, action: 'capture', name: name.value });
      name.value = '';
      status.textContent = 'Checkpoint saved locally.';
      await refresh();
    });
    body.append(list);
    await refresh();
  });
  window.atlasUi.register('tasks', 'Named checkpoints');
  window.atlasUi.register('diagnostics', 'Project health');
  for (const scope of ['assistant', 'colab']) {
    const menu = document.getElementById('attachmentMenu-' + scope);
    if (!menu) continue;
    window.atlasUi.actionButton(
      'Project health',
      () => {
        menu.hidePopover();
        power.show('Project health');
      },
      menu,
    );
    window.atlasUi.actionButton(
      'Named checkpoints',
      () => {
        menu.hidePopover();
        power.show('Named checkpoints');
      },
      menu,
    );
  }
})();
