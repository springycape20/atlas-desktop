(() => {
  const api = window.atlas,
    power = window.atlasPower;
  const context = () => {
    const scope = document.body.dataset.workspace === 'colab' ? 'colab' : 'assistant';
    return {
      scope,
      cwd: scope === 'colab' ? window.atlasColab.current().cwd : typeof cwd === 'string' ? cwd : '',
      id: scope === 'colab' ? window.atlasColab.current().id : typeof conversationId === 'string' ? conversationId : '',
    };
  };
  power.register('Live preview', async ({ body, node, button, status, current }) => {
    const input = context();
    body.append(
      node('h2', 'Run and inspect your project'),
      node(
        'p',
        'Open a local development server beside chat. Preview pages run in a separate sandbox with no ATLAS API, downloads or device permissions. Requests to other origins are blocked.',
      ),
    );
    const url = node('input');
    url.value = 'http://127.0.0.1:5173/';
    url.setAttribute('aria-label', 'Local preview URL');
    body.append(url);
    const actions = node('div');
    actions.className = 'power-actions';
    body.append(actions);
    const logs = node('pre'),
      diagnostics = node('div');
    logs.setAttribute('aria-label', 'Development server output');
    body.append(diagnostics, logs);
    const call = (action, extra = {}) => api.livePreview({ ...input, action, ...extra });
    const refresh = async () => {
      const value = await call('status');
      if (!current()) return;
      logs.textContent =
        value.output ||
        'No server output. Automatic start supports installed Vite projects; other servers can be opened by local URL.';
      status.textContent =
        (value.open ? 'Preview open' : 'Preview closed') +
        ' · ' +
        (value.running ? 'Server running' : 'No managed server');
      diagnostics.replaceChildren();
      const refs = [
        ...logs.textContent.matchAll(
          /((?:[A-Za-z]:[\\/])?[\w./\\-]+\.(?:tsx?|jsx?|vue|svelte|css|html|json)):(\d+)(?::\d+)?/g,
        ),
      ].slice(0, 20);
      for (const match of refs)
        button(
          'Open ' + match[0],
          () => window.atlasProjectFiles.preview({ cwd: input.cwd }, match[1] + ':' + match[2]),
          diagnostics,
        );
    };
    button(
      'Open preview',
      async () => {
        await call('open', { url: url.value });
        await refresh();
      },
      actions,
    );
    button(
      'Start Vite server…',
      async () => {
        const result = await call('start');
        if (result.url) url.value = result.url;
        await refresh();
      },
      actions,
    );
    button('Reload preview', () => call('reload'), actions);
    button(
      'Stop server',
      async () => {
        await call('stop');
        await refresh();
      },
      actions,
    );
    button(
      'Close preview',
      async () => {
        await call('close');
        await refresh();
      },
      actions,
    );
    body.append(
      node('h3', 'Visual feedback'),
      node(
        'p',
        'Choose Select element, click an element in the preview, then attach a screenshot. Your draft remains unsent.',
      ),
    );
    button('Select element in preview', async () => {
      await call('inspect');
      status.textContent = 'Click an element in the preview, then return here to attach feedback.';
    });
    button('Attach screenshot and selection to chat', async () => {
      const now = context();
      if (now.scope !== input.scope || now.id !== input.id || now.cwd !== input.cwd)
        throw Error('Return to the original project conversation first.');
      const value = await call('capture');
      const afterCapture = context();
      if (afterCapture.id !== input.id || afterCapture.scope !== input.scope || afterCapture.cwd !== input.cwd)
        throw Error('Conversation changed while capturing. Return to the original conversation.');
      const attached = await window.atlasWorkspace.addAttachments(input.scope, () =>
        Promise.resolve(value.attachments),
      );
      if (!attached) throw Error('Screenshot could not be attached.');
      if (context().id !== input.id || context().scope !== input.scope)
        throw Error('Screenshot attached to the original conversation. Return there to write feedback.');
      const field = document.getElementById(input.scope === 'colab' ? 'colabTask' : 'prompt');
      const detail = value.selected
        ? '\nSelected element (page-reported): ' + value.selected.selector + '\nVisible text: ' + value.selected.text
        : '';
      field.value +=
        (field.value ? '\n\n' : '') +
        'Visual feedback for this project. See the attached preview screenshot.' +
        detail +
        '\nRequested change: ';
      field.dispatchEvent(new Event('input', { bubbles: true }));
      power.close();
      field.focus();
    });
    button('Refresh server output', refresh);
    await refresh();
    const tick = () =>
      setTimeout(async () => {
        if (!current()) return;
        try {
          await refresh();
        } catch {}
        tick();
      }, 2000);
    tick();
  });
  window.atlasUi.register('tasks', 'Live preview');
  for (const scope of ['assistant', 'colab']) {
    const menu = document.getElementById('attachmentMenu-' + scope);
    if (menu)
      window.atlasUi.actionButton(
        'Live project preview',
        () => {
          menu.hidePopover();
          power.show('Live preview');
        },
        menu,
      );
  }
})();
