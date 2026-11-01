(() => {
  const api = window.atlas,
    p = window.atlasPower;
  if (!api?.selectedTools || !p) return;
  const field = (host, n, label, type = 'input', value = '') => {
    const wrap = n('label', label),
      input = n(type);
    input.value = value;
    wrap.append(input);
    host.append(wrap);
    return input;
  };
  const pick = (host, n, label, rows) => {
    const input = field(host, n, label, 'select');
    for (const [id, name] of rows) input.append(new Option(name, id));
    return input;
  };
  const plain = (value, indent = '') => {
    if (value === null || value === undefined) return indent + 'Nothing to show.';
    if (value.cancelled) return indent + 'Cancelled.';
    if (typeof value !== 'object') return indent + String(value);
    const rows = Object.entries(value).map(([key, row]) => {
      const name = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      return row && typeof row === 'object'
        ? indent + name + ':\n' + plain(row, indent + '  ')
        : indent + name + ': ' + String(row);
    });
    return rows.join('\n') || indent + 'None.';
  };
  const call = (tool, action, extra = {}) => api.selectedTools({ ...p.request(), tool, action, ...extra });
  function register(name, render, route = 'tasks') {
    p.register(name, async (ui) => {
      ui.body.append(ui.node('h2', name));
      await render(ui);
    });
    window.atlasUi.register(route, name);
  }
  register('Selective changes', async ({ body, node: n, button: b, status }) => {
    body.append(
      n(
        'p',
        'Keep selected diff sections in the task folder. Unselected changes return to their original content; a recovery snapshot is saved.',
      ),
    );
    const jobs = (await api.jobs()).filter((row) => row.changeId && row.status !== 'running'),
      choice = pick(
        body,
        n,
        'Task',
        jobs.map((row) => [row.id, row.prompt?.slice(0, 100) || row.id]),
      ),
      list = n('div');
    body.append(list);
    b('Load files', async () => {
      list.replaceChildren();
      for (const file of (await api.changes({ jobId: choice.value, refresh: true })).files)
        b(
          file.path,
          async () => {
            const value = await api.changes({ jobId: choice.value, action: 'file', path: file.path });
            list.replaceChildren(n('h3', file.path));
            const wanted = new Set();
            for (const [index, hunk] of value.hunks.entries()) {
              const label = n('label', 'Keep section ' + (index + 1)),
                box = n('input');
              box.type = 'checkbox';
              box.checked = true;
              wanted.add(index);
              box.onchange = () => (box.checked ? wanted.add(index) : wanted.delete(index));
              label.prepend(box);
              list.append(label, n('pre', hunk.lines.join('\n')));
            }
            let preview;
            b(
              'Preview selected result',
              async () => {
                preview = await api.changes({
                  jobId: choice.value,
                  path: file.path,
                  action: 'hunks-preview',
                  selected: [...wanted],
                });
                list.append(n('pre', preview.content));
              },
              list,
            );
            b(
              'Apply reviewed selection',
              async () => {
                if (!preview || JSON.stringify(preview.selected) !== JSON.stringify([...wanted]))
                  throw Error('Preview the current selection first.');
                if (!confirm('Save the reviewed selection and remove other hunks from this file?')) return;
                await api.changes({
                  jobId: choice.value,
                  path: file.path,
                  action: 'hunks-apply',
                  selected: preview.selected,
                  version: preview.version,
                });
                status.textContent = 'Saved; recovery snapshot available in Recovery.';
              },
              list,
            );
          },
          list,
        );
    });
  });
  register('Test results', async ({ body, node: n, button: b, status }) => {
    const jobs = (await api.jobs()).filter((row) => row.verification?.results?.length),
      choice = pick(
        body,
        n,
        'Task',
        jobs.map((row) => [row.id, row.prompt?.slice(0, 100) || row.id]),
      ),
      filter = pick(body, n, 'Show', [
        ['all', 'All'],
        ['failed', 'Failed'],
        ['passed', 'Passed'],
        ['skipped', 'Skipped'],
      ]),
      output = n('div');
    body.append(output);
    b('Load test results', async () => {
      output.replaceChildren();
      for (const report of await call('tests', 'read', { jobId: choice.value })) {
        output.append(
          n('h3', report.command),
          n(
            'p',
            report.format + ' · ' + plain(report.summary).replaceAll('\n', ', ') + (report.limited ? ' · limited' : ''),
          ),
        );
        for (const test of report.tests.filter((row) => filter.value === 'all' || row.status === filter.value)) {
          const item = n('details');
          item.append(
            n('summary', test.status + ' · ' + test.name),
            n('pre', test.detail || test.file || 'No detail recorded.'),
          );
          if (test.file)
            b(
              'Open source',
              () =>
                window.atlasProjectFiles.preview(
                  { cwd: jobs.find((row) => row.id === choice.value).cwd },
                  test.file + (test.line ? ':' + test.line : ''),
                ),
              item,
            );
          output.append(item);
        }
      }
      status.textContent = 'TAP, pytest verbose and JUnit supported. Other output stays in the original task report.';
    });
  });
  register('Environment preflight', async ({ body, node: n, button: b }) => {
    const text = field(body, n, 'One supported tool/version per line', 'textarea', 'node >=22\ngit >=2'),
      out = n('pre');
    b(
      'Check versions…',
      async () => (out.textContent = plain(await call('preflight', 'check', { requirements: text.value }))),
    );
    body.append(out);
  });
  register(
    'Backups and recovery',
    async ({ body, node: n, button: b, status }) => {
      body.append(
        n(
          'p',
          'Backups include local chats, settings, memories, attachments and task records. They are compressed, not encrypted. Project worktrees, downloaded runtimes and provider-owned histories are excluded.',
        ),
      );
      const auto = n('label', 'Back up automatically once a day'),
        autoBox = n('input'),
        autoStatus = n('p');
      autoBox.type = 'checkbox';
      auto.prepend(autoBox);
      const showAuto = (row) => {
        autoBox.checked = row.enabled;
        autoStatus.textContent =
          (row.lastAt
            ? 'Last automatic backup: ' + new Date(row.lastAt).toLocaleString()
            : 'No automatic backup yet.') +
          ' Keeps the newest ' +
          row.keep +
          ' while ATLAS is open, in ' +
          row.folder +
          ' on this computer. Choose one with Review and restore backup.' +
          (row.lastError ? ' The last attempt failed: ' + row.lastError : '');
      };
      autoBox.onchange = async () => showAuto(await call('auto-backup', 'set', { enabled: autoBox.checked }));
      body.append(auto, autoStatus);
      showAuto(await call('auto-backup', 'status'));
      b('Export local-record backup…', async () => (status.textContent = plain(await call('backup', 'export'))));
      b('Review and restore backup…', () => call('backup', 'restore'));
      b('Inspect update recovery', async () => (status.textContent = plain(await call('updates', 'status'))));
      b('Launch preserved version and restore data…', () => call('updates', 'rollback'));
      const copies = n('div'),
        chosen = new Set();
      b('Review old recovery copies', async () => {
        const rows = await call('recovery-cleanup', 'inspect');
        chosen.clear();
        copies.replaceChildren();
        for (const row of rows) {
          const label = n(
              'label',
              row.kind +
                ' · ' +
                new Date(row.modified).toLocaleString() +
                ' · ' +
                (row.bytes / 1048576).toFixed(1) +
                ' MiB',
            ),
            box = n('input');
          box.type = 'checkbox';
          box.onchange = () => (box.checked ? chosen.add(row.name) : chosen.delete(row.name));
          label.prepend(box);
          copies.append(label);
        }
        status.textContent = rows.length
          ? rows.length + ' old copies. The copy you can roll back to and your newest pre-restore records are kept.'
          : 'No old recovery copies.';
      });
      b('Delete selected copies…', async () => {
        if (!chosen.size) throw Error('Review and select copies first.');
        const result = await call('recovery-cleanup', 'remove', { names: [...chosen] });
        status.textContent = plain(result);
        if (!result.cancelled) {
          chosen.clear();
          copies.replaceChildren();
        }
      });
      body.append(copies);
    },
    'diagnostics',
  );
  register(
    'Storage manager',
    async ({ body, node: n, button: b, status }) => {
      body.append(
        n(
          'p',
          'Review exact cleanup candidates. Active snapshots, attachments, worktrees and recovery backups are preserved.',
        ),
      );
      const age = pick(body, n, 'Minimum age', [
          ['30', '30 days'],
          ['90', '90 days'],
          ['365', '1 year'],
          ['7', '7 days'],
          ['0', 'Any age'],
        ]),
        out = n('div'),
        selected = new Set();
      let preview;
      body.append(out);
      b('Inspect storage', async () => {
        preview = await call('storage', 'inspect', { days: Number(age.value) });
        selected.clear();
        out.replaceChildren();
        for (const row of preview.totals)
          out.append(
            n('p', row.category + ' · ' + (row.bytes / 1048576).toFixed(1) + ' MiB · ' + row.files + ' files'),
          );
        for (const row of preview.candidates) {
          const label = n('label', row.path + ' · ' + row.size + ' bytes'),
            box = n('input');
          box.type = 'checkbox';
          box.onchange = () => (box.checked ? selected.add(row.path) : selected.delete(row.path));
          label.prepend(box);
          out.append(label);
        }
        status.textContent = preview.candidates.length + ' eligible records.';
      });
      b('Delete reviewed selection…', async () => {
        if (!preview || !selected.size) throw Error('Review and select records first.');
        status.textContent = plain(
          await call('storage', 'remove', { days: preview.days, token: preview.token, paths: [...selected] }),
        );
      });
    },
    'diagnostics',
  );
  register('Services', async ({ body, node: n, button: b }) => {
    body.append(
      n(
        'p',
        'Saved services never start automatically. Each launch runs with your account permissions after approval.',
      ),
    );
    const name = field(body, n, 'Name'),
      command = field(body, n, 'Command'),
      url = field(body, n, 'Loopback readiness URL (optional)'),
      out = n('div');
    body.append(out);
    const refresh = async () => {
      out.replaceChildren();
      for (const row of await call('services', 'list')) {
        const item = n('details');
        item.append(
          n('summary', row.name + ' · ' + row.status + (row.ready ? ' · ready' : '')),
          n('pre', row.output || row.error || row.command),
        );
        for (const [label, action] of [
          ['Start…', 'start'],
          ['Restart…', 'restart'],
          ['Stop', 'stop'],
          ['Check readiness', 'probe'],
          ['Remove definition', 'remove'],
        ])
          b(
            label,
            async () => {
              await call('services', action, { id: row.id });
              await refresh();
            },
            item,
          );
        out.append(item);
      }
    };
    b('Save definition', async () => {
      await call('services', 'save', { name: name.value, command: command.value, url: url.value });
      await refresh();
    });
    b('Refresh services', refresh);
    await refresh();
  });
  register('Git', async ({ body, node: n, button: b, status }) => {
    const message = field(body, n, 'Commit message'),
      out = n('div'),
      diff = n('pre');
    body.append(out, diff);
    const refresh = async () => {
      const value = await call('git', 'status');
      out.replaceChildren(n('h3', value.branch || 'Detached HEAD'));
      for (const row of value.files) {
        const item = n('section');
        item.append(n('p', row.state + ' · ' + row.path));
        for (const [label, action, staged] of [
          ['Working diff', 'diff', false],
          ['Staged diff', 'diff', true],
          ['Stage…', 'stage'],
          ['Unstage…', 'unstage'],
        ])
          b(
            label,
            async () => {
              const value = await call('git', action, { path: row.path, staged });
              if (action === 'diff') diff.textContent = value.text;
              else await refresh();
            },
            item,
          );
        out.append(item);
      }
      out.append(n('h3', 'Recent commits'), n('pre', value.history));
    };
    b('Refresh Git', refresh);
    b('Commit staged changes…', async () => {
      await call('git', 'commit', { message: message.value });
      await refresh();
      status.textContent = 'Local commit completed; nothing pushed.';
    });
    await refresh();
  });
  register(
    'Sensitive context review',
    async ({ body, node: n, button: b, status }) => {
      body.append(
        n(
          'p',
          'Provider requests also ask for review when new heuristic findings appear. Detection cannot identify every private value.',
        ),
      );
      const text = field(body, n, 'Text to inspect', 'textarea', p.request().prompt || ''),
        out = n('pre');
      b('Inspect locally', async () => {
        out.textContent = plain(await call('sensitive', 'inspect', { text: text.value }));
        status.textContent = 'Nothing sent to a provider.';
      });
      body.append(out);
    },
    'diagnostics',
  );
  register('Context selection', async ({ body, node: n, button: b, status }) => {
    const query = field(body, n, 'Task/query', 'textarea', p.request().prompt || ''),
      out = n('div');
    body.append(out);
    b('Preview ranked context', async () => {
      const value = await call('context', 'preview', { query: query.value });
      out.replaceChildren();
      for (const row of value.results) {
        const item = n('details');
        item.append(n('summary', row.path + ' · ' + row.reason), n('pre', row.excerpt));
        out.append(item);
      }
      for (const row of value.contextSelection?.omitted || [])
        out.append(n('p', 'Omitted ' + row.path + ' · ' + row.reason));
      status.textContent = plain(value.contextSelection);
    });
  });
  register('Multi-root workspaces', async ({ body, node: n, button: b }) => {
    body.append(n('p', 'Execution stays in the explicitly opened root. Cross-root search is read-only.'));
    const name = field(body, n, 'Workspace name'),
      roots = field(body, n, 'One root per line: name = absolute folder', 'textarea'),
      out = n('div');
    body.append(out);
    const refresh = async () => {
      out.replaceChildren();
      for (const row of await call('workspaces', 'list')) {
        const item = n('details');
        item.append(n('summary', row.name));
        for (const root of row.roots) {
          b(
            'Open ' + root.name,
            () => {
              if (document.body.dataset.workspace === 'colab')
                window.atlasColab.applyProfile({ cwd: root.cwd, name: root.name, id: '' });
              else {
                window.atlasAssistant.newChat();
                setPath(root.cwd);
              }
              p.close();
            },
            item,
          );
          item.append(n('p', root.cwd));
        }
        const query = field(item, n, 'Search all roots');
        b(
          'Search workspace',
          async () => {
            for (const group of await call('workspaces', 'search', { id: row.id, query: query.value }))
              item.append(
                n('h3', group.root.name),
                n('pre', group.results.map((row) => row.path + ':' + row.line + '\n' + row.excerpt).join('\n\n')),
              );
          },
          item,
        );
        out.append(item);
      }
    };
    b('Save workspace', async () => {
      await call('workspaces', 'save', {
        name: name.value,
        roots: roots.value
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const at = line.indexOf('=');
            if (at < 1) throw Error('Use name = absolute folder.');
            return { name: line.slice(0, at).trim(), cwd: line.slice(at + 1).trim() };
          }),
      });
      await refresh();
    });
    await refresh();
  });
  register('Task dependencies', async ({ body, node: n, button: b, status }) => {
    const state = await api.taskQueue();
    const graph = n('div');
    body.append(graph);
    window.atlasTaskGraph?.render(graph, state);
    for (const [index, row] of state.items.entries()) {
      const item = n('section');
      item.append(n('h3', row.prompt.slice(0, 100)), n('p', row.status));
      if (row.status === 'queued' && !row.batchId) {
        const choice = pick(
          item,
          n,
          'Required earlier tasks',
          state.items
            .slice(0, index)
            .filter((other) => other.cwd === row.cwd)
            .map((other) => [other.id, other.prompt.slice(0, 80)]),
        );
        choice.multiple = true;
        for (const option of choice.options) option.selected = row.prerequisites?.includes(option.value);
        b(
          'Save dependencies',
          async () => {
            await api.taskQueue({
              action: 'dependencies',
              id: row.id,
              prerequisites: [...choice.selectedOptions].map((option) => option.value),
            });
            await p.show('Task dependencies');
          },
          item,
        );
      }
      for (const id of row.prerequisites || [])
        item.append(n('p', '← ' + (state.items.find((row) => row.id === id)?.prompt || id)));
      body.append(item);
    }
    if (!state.items.length) body.append(n('p', 'Add tasks in Queue to connect them here.'));
    status.textContent =
      'Earlier, same-project prerequisites prevent cycles. A failed prerequisite blocks its dependents.';
  });
  register('Document context', async ({ body, node: n, button: b, status }) => {
    const ids = p.request().attachments || [],
      choice = pick(
        body,
        n,
        'PDF/DOCX attachment',
        ids.map((id) => [id, id]),
      ),
      pages = field(body, n, 'PDF page numbers, comma separated (blank: first 30)'),
      out = n('div');
    body.append(out);
    let reviewed;
    const args = () => ({
      id: choice.value,
      pages: pages.value.trim() ? pages.value.split(',').map((value) => Number(value.trim())) : undefined,
    });
    b('Preview document text', async () => {
      const value = await call('document', 'preview', args());
      reviewed = JSON.stringify(args());
      out.replaceChildren(n('p', value.note));
      for (const page of value.pages)
        out.append(n('h3', 'Page ' + page.number), n('pre', page.text || '(No extractable text)'));
    });
    b('Attach only reviewed page text', async () => {
      if (reviewed !== JSON.stringify(args())) throw Error('Preview this selection first.');
      const values = await call('document', 'attach-selection', args());
      await window.atlasWorkspace.addAttachments(p.request().scope, values);
      status.textContent =
        'Selected text attached as a separate unsent file. Remove the original document to send only this selection.';
    });
  });
  register('API requests', async ({ body, node: n, button: b }) => {
    body.append(
      n(
        'p',
        'One-time headers are not saved. Saved URLs/bodies may contain private data. Redirects are blocked; every send needs approval.',
      ),
    );
    const name = field(body, n, 'Name'),
      method = pick(
        body,
        n,
        'Method',
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map((x) => [x, x]),
      ),
      url = field(body, n, 'URL'),
      bodyText = field(body, n, 'Body', 'textarea'),
      headers = field(body, n, 'One-time headers JSON', 'textarea', '{}'),
      list = n('div'),
      response = n('pre');
    body.append(list, response);
    const refresh = async () => {
      list.replaceChildren();
      for (const row of await call('http', 'list')) {
        b(
          row.method + ' ' + row.name,
          () => {
            name.dataset.id = row.id;
            name.value = row.name;
            method.value = row.method;
            url.value = row.url;
            bodyText.value = row.body;
          },
          list,
        );
        b(
          'Send ' + row.name + '…',
          async () => {
            response.textContent = JSON.stringify(
              await call('http', 'send', { id: row.id, headers: headers.value }),
              null,
              2,
            );
            headers.value = '{}';
          },
          list,
        );
      }
    };
    b('Save locally', async () => {
      await call('http', 'save', {
        id: name.dataset.id,
        name: name.value,
        method: method.value,
        url: url.value,
        body: bodyText.value,
      });
      await refresh();
    });
    await refresh();
  });
  register('Integration manifests', async ({ body, node: n, button: b, status }) => {
    body.append(
      n(
        'p',
        'Access declarations are informational, not an OS sandbox. Inspect executable targets, endpoints and tool schemas before granting calls.',
      ),
    );
    for (const row of await call('manifest', 'list')) {
      const item = n('details');
      item.append(n('summary', row.name + ' · ' + row.transport), n('pre', JSON.stringify(row, null, 2)));
      const filesystem = field(item, n, 'Filesystem declaration', 'textarea', row.declared.filesystem),
        network = field(item, n, 'Network declaration', 'textarea', row.declared.network),
        execution = field(item, n, 'Execution declaration', 'textarea', row.declared.execution);
      b(
        'Save declarations',
        async () => {
          const current = (await api.integrations({})).integrations.find((value) => value.id === row.id);
          await api.integrations({
            action: 'save',
            integration: {
              ...current,
              permissions: { filesystem: filesystem.value, network: network.value, execution: execution.value },
            },
          });
          status.textContent = 'Saved locally. No permissions granted.';
        },
        item,
      );
      body.append(item);
    }
  });
})();
