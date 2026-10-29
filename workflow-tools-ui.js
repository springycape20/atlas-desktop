(() => {
  const api = window.atlas,
    power = window.atlasPower;
  if (!power || !api.workflowTools) return;
  power.register('Permissions', async ({ body, node, button, status, current }) => {
    const [desktop, shell] = await Promise.all(
      ['desktop-permissions', 'shell-permissions'].map((action) => api.integrations({ action })),
    );
    if (!current()) return;
    body.append(
      node('h2', 'Remembered chat permissions'),
      node(
        'p',
        'Revoke a remembered grant to require approval for future actions. Revocation cannot undo actions already completed. Chat identifiers are shown so grants remain recognisable even after a chat is deleted.',
      ),
    );
    for (const [title, rows, action] of [
      ['Screen control', desktop, 'revoke-desktop'],
      ['PowerShell without routine prompts', shell, 'revoke-shell'],
    ]) {
      body.append(node('h3', title));
      if (!rows.length) body.append(node('p', 'No remembered grants.'));
      for (const row of rows) {
        const line = node('section');
        line.append(node('p', row.owner + ' · granted ' + new Date(row.grantedAt).toLocaleString()));
        button(
          'Revoke ' + row.owner,
          async () => {
            await api.integrations({ action, owner: row.owner });
            await power.show('Permissions');
          },
          line,
        );
        body.append(line);
      }
    }
    button('Revoke all remembered grants', async () => {
      await api.integrations({ action: 'revoke-desktop' });
      await api.integrations({ action: 'revoke-shell' });
      await power.show('Permissions');
    });
    status.textContent =
      'Screen and shell permissions are independent. No permissions can be granted from this dashboard.';
  });
  power.register('Diagnostic bundle', async ({ body, node, button, status }) => {
    body.append(
      node('h2', 'Prepare a local diagnostic bundle'),
      node(
        'p',
        'Nothing is uploaded. Basic app information and failed check statuses are included. Optional output is redacted on a best effort basis; review the exact bundle before sharing.',
      ),
    );
    const toggle = (text) => {
      const label = node('label', text),
        box = node('input');
      box.type = 'checkbox';
      label.prepend(box);
      body.append(label);
      return box;
    };
    const logs = toggle('Include recent application logs'),
      output = toggle('Include failed check commands and output'),
      preview = node('pre');
    let draft;
    const invalidate = () => {
      draft = null;
      preview.textContent = '';
      status.textContent = 'Options changed. Prepare a new preview.';
    };
    logs.onchange = output.onchange = invalidate;
    button('Preview bundle', async () => {
      draft = await api.workflowTools({
        action: 'diagnostic-preview',
        includeLogs: logs.checked,
        includeOutput: output.checked,
      });
      preview.textContent = draft.text;
      status.textContent = 'Review all contents below, then export if appropriate.';
    });
    button('Export reviewed bundle', async () => {
      if (!draft) throw Error('Preview the bundle first.');
      const result = await api.workflowTools({ action: 'diagnostic-export', id: draft.id });
      status.textContent = result.exported ? 'Saved locally. Nothing was sent.' : 'Export cancelled.';
    });
    body.append(preview);
  });
  power.register('Task comparison', async ({ body, node, button, current }) => {
    const jobs = (await api.jobs()).filter((job) => job.endedAt);
    if (!current()) return;
    body.append(
      node('h2', 'Compare two completed attempts'),
      node(
        'p',
        'Diffs compare the current working files with each task’s starting checkpoint. Later project edits affect these diffs. Reported usage is shown only when the provider supplied it; account limits and billing are unavailable.',
      ),
    );
    const choose = (label) => {
      const wrap = node('label', label),
        select = node('select');
      for (const job of jobs) select.append(new Option((job.prompt || job.id).slice(0, 100), job.id));
      wrap.append(select);
      body.append(wrap);
      return select;
    };
    const left = choose('First task'),
      right = choose('Second task');
    if (jobs.length > 1) right.selectedIndex = 1;
    const results = node('div');
    results.className = 'task-comparison-grid';
    button('Compare', async () => {
      if (!left.value || left.value === right.value) throw Error('Choose two different completed tasks.');
      const rows = await api.workflowTools({ action: 'compare', ids: [left.value, right.value] });
      results.replaceChildren();
      for (const row of rows) {
        const column = node('section');
        column.append(
          node('h3', row.title),
          node(
            'p',
            row.provider +
              ' · ' +
              row.status +
              ' · ' +
              (row.durationMs === null
                ? 'duration unavailable'
                : Math.round(row.durationMs / 1000) +
                  (Math.round(row.durationMs / 1000) === 1 ? ' second' : ' seconds')),
          ),
          node(
            'p',
            'Reported tokens: ' +
              (row.usage
                ? Object.entries(row.usage)
                    .map(([key, value]) => (key === 'inputTokens' ? 'input' : 'output') + ' ' + value.toLocaleString())
                    .join(' · ')
                : 'unavailable'),
          ),
          node('p', 'Checks: ' + row.checks.status),
        );
        for (const check of row.checks.results || []) {
          const details = node('details');
          details.append(
            node('summary', check.status + ' · ' + check.command),
            node('pre', check.output || check.error || 'No output'),
          );
          column.append(details);
        }
        if (!row.diff) column.append(node('p', 'Diff unavailable: no accessible task checkpoint.'));
        else {
          column.append(
            node(
              'p',
              row.diff.files.length +
                ' changed files · checked ' +
                new Date(row.diff.checkedAt).toLocaleString() +
                (row.diff.limited ? ' · limited snapshot' : ''),
            ),
          );
          for (const file of row.diff.files) {
            const details = node('details');
            details.append(
              node(
                'summary',
                file.path + ' · ' + file.status + ' · +' + (file.added || 0) + ' −' + (file.removed || 0),
              ),
              node(
                'pre',
                file.hunks?.map((hunk) => hunk.lines.join('\n')).join('\n\n') || 'Binary, large or complex diff.',
              ),
            );
            column.append(details);
          }
        }
        results.append(column);
      }
    });
    body.append(results);
  });
  window.atlasUi.register('tasks', 'Permissions');
  window.atlasUi.register('tasks', 'Task comparison');
  window.atlasUi.register('diagnostics', 'Diagnostic bundle');
  const section = [...document.querySelectorAll('#settingsDialog .setting-section')].find(
    (section) => section.querySelector('h3')?.textContent === 'Permissions',
  );
  if (section)
    power.button(
      'Review remembered chat grants',
      () => {
        document.getElementById('settingsDialog').close();
        window.atlasUi.open('tasks', 'Permissions');
      },
      section,
    );
})();
