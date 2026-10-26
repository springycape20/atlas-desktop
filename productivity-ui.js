(() => {
  const api = window.atlas;
  if (!api?.taskQueue) return;
  const el = (tag, text, cls) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const modal = el('dialog', undefined, 'workspace-dialog productivity-dialog');
  modal.setAttribute('aria-label', 'ATLAS workbench');
  const header = el('header'),
    title = el('h2', 'Workbench'),
    tabs = el('nav', undefined, 'workspace-actions'),
    body = el('div', undefined, 'workspace-dialog-body'),
    status = el('footer');
  status.setAttribute('role', 'status');
  header.append(title);
  modal.append(header, tabs, body, status);
  document.body.append(modal);
  let page = 'Queue',
    generation = 0,
    queueState,
    pending = [],
    jobRows = [];
  function button(text, action, parent = body) {
    const node = el('button', text, 'quiet-button');
    node.type = 'button';
    node.onclick = async () => {
      node.disabled = true;
      try {
        await action();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        node.disabled = false;
      }
    };
    parent.append(node);
    return node;
  }
  button('Close', () => modal.close(), header);
  const sections = {
    Queue: showQueue,
    Tools: showIntegrations,
    Plugins: showPlugins,
    'Project setup': showSetup,
    Search: showSearch,
    Checkpoints: showCheckpoints,
    Approvals: showApprovals,
  };
  for (const name of Object.keys(sections)) button(name, () => open(name), tabs);
  async function open(name) {
    page = name;
    title.textContent = name;
    body.replaceChildren();
    status.textContent = '';
    const version = ++generation;
    if (!modal.open) modal.showModal();
    try {
      await sections[name](version);
    } catch (error) {
      if (version === generation) status.textContent = error.message;
    }
  }
  const navButton = button('Workbench', () => open('Queue'), document.querySelector('.workspace-nav'));
  navButton.className = 'nav-item';
  const workbenchIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  }))
    workbenchIcon.setAttribute(key, value);
  const workbenchPath = document.createElementNS(workbenchIcon.namespaceURI, 'path');
  workbenchPath.setAttribute('d', 'M4 8h16v12H4zM9 8V4h6v4M4 13h16M10 13v3h4v-3');
  workbenchIcon.append(workbenchPath);
  navButton.prepend(workbenchIcon);
  const settingsSection = [...document.querySelectorAll('#settingsDialog .setting-section')].find(
    (section) => section.querySelector('h3')?.textContent === 'Tools and data',
  );
  if (settingsSection) button('Installed plugins and tools', () => open('Plugins'), settingsSection);
  const alertButton = button('Approvals', () => open('Approvals'), document.body);
  alertButton.className = 'approval-alert';
  alertButton.hidden = true;
  const style = el('style');
  style.textContent =
    '.productivity-dialog{box-sizing:border-box;height:min(680px,90vh);overflow:hidden}.productivity-dialog[open]{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto}.productivity-dialog>.workspace-dialog-body{min-height:0;max-height:none;overflow:auto}.productivity-dialog>footer{max-height:80px;overflow:auto}.productivity-dialog>nav{padding:8px 16px;margin:0;border-bottom:1px solid #29414a}.productivity-dialog>nav button{font-size:11px;padding:6px 10px}.productivity-dialog p{font:12px/1.6 Segoe UI,sans-serif;overflow-wrap:anywhere}.productivity-dialog select,.productivity-dialog textarea{box-sizing:border-box}.workbench-row{padding:12px 0;border-bottom:1px solid #29414a}.workbench-row h3{margin:0 0 5px}.workbench-row pre{max-height:28vh}.workbench-row details{margin-top:8px;font-size:12px}.workbench-state{color:#8bcec1}.verify-state[data-level=failed]{color:#f39a8b}.verify-state[data-level=partial],.verify-state[data-level=unverified]{color:#f0c48f}.approval-alert{position:fixed;right:18px;bottom:55px;z-index:40;background:#604321;color:#ffe0ad;border:1px solid #b58649;border-radius:9px;padding:10px 14px;cursor:pointer}.approval-alert[hidden]{display:none}.workbench-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.productivity-dialog label:has(input[type=checkbox]){display:flex;align-items:center;gap:8px}.productivity-dialog input[type=checkbox]{width:auto}.workbench-result{width:100%;text-align:left;margin:4px 0}.workbench-queue-form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 12px}.workbench-queue-form label:has(textarea){grid-column:1/-1}.workbench-queue-form>button{width:fit-content}.workbench-queue-form input:disabled,.workbench-queue-form select:disabled{opacity:.5}@media(max-width:650px){.workbench-queue-form{grid-template-columns:1fr}}.workbench-message{color:#a9c3cd;font-size:12px}';
  document.head.append(style);
  const row = (name, detail) => {
    const node = el('section', undefined, 'workbench-row');
    node.append(el('h3', name));
    if (detail) node.append(el('p', detail));
    body.append(node);
    return node;
  };
  const field = (label, type = 'input', parent = body) => {
    const wrap = el('label', label),
      input = el(type);
    wrap.append(input);
    parent.append(wrap);
    return input;
  };
  const select = (label, options, parent = body) => {
    const input = field(label, 'select', parent);
    for (const [value, text] of options) input.append(new Option(text, value));
    return input;
  };
  function verification(node, job) {
    const verification = job.verification || job.result?.verification,
      badge = job.verificationBadge || job.result?.verificationBadge;
    if (badge?.label) {
      const row = el('p', badge.label + ' · ' + (badge.reason || ''), 'workbench-state verify-state');
      row.dataset.level = String(badge.level || '');
      node.append(row);
    }
    node.append(el('p', 'Completion checks: ' + (verification?.status || 'not checked'), 'workbench-state'));
    if (verification?.reason) node.append(el('p', verification.reason));
    for (const result of verification?.results || []) {
      const details = el('details');
      details.append(
        el('summary', result.status + ' · ' + result.command),
        el('pre', (result.output || result.error || 'No output') + '\nExit: ' + result.exitCode),
      );
      node.append(details);
    }
    // Assistant tasks and Colab tasks both show the once-per-project offer here until it is answered.
    if (job.checkOffer && !job.checkOffer.answered && window.atlasCheckOffer)
      node.append(
        window.atlasCheckOffer.card(job.checkOffer, {
          jobId: job.id,
          toast: (text) => (status.textContent = text),
          onAnswered: (state) => {
            if (state === 'enabled') {
              status.textContent = 'Completion checks are on for this project.';
              void window.atlasWorkspace?.refreshProfiles?.();
            }
          },
        }),
      );
  }
  async function showQueue(version) {
    const [state, profiles] = await Promise.all([api.taskQueue(), api.projects()]);
    if (version !== generation) return;
    queueState = state;
    const controls = el('div', undefined, 'workspace-actions');
    body.append(controls);
    const pauseLabel = el('label', 'Pause between tasks'),
      pause = el('input');
    pause.type = 'checkbox';
    pause.checked = state.pauseBetween;
    pauseLabel.prepend(pause);
    body.append(pauseLabel);
    const concurrency = select(
      'Run at once',
      [
        ['1', 'One task at a time'],
        ['2', 'Up to 2 Colab tasks'],
        ['3', 'Up to 3 Colab tasks'],
      ],
      body,
    );
    concurrency.value = String(state.concurrency || 1);
    concurrency.onchange = () => void api.taskQueue({ action: 'concurrency', value: Number(concurrency.value) });
    button(
      'Start / continue',
      async () => {
        await api.taskQueue({ action: 'start', pauseBetween: pause.checked, concurrency: Number(concurrency.value) });
        await open('Queue');
      },
      controls,
    );
    button(
      'Pause queue',
      async () => {
        await api.taskQueue({ action: 'pause' });
        await open('Queue');
      },
      controls,
    );
    const stateText = el('p', queueSummary(state), 'workbench-state');
    stateText.id = 'queueState';
    body.append(stateText);
    const form = el('form', undefined, 'workbench-queue-form'),
      project = select('Project', [['', 'Choose a saved project'], ...profiles.map((p) => [p.id, p.name])], form),
      provider = select(
        'Run with',
        [
          ['assistant', 'Assistant'],
          ['colab', 'Colab'],
        ],
        form,
      ),
      roles = select(
        'Colab roles',
        [
          ['codex-builds', 'Codex builds · Claude reviews'],
          ['claude-builds', 'Claude builds · Codex reviews'],
          ['proposals', 'Compare proposals, then build'],
        ],
        form,
      ),
      task = field('Task', 'textarea', form);
    task.rows = 2;
    task.maxLength = 20000;
    const waitLabel = el(
        'label',
        'Wait for the task above (start after it finishes and its changes are applied or discarded)',
      ),
      wait = el('input');
    wait.type = 'checkbox';
    waitLabel.prepend(wait);
    form.append(waitLabel);
    roles.disabled = true;
    provider.onchange = () => (roles.disabled = provider.value !== 'colab');
    button(
      'Add task',
      async () => {
        const selected = profiles.find((p) => p.id === project.value);
        if (!selected) throw Error('Choose a saved project. Use Project setup to create one.');
        await api.taskQueue({
          action: 'add',
          task: {
            prompt: task.value,
            cwd: selected.cwd,
            profileId: selected.id,
            provider: provider.value,
            roles: roles.value,
            waitForPrevious: wait.checked,
          },
        });
        await open('Queue');
      },
      form,
    );
    body.append(form);
    const list = el('div');
    list.id = 'queueItems';
    body.append(list);
    renderQueueItems(list, state);
    status.textContent =
      'Tasks start in order. Colab tasks can run side by side (up to the Run at once limit), each in its own isolated checkout; Assistant tasks edit the folder directly and always run alone. Pause stops new tasks from starting; stop a running task in Tasks. The queue always pauses after restarting ATLAS.';
  }
  function queueSummary(state) {
    const active = state.items.filter((item) => item.status === 'running').length;
    return (
      (state.paused ? 'Queue paused.' : 'Queue running.') +
      (active ? ' ' + active + (active === 1 ? ' task' : ' tasks') + ' running.' : '')
    );
  }
  function renderQueueItems(list, state) {
    list.replaceChildren();
    for (const item of state.items) {
      const node = el('section', undefined, 'workbench-row');
      node.append(
        el('h3', item.prompt),
        el(
          'p',
          item.provider +
            ' · ' +
            item.status +
            (item.waitForPrevious ? ' · waits for the task above' : '') +
            ' · ' +
            item.cwd,
        ),
      );
      if (item.error) node.append(el('p', item.error));
      const actions = el('div', undefined, 'workspace-actions');
      node.append(actions);
      if (item.status === 'queued')
        button(
          item.waitForPrevious ? "Don't wait for the task above" : 'Wait for the task above',
          async () => {
            await api.taskQueue({ action: 'wait', id: item.id, wait: !item.waitForPrevious });
            await open('Queue');
          },
          actions,
        );
      if (item.status === 'queued')
        for (const [text, direction] of [
          ['Move up', 'up'],
          ['Move down', 'down'],
        ])
          button(
            text,
            async () => {
              await api.taskQueue({ action: 'move', id: item.id, direction });
              await open('Queue');
            },
            actions,
          );
      if (['failed', 'interrupted'].includes(item.status))
        button(
          'Retry after review',
          async () => {
            await api.taskQueue({ action: 'retry', id: item.id });
            await open('Queue');
          },
          actions,
        );
      if (item.result?.jobId) button('View result', () => showTask(item.result.jobId), actions);
      if (item.status !== 'running')
        button(
          'Remove',
          async () => {
            await api.taskQueue({ action: 'remove', id: item.id });
            await open('Queue');
          },
          actions,
        );
      list.append(node);
    }
    if (!state.items.length) list.append(el('p', 'No queued tasks yet.'));
  }
  async function showPlugins(version) {
    button('Add or start tools for Colab', () => open('Tools'));
    body.append(
      el(
        'p',
        'Uses the plugins already installed for each provider. Claude toggles change its shared configuration. Start a new chat after changing plugins.',
      ),
    );
    status.textContent = 'Scanning providers…';
    const result = await api.plugins({ cwd: typeof cwd === 'string' ? cwd : undefined });
    if (version !== generation) return;
    for (const plugin of result.plugins) {
      const node = row(plugin.name, plugin.provider + ' · ' + plugin.version + ' · ' + plugin.status);
      if (plugin.provider === 'claude')
        button(
          plugin.enabled ? 'Disable in Claude' : 'Enable in Claude',
          async () => {
            await api.plugins({
              action: 'toggle',
              provider: plugin.provider,
              id: plugin.id,
              enabled: !plugin.enabled,
              cwd: typeof cwd === 'string' ? cwd : undefined,
            });
            await open('Plugins');
          },
          node,
        );
    }
    for (const app of result.apps)
      row(
        app.name,
        'Codex connector · ' +
          (app.callable ? 'Ready' : app.enabled ? 'Needs connection or provider support' : 'Disabled'),
      );
    for (const server of result.servers) {
      const node = row(server.name, 'MCP · ' + server.authStatus + ' · ' + server.tools + ' tools');
      if (/notloggedin|not_logged_in/i.test(server.authStatus || ''))
        button(
          'Connect',
          async () => {
            const result = await api.pluginConnect({ name: server.name });
            await api.openLink(result.url);
          },
          node,
        );
    }
    if (result.skills.length) {
      const details = el('details');
      details.append(
        el('summary', result.skills.length + ' available Codex skills'),
        el('pre', result.skills.map((skill) => (skill.enabled ? '✓ ' : '– ') + skill.name).join('\n')),
      );
      body.append(details);
    }
    button('Refresh', () => open('Plugins'));
    status.textContent =
      result.errors.join('\n') ||
      'Provider plugins discovered. Availability can vary by project and provider permissions.';
  }
  async function showIntegrations(version) {
    button('Revoke all remembered screen permissions', async () => {
      await api.integrations({ action: 'revoke-desktop' });
      await open('Tools');
    });
    body.append(
      el(
        'p',
        'Tools added here are available to Assistant and Colab. Colab can start enabled integrations when needed, and can request to add Windows computer control. Screen/input control can be remembered per chat; other tools still ask for approval. Read-only reviews cannot control apps.',
      ),
    );
    status.textContent = 'Checking integrations…';
    const result = await api.integrations();
    if (version !== generation) return;
    if (!result?.integrations) {
      status.textContent = 'Restart ATLAS to load tools support.';
      return;
    }
    if (result.windowsAvailable && !result.integrations.some((item) => item.id === 'windows')) {
      const node = row(
        'Windows computer control',
        'Inspect windows, open apps, click, type and capture the screen using Windows-MCP. Starting it may download Python 3.14 and Windows-MCP.',
      );
      button(
        'Add Windows control',
        async () => {
          await api.integrations({ action: 'save', integration: result.preset });
          await open('Tools');
        },
        node,
      );
      button('About Windows-MCP', () => api.openLink('https://github.com/CursorTouch/Windows-MCP'), node);
    }
    if (result.windowsAvailable && !result.runtimeInstalled) {
      const node = row(
        'Windows tool runtime',
        'Downloads uv from astral.sh into ATLAS data. Your system PATH is unchanged.',
      );
      button(
        'Install runtime',
        async () => {
          status.textContent = 'Installing uv… This may take a few minutes.';
          await api.integrations({ action: 'install' });
          await open('Tools');
        },
        node,
      );
      button(
        'Download instructions',
        () => api.openLink('https://docs.astral.sh/uv/getting-started/installation/'),
        node,
      );
    }
    for (const item of result.integrations) {
      const node = row(
        item.name,
        (item.enabled ? 'Enabled' : 'Disabled') +
          ' · ' +
          item.status +
          ' · ' +
          item.tools +
          ' tools' +
          (item.error ? ' · ' + item.error : ''),
      );
      if (item.runtime)
        node.append(
          el(
            'p',
            item.runtime.name +
              ' · source ' +
              item.runtime.revision.slice(0, 12) +
              (item.runtime.serverVersion ? ' · server ' + item.runtime.serverVersion : ''),
          ),
        );
      button(
        item.enabled ? 'Disable' : 'Enable',
        async () => {
          await api.integrations({ action: 'enable', id: item.id, enabled: !item.enabled });
          await open('Tools');
        },
        node,
      );
      if (item.enabled)
        button(
          item.status === 'Ready' ? 'Check connection' : 'Start / check',
          async () => {
            status.textContent = 'Starting ' + item.name + '… First launch may download dependencies.';
            await api.integrations({ action: 'start', id: item.id });
            await open('Tools');
          },
          node,
        );
      if (item.status === 'Ready' || item.status === 'Starting')
        button(
          'Stop and disable',
          async () => {
            await api.integrations({ action: 'stop', id: item.id });
            await open('Tools');
          },
          node,
        );
      button(
        'Remove',
        async () => {
          await api.integrations({ action: 'remove', id: item.id });
          await open('Tools');
        },
        node,
      );
    }
    const custom = el('details');
    custom.append(el('summary', 'Add another MCP integration'));
    body.append(custom);
    const id = field('ID (lowercase, e.g. browser)', 'input', custom),
      name = field('Display name', 'input', custom),
      command = field('Executable (for a local stdio server)', 'input', custom),
      args = field('Arguments as a JSON array', 'input', custom),
      url = field('Or a streamable HTTP MCP URL', 'input', custom);
    args.value = '[]';
    custom.append(
      el(
        'p',
        'Only add a server you trust. Starting a local server runs its executable on this computer. Use existing provider connections for integrations requiring OAuth or secret headers.',
      ),
    );
    button(
      'Add integration',
      async () => {
        await api.integrations({
          action: 'save',
          integration: {
            id: id.value.trim(),
            name: name.value.trim(),
            command: command.value.trim(),
            args: JSON.parse(args.value || '[]'),
            url: url.value.trim(),
            enabled: true,
          },
        });
        await open('Tools');
      },
      custom,
    );
    button('Refresh', () => open('Tools'));
    status.textContent =
      'Enabled tools start on demand and stay running until stopped or ATLAS closes. Approval bypass does not bypass ATLAS tool approvals.';
  }
  async function showSetup(version) {
    const folderLabel = el('p', 'Choose an existing or empty project folder.');
    body.append(folderLabel);
    button('Choose folder', async () => {
      const folder = await api.pickFolder();
      if (!folder) return;
      status.textContent = 'Inspecting project…';
      const info = await api.projectSetup({ cwd: folder });
      if (version !== generation) return;
      body.replaceChildren();
      body.append(el('p', info.cwd), el('p', 'Detected: ' + (info.types.join(', ') || 'New project')));
      const name = field('Project name');
      name.value = info.name;
      const instructions = field('Project instructions', 'textarea');
      instructions.rows = 3;
      const checks = field('Completion checks (one command per line)', 'textarea');
      checks.rows = 4;
      checks.value = info.checks.join('\n');
      const autoLabel = el('label', 'Run these checks automatically after tasks'),
        auto = el('input');
      auto.type = 'checkbox';
      autoLabel.prepend(auto);
      body.append(autoLabel);
      const gitLabel = el('label', 'Create a local Git repository and initial snapshot'),
        git = el('input');
      git.type = 'checkbox';
      git.checked = !info.repository.exists || !info.repository.hasCommit;
      git.disabled = info.repository.exists && info.repository.hasCommit;
      gitLabel.prepend(git);
      body.append(gitLabel);
      if (info.installs.length) {
        body.append(
          el('p', 'Suggested dependency commands (review before running):'),
          el('pre', info.installs.join('\n')),
        );
        button('Copy dependency commands', () => navigator.clipboard.writeText(info.installs.join('\n')));
      }
      button('Save project', async () => {
        const saved = await api.projectSetup({
          action: 'save',
          cwd: info.cwd,
          initialize: git.checked,
          profile: {
            name: name.value,
            instructions: instructions.value,
            commands: info.installs.join('\n'),
            checkCommands: checks.value,
            autoCheck: auto.checked,
          },
        });
        if (saved.cancelled) return;
        await window.atlasWorkspace?.refreshProfiles?.();
        status.textContent = 'Project saved. Choose it in Projects or the queue.';
      });
      status.textContent =
        'Automatic checks execute your configured commands in the task folder. Enable them only after reviewing the commands.';
    });
  }
  async function showSearch() {
    const input = field('Search messages, commands, file changes and attachment names'),
      results = el('div');
    body.append(results);
    let timer,
      sequence = 0;
    const search = async () => {
      const request = ++sequence,
        query = input.value.trim();
      results.replaceChildren();
      if (!query) return;
      status.textContent = 'Searching…';
      try {
        const [work, chats] = await Promise.all([api.searchWork({ query }), api.historyList({ query })]);
        if (request !== sequence || !input.isConnected) return;
        const matches = [
          ...work,
          ...chats.map((chat) => ({
            kind: chat.provider + ' chat',
            title: chat.title,
            text: chat.searchText || chat.cwd || '',
            chat,
          })),
        ];
        for (const chat of window.atlasColab?.history() || [])
          if (
            (
              chat.title +
              ' ' +
              chat.turns.map((t) => t.content + ' ' + (t.attachments || []).map((a) => a.name).join(' ')).join(' ')
            )
              .toLowerCase()
              .includes(query.toLowerCase())
          )
            matches.push({
              kind: 'Colab chat',
              title: chat.title,
              text: chat.turns
                .map((t) => t.content)
                .join('\n')
                .slice(-1200),
              colabId: chat.id,
            });
        for (const match of matches.slice(0, 200)) {
          const node = el('section', undefined, 'workbench-row');
          node.append(el('h3', match.title), el('p', match.kind), el('pre', match.text));
          if (match.jobId) button('Open task', () => showTask(match.jobId), node);
          else if (match.colabId)
            button(
              'Open chat',
              () => {
                modal.close();
                window.atlasColab.selectChat(match.colabId);
              },
              node,
            );
          else if (match.chat)
            button(
              'Read conversation',
              async () => {
                const chat = await api.historyRead({ provider: match.chat.provider, id: match.chat.id });
                body.replaceChildren(
                  el('h3', chat.title),
                  el('pre', chat.turns.map((t) => t.role + ': ' + t.content).join('\n\n')),
                );
                button('Back to search', () => open('Search'));
              },
              node,
            );
          results.append(node);
        }
        status.textContent =
          Math.min(matches.length, 200) +
          ' results shown. Provider transcript searches use the provider’s local history.';
      } catch (error) {
        if (request === sequence) status.textContent = error.message;
      }
    };
    input.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void search(), 250);
    };
    input.focus();
  }
  async function showTask(id) {
    const jobs = await api.jobs(),
      job = jobs.find((row) => row.id === id);
    if (!job) throw Error('This task is no longer retained.');
    page = 'Task';
    title.textContent = 'Task result';
    body.replaceChildren();
    generation++;
    body.append(
      el('h3', job.prompt),
      el('p', job.status + ' · ' + job.cwd),
      el('pre', job.result?.output || job.error || job.statusText || ''),
    );
    verification(body, job);
    const details = el('details');
    details.append(
      el('summary', 'Commands and activity'),
      el(
        'pre',
        (job.events || [])
          .map((e) => (e.kind === 'reasoning' ? 'Reasoning summary (model-reported): ' : '') + e.text)
          .join('\n'),
      ),
    );
    body.append(details);
    if (job.changeId && job.status !== 'running') button('Review checkpoint / undo', () => previewRestore(job));
    if (job.recoveryChangeId) button('Undo last restore', () => previewRestore(job, true));
    button('Refresh task', () => showTask(id));
  }
  async function showCheckpoints(version) {
    const jobs = await api.jobs();
    if (version !== generation) return;
    for (const job of [...jobs].reverse()) {
      const node = row(job.prompt, job.status + ' · ' + job.cwd);
      verification(node, job);
      button('View task and checks', () => showTask(job.id), node);
      if (job.changeId && job.status !== 'running') button('Review restore point', () => previewRestore(job), node);
    }
    status.textContent =
      'Restore affects only files changed during that task. Later edits to those files block undo. Binary or large originals need Git recovery. Git commits and staged changes are preserved.';
  }
  async function previewRestore(job, recovery = false) {
    const preview = await api.changes({ jobId: job.id, action: 'restore-preview', recovery });
    body.replaceChildren(
      el('h3', 'Restore pre-task working files?'),
      el('p', preview.cwd),
      el('pre', preview.files.join('\n') || 'No files to restore.'),
    );
    page = 'Restore';
    title.textContent = 'Review checkpoint';
    if (preview.limited)
      body.append(
        el('p', 'Partial checkpoint: only captured files are listed. Use Git to review other project files.'),
      );
    if (preview.files.length)
      button('Restore these files', async () => {
        const result = await api.changes({ jobId: job.id, action: 'restore', token: preview.token, recovery });
        status.textContent = result.message;
        body.replaceChildren(el('p', result.message));
        button('Undo this restore', () => previewRestore(job, true));
      });
    button('Cancel', () => open('Checkpoints'));
    status.textContent = 'A recovery snapshot is created before restoring. Unrelated files are left in place.';
  }
  let screenPermissions = [];
  const screenBars = {};
  for (const [kind, selector] of [
    ['colab', '#colabForm'],
    ['assistant', '#form'],
  ]) {
    const composer = document.querySelector(selector);
    if (!composer) continue;
    const bar = el('div', undefined, 'screen-control-bar');
    bar.dataset.workspace = kind;
    bar.hidden = true;
    const label = el('span', 'Screen control allowed for this chat'),
      revoke = el('button', 'Revoke', 'quiet-button'),
      message = el('span');
    revoke.type = 'button';
    bar.append(label, revoke, message);
    const holder = kind === 'colab' ? document.querySelector('.colab-run-details-body') : null;
    if (holder) holder.append(bar);
    else composer.before(bar);
    screenBars[kind] = { bar, label, revoke, message };
    revoke.onclick = async () => {
      revoke.disabled = true;
      const owner = bar.dataset.owner,
        allowed = screenPermissions.some((row) => row.owner === owner);
      try {
        screenPermissions = await api.integrations({ action: allowed ? 'revoke-desktop' : 'grant-desktop', owner });
        renderScreenPermissions();
      } catch (error) {
        message.textContent = error.message;
      } finally {
        revoke.disabled = false;
      }
    };
  }
  const screenStyle = el('style');
  screenStyle.textContent =
    '.screen-control-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:0 0 auto;color:#9fd3bd;font:11px Segoe UI,sans-serif;padding:6px 0}.screen-control-bar[hidden]{display:none}.screen-control-bar button{padding:4px 8px;font-size:10px}';
  document.head.append(screenStyle);
  function renderScreenPermissions() {
    const selected = { colab: window.atlasColab?.graphHistory?.().chatId, assistant: conversationId };
    for (const [kind, item] of Object.entries(screenBars)) {
      const owner = selected[kind] ? kind + ':' + selected[kind] : '';
      const allowed = screenPermissions.some((row) => row.owner === owner);
      item.bar.hidden = !owner;
      item.bar.dataset.owner = owner;
      item.label.textContent = allowed ? 'Screen control allowed for this chat' : 'Computer control: ask first';
      item.revoke.textContent = allowed ? 'Revoke' : 'Allow for this chat';
      if (kind === 'colab') {
        const summary = document.querySelector('.colab-run-details>summary');
        if (summary)
          summary.textContent = allowed ? 'Run details · control allowed' : 'Run details · control asks first';
      }
      item.revoke.title = allowed
        ? 'Revoke saved computer control'
        : 'Remember desktop, app launches, clipboard and ordinary file operations for this chat. System-file edits, denied files and opaque commands still ask. Applies to both Codex and Claude until revoked.';
    }
  }
  api.onDesktopPermissions?.((value) => {
    screenPermissions = Array.isArray(value) ? value : [];
    renderScreenPermissions();
  });
  void api
    .integrations({ action: 'desktop-permissions' })
    .then((value) => {
      screenPermissions = Array.isArray(value) ? value : [];
      renderScreenPermissions();
    })
    .catch(() => {});
  window.addEventListener('atlas-colab-chat-change', renderScreenPermissions);
  window.addEventListener('atlas-assistant-task', renderScreenPermissions);
  const inlineCards = new Map(),
    answering = new Set(),
    approvalDrafts = new Map(),
    approvalAreas = {};
  for (const [kind, selector] of [
    ['colab', '#colabForm'],
    ['assistant', '#form'],
  ]) {
    const composer = document.querySelector(selector);
    if (!composer) continue;
    const area = el('section', undefined, 'chat-approvals');
    area.dataset.workspace = kind;
    area.setAttribute('aria-label', 'Pending approvals in this chat');
    area.hidden = true;
    composer.before(area);
    approvalAreas[kind] = area;
  }
  const approvalStyle = el('style');
  approvalStyle.textContent =
    '.chat-approvals{flex:0 1 auto;min-height:0;max-height:min(180px,25vh);overflow:auto;margin:6px 0;border:1px solid #8d734a;border-radius:10px;background:#251f15;padding:7px 9px;color:#f1dfbc}.chat-approvals[hidden]{display:none}.chat-approval+ .chat-approval{margin-top:12px;padding-top:10px;border-top:1px solid #655334}.chat-approval h3{margin:0;font-size:13px}.chat-approval pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:14vh;overflow:auto;font:11px/1.5 Segoe UI,sans-serif;margin:7px 0}.chat-approval textarea{width:100%;min-height:52px;max-height:90px;background:#101b20;border:1px solid #47616b;border-radius:6px;color:#e1eef1;padding:6px;box-sizing:border-box}.approval-target{font:11px/1.4 Segoe UI,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:3px 0}.approval-request-details{font-size:10px;margin:4px 0}.approval-request-details summary{cursor:pointer}.chat-approval-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}.chat-approval-actions button{padding:6px 9px;font-size:11px}.chat-approval-error{color:#ffb7a2;font-size:11px}.chat-approval small{font-size:10px;color:#c5b38f}';
  document.head.append(approvalStyle);
  function renderInlineApprovals() {
    const colabId = window.atlasColab?.graphHistory?.().chatId;
    for (const [kind, area] of Object.entries(approvalAreas)) {
      const relevant = pending.filter((request) => {
        const job = jobRows.find((job) => job.id === request.jobId);
        return (
          job &&
          (kind === 'colab'
            ? job.collaboration && Boolean(colabId) && job.colabChatId === colabId
            : !job.collaboration &&
              ((Boolean(conversationId) && job.conversationId === conversationId) ||
                (Boolean(foregroundRequest) && job.id === foregroundRequest)))
        );
      });
      const keep = new Set(relevant.map((request) => request.id));
      for (const child of [...area.children]) if (!keep.has(child.dataset.approvalId)) child.remove();
      for (const request of relevant) {
        let card = inlineCards.get(request.id);
        if (!card) {
          card = el('article', undefined, 'chat-approval');
          card.dataset.approvalId = request.id;
          if (request.permissionScope) card.append(el('small', request.permissionScope));
          card.append(el('h3', request.provider + ' · ' + request.title));
          try {
            const data = JSON.parse(request.details.split('\n\n')[0]),
              target = [data.mode, data.path || data.executable || data.name || data.command]
                .filter(Boolean)
                .join(' · ');
            if (target) {
              const brief = el('p', target, 'approval-target');
              brief.title = target;
              card.append(brief);
            }
          } catch {}
          const disclosure = el('details', undefined, 'approval-request-details');
          disclosure.append(el('summary', 'Request details'), el('pre', request.details));
          card.append(disclosure);
          const input = request.textInput ? el('textarea') : null;
          if (input) {
            input.setAttribute('aria-label', 'Your answer');
            input.maxLength = 10000;
            input.value = approvalDrafts.get(request.id) || '';
            input.oninput = () => approvalDrafts.set(request.id, input.value);
            card.append(input);
          }
          const actions = el('div', undefined, 'chat-approval-actions'),
            error = el('p', undefined, 'chat-approval-error');
          error.setAttribute('role', 'status');
          for (const choice of request.choices) {
            const answer = el('button', choice, 'quiet-button');
            answer.type = 'button';
            answer.onclick = async () => {
              if (answering.has(request.id)) return;
              answering.add(request.id);
              for (const b of card.querySelectorAll('button')) b.disabled = true;
              error.textContent = '';
              try {
                syncApprovals(await api.approvals({ action: 'answer', id: request.id, choice, text: input?.value }));
              } catch (problem) {
                error.textContent = problem.message;
              } finally {
                answering.delete(request.id);
                for (const b of card.querySelectorAll('button')) b.disabled = false;
              }
            };
            actions.append(answer);
          }
          card.append(actions, error);
          inlineCards.set(request.id, card);
        }
        if (card.parentElement !== area) area.append(card);
      }
      area.hidden = !relevant.length;
    }
    const live = new Set(pending.map((request) => request.id));
    for (const id of inlineCards.keys())
      if (!live.has(id)) {
        inlineCards.get(id).remove();
        inlineCards.delete(id);
        approvalDrafts.delete(id);
      }
  }
  function syncApprovals(value) {
    pending = Array.isArray(value) ? value : [];
    alertButton.hidden = !pending.length;
    alertButton.textContent = pending.length + ' approval' + (pending.length === 1 ? '' : 's') + ' needed';
    renderInlineApprovals();
    if (modal.open && page === 'Approvals') renderApprovals();
  }
  async function refreshApprovalJobs() {
    try {
      const rows = await api.jobs();
      if (Array.isArray(rows)) {
        jobRows = rows;
        renderInlineApprovals();
      }
    } catch {}
  }
  window.addEventListener('atlas-colab-chat-change', renderInlineApprovals);
  window.addEventListener('atlas-assistant-task', renderInlineApprovals);
  async function showApprovals() {
    syncApprovals(await api.approvals());
    renderApprovals();
  }
  function renderApprovals() {
    body.replaceChildren();
    for (const request of pending) {
      const node = row(request.provider + ' · ' + request.title, 'Task: ' + request.jobId);
      if (request.permissionScope) node.append(el('p', request.permissionScope));
      node.append(el('pre', request.details));
      const answer = request.textInput ? field('Your answer', 'textarea', node) : null;
      if (answer) answer.maxLength = 10000;
      for (const choice of request.choices)
        button(
          choice,
          async () => {
            syncApprovals(await api.approvals({ action: 'answer', id: request.id, choice, text: answer?.value }));
          },
          node,
        );
    }
    if (!pending.length) body.append(el('p', 'No requests waiting for approval.'));
    status.textContent =
      'Allow remembers the scope shown on the request; Allow once covers only that request; Deny rejects it. Stopping a task dismisses pending approvals. Existing provider permission rules still apply.';
  }
  api.onApprovals((value) => {
    syncApprovals(value);
    if (pending.some((request) => !jobRows.some((job) => job.id === request.jobId))) void refreshApprovalJobs();
  });
  api.onQueue((state) => {
    queueState = state;
    if (modal.open && page === 'Queue') {
      const list = body.querySelector('#queueItems');
      if (list) renderQueueItems(list, state);
      const label = body.querySelector('#queueState');
      if (label) label.textContent = queueSummary(state);
    }
  });
  api.onJobs((patch) => {
    for (const job of patch.upsert || []) {
      const i = jobRows.findIndex((row) => row.id === job.id);
      if (i < 0) jobRows.push(job);
      else jobRows[i] = job;
    }
    jobRows = jobRows.filter((row) => !(patch.removed || []).includes(row.id));
    renderInlineApprovals();
  });
  void api
    .approvals()
    .then(syncApprovals)
    .catch(() => {});
  void refreshApprovalJobs();
  window.atlasWorkbench = { open };
})();
