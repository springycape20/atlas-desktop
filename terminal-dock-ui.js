(() => {
  const api = window.atlas,
    power = window.atlasPower;
  if (!api?.advancedWorkflows || !power) return;
  const node = power.node,
    pane = node('aside'),
    header = node('header'),
    tabs = node('nav'),
    output = node('pre'),
    input = node('textarea'),
    status = node('p'),
    handle = node('div');
  pane.className = 'terminal-dock';
  pane.hidden = true;
  pane.setAttribute('aria-label', 'Project terminal');
  header.append(node('strong', 'Terminal'));
  tabs.setAttribute('aria-label', 'Terminal sessions');
  output.setAttribute('aria-label', 'Terminal output');
  input.setAttribute('aria-label', 'Terminal command');
  input.placeholder = 'Enter a command · Shift+Enter for multiple lines';
  input.rows = 2;
  input.spellcheck = false;
  status.setAttribute('role', 'status');
  handle.className = 'terminal-dock-resize';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-label', 'Resize terminal');
  handle.setAttribute('aria-orientation', 'vertical');
  let selected,
    context,
    rows = [],
    signature = '',
    width = 520,
    maximized = false,
    timer,
    historyIndex = 0;
  const histories = new Map();
  const call = (action, extra = {}) => api.advancedWorkflows({ tool: 'terminal', ...context, action, ...extra });
  const button = (text, action, parent = header) => {
    const item = node('button', text);
    item.className = 'quiet-button';
    item.type = 'button';
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
  function hide() {
    pane.hidden = true;
    document.body.classList.remove('terminal-dock-open');
    clearTimeout(timer);
  }
  function resize(value, remember = true) {
    const actual = Math.max(320, Math.min(value, Math.max(320, innerWidth - 300)));
    if (remember) width = actual;
    document.documentElement.style.setProperty('--atlas-terminal-width', actual + 'px');
    handle.setAttribute('aria-valuenow', actual);
  }
  async function refresh() {
    rows = await call('list');
    if (!selected || !rows.some((row) => row.id === selected)) selected = rows.at(-1)?.id;
    const next = JSON.stringify(rows.map((row) => [row.id, row.status, row.command, row.executing]));
    if (next !== signature) {
      signature = next;
      tabs.replaceChildren();
      for (const [index, row] of rows.entries()) {
        const tab = button(
          (row.shell ? 'PowerShell ' + (index + 1) : row.command.slice(0, 24)) +
            ' · ' +
            (row.shell && row.status === 'running' ? (row.executing ? 'running' : 'ready') : row.status),
          () => {
            selected = row.id;
            input.value = '';
            historyIndex = (histories.get(selected) || []).length;
            paint();
            input.focus();
          },
          tabs,
        );
        tab.dataset.session = row.id;
      }
    }
    paint();
  }
  function paint() {
    const row = rows.find((row) => row.id === selected);
    for (const tab of tabs.children) tab.setAttribute('aria-pressed', String(tab.dataset.session === selected));
    const follow = output.scrollHeight - output.clientHeight - output.scrollTop < 50;
    if (output.textContent !== (row?.output || ''))
      output.textContent = row?.output || 'Create a terminal session with + to begin.';
    if (follow) output.scrollTop = output.scrollHeight;
    input.disabled = !row || row.status !== 'running';
    status.textContent = row
      ? (row.executing ? 'Command running' : row.status === 'running' ? 'Ready' : row.status) +
        ' · Started in ' +
        row.cwd +
        ' · PID ' +
        (row.pid || 'starting')
      : 'No terminal session. Chat stays available while shells are idle.';
  }
  async function poll() {
    if (pane.hidden) return;
    try {
      await refresh();
    } catch (error) {
      status.textContent = error.message;
    }
    if (!pane.hidden) timer = setTimeout(poll, 600);
  }
  async function create() {
    const result = await call('start', { shell: true, timeoutSeconds: 3600 });
    if (result.id) {
      selected = result.id;
      histories.set(selected, []);
      historyIndex = 0;
      await refresh();
      input.focus();
    }
  }
  async function send() {
    if (!selected || !input.value.trim()) return;
    const text = input.value;
    await call('input', { id: selected, text });
    const history = histories.get(selected) || [];
    history.push(text);
    histories.set(selected, history.slice(-100));
    historyIndex = histories.get(selected).length;
    input.value = '';
    await refresh();
    input.focus();
  }
  button('+', create).setAttribute('aria-label', 'New terminal session');
  button('Stop', async () => {
    if (selected) await call('stop', { id: selected });
    await refresh();
  });
  button('Close tab', async () => {
    if (!selected) return;
    await call('close', { id: selected });
    selected = null;
    await refresh();
  });
  button('Expand', () => {
    maximized = !maximized;
    pane.dataset.expanded = String(maximized);
  });
  button('Hide', hide);
  const commandTools = node('div');
  commandTools.className = 'terminal-command-tools';
  button('Run command', send, commandTools);
  commandTools.append(node('span', 'Enter to run · Shift+Enter for a new line'));
  input.onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send().catch((error) => (status.textContent = error.message));
    } else if (['ArrowUp', 'ArrowDown'].includes(event.key) && !input.value.includes('\n')) {
      const history = histories.get(selected) || [];
      if (!history.length) return;
      event.preventDefault();
      historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[historyIndex] || '';
    }
  };
  let drag;
  handle.onpointerdown = (event) => {
    drag = { x: event.clientX, width };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  handle.onpointermove = (event) => {
    if (drag) resize(drag.width + drag.x - event.clientX);
  };
  handle.onpointerup = handle.onlostpointercapture = () => (drag = null);
  handle.onkeydown = (event) => {
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      resize(width + (event.key === 'ArrowLeft' ? 20 : -20));
    }
  };
  pane.append(handle, header, tabs, output, input, commandTools, status);
  document.body.append(pane);
  resize(width, false);
  async function open() {
    context = power.request();
    if (context.scope === 'colab') {
      context = { cwd: window.atlasColab.current().cwd };
    } else context = { cwd: context.cwd };
    power.close();
    const editor = document.querySelector('.project-editor-panel');
    if (editor) editor.hidden = true;
    document.body.classList.remove('project-editor-open');
    pane.hidden = false;
    document.body.classList.add('terminal-dock-open');
    clearTimeout(timer);
    await refresh();
    void poll();
    if (!rows.length) status.textContent = 'Select + to approve and open a persistent shell.';
  }
  power.register('Terminal', async () => open());
  window.atlasTerminal = { open, hide };
  for (const parent of document.querySelectorAll('.composer,.colab-composer')) button('Terminal', open, parent);
  window.addEventListener('resize', () => resize(width, false));
  new MutationObserver(() => {
    if (!pane.hidden && document.body.classList.contains('project-editor-open')) hide();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
})();
