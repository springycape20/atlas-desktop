(() => {
  const api = window.atlas;
  if (!api.contextPreview) return;
  const selections = new Map();
  const node = (tag, text) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    return item;
  };
  const scope = () => (document.body.dataset.workspace === 'colab' ? 'colab' : 'assistant');
  const key = (which) =>
    which === 'colab'
      ? 'colab:' + window.atlasColab.current().id
      : 'assistant:' + (typeof conversationId === 'string' ? conversationId : 'new');
  const selection = (which = scope()) =>
    structuredClone(
      selections.get(key(which)) || {
        instructions: true,
        memories: true,
        history: true,
        attachments: true,
        project: false,
        files: [],
      },
    );
  const saveSelection = (which, next) => selections.set(key(which), structuredClone(next));
  const style = node('style');
  style.textContent = `.power-dialog{width:min(980px,calc(100vw - 32px));max-height:90vh;padding:0;background:#151719;color:#eee;border:1px solid #444;border-radius:8px;font:14px/1.5 "Segoe UI",sans-serif}.power-dialog::backdrop{background:#000a}.power-dialog header,.power-dialog nav{display:flex;align-items:center;gap:16px;padding:16px 24px;flex-wrap:wrap}.power-dialog h1{font-size:22px;margin:0;flex:1}.power-dialog nav{padding-top:0;padding-bottom:12px;border-bottom:1px solid #333}.power-dialog button{font:inherit;color:inherit;background:#26282a;border:1px solid #555;border-radius:6px;padding:7px 12px;cursor:pointer;min-height:36px}.power-dialog nav button{background:transparent;border:0;color:#b4b4b4;padding:4px}.power-dialog nav button[aria-current=true]{color:#fff;text-decoration:underline;text-underline-offset:8px}.power-dialog button:focus-visible,.power-dialog input:focus-visible,.power-dialog textarea:focus-visible{outline:2px solid #fff;outline-offset:2px}.power-body{padding:20px 24px;max-height:65vh;overflow:auto}.power-body p{color:#b4b4b4;margin:0 0 16px}.power-body h2{font-size:17px;margin:0 0 12px}.power-body h3{font-size:15px;margin:16px 0 8px}.power-body input:not([type=checkbox]),.power-body textarea,.power-body select{width:100%;box-sizing:border-box;border:1px solid #555;border-radius:6px;padding:9px;background:#222426;color:#fff;font:inherit;margin:6px 0 12px}.power-body label{display:block}.power-body .power-toggle{display:flex;align-items:center;gap:12px;padding:10px 0}.power-body input[type=checkbox]{width:18px;height:18px;accent-color:#ddd}.power-body details{padding:12px 0;border-bottom:1px solid #333}.power-body summary{cursor:pointer;overflow-wrap:anywhere}.power-body pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 Consolas,monospace;background:#222426;padding:12px;max-height:220px;overflow:auto}.power-actions{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}.power-status{padding:12px 24px;border-top:1px solid #333;color:#b4b4b4;white-space:pre-wrap}.power-metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px}.power-metrics div{padding:12px;background:#222426}.power-metrics strong{display:block;font-size:24px;font-weight:400;font-variant-numeric:tabular-nums}.power-dialog .power-primary{background:#eee;color:#111;border-color:#eee}.power-empty{padding:20px;background:#222426}@media(max-width:640px){.power-dialog header,.power-dialog nav,.power-body{padding:16px}.power-dialog nav{gap:12px}.power-metrics{grid-template-columns:1fr}.power-dialog{width:calc(100vw - 16px)}}`;
  style.textContent +=
    '.power-dialog[open]{display:flex;flex-direction:column;overflow:hidden}.power-dialog header,.power-dialog nav,.power-status{flex-shrink:0}.power-body{min-height:0;flex:1;max-height:none}';
  document.head.append(style);
  const dialog = node('dialog');
  dialog.id = 'powerDialog';
  dialog.className = 'power-dialog';
  dialog.setAttribute('aria-labelledby', 'powerTitle');
  const header = node('header'),
    title = node('h1', 'ATLAS project tools');
  title.id = 'powerTitle';
  const close = node('button', 'Close');
  close.onclick = () => dialog.close();
  header.append(title, close);
  const nav = node('nav');
  nav.setAttribute('aria-label', 'Project tools');
  const body = node('section');
  body.className = 'power-body';
  const status = node('footer');
  status.className = 'power-status';
  status.setAttribute('role', 'status');
  dialog.append(header, nav, body, status);
  document.body.append(dialog);
  const views = new Map();
  let currentView = '',
    sequence = 0,
    embedded = null;
  function button(text, action, parent = body) {
    const item = node('button', text);
    item.type = 'button';
    item.onclick = () =>
      Promise.resolve()
        .then(action)
        .catch((error) => {
          status.textContent = error.message;
        });
    parent.append(item);
    return item;
  }
  function register(name, render) {
    views.set(name, render);
    button(name, () => show(name), nav);
  }
  async function show(name = 'Context') {
    const id = ++sequence;
    currentView = name;
    body.replaceChildren();
    status.textContent = '';
    for (const item of nav.querySelectorAll('button'))
      item.setAttribute('aria-current', String(item.textContent === name));
    title.textContent = 'ATLAS · ' + name;
    nav.hidden = true;
    if (!dialog.open && !embedded) dialog.showModal();
    try {
      await views.get(name)?.({ body, status, node, button, current: () => id === sequence });
    } catch (error) {
      if (id === sequence) status.textContent = error.message;
    }
  }
  const request = (which = scope()) => {
    const chat = which === 'colab' ? window.atlasColab.current() : null;
    return {
      scope: which,
      cwd: chat?.cwd || (typeof cwd === 'string' ? cwd : ''),
      prompt: document.getElementById(which === 'colab' ? 'colabTask' : 'prompt')?.value || '',
      profileId: window.atlasWorkspace?.context(which).profileId,
      attachments: window.atlasWorkspace?.context(which).attachments || [],
      conversationId: typeof conversationId === 'string' ? conversationId : '',
      history: chat?.messages || [],
      selection: selection(which),
    };
  };
  register('Context', async ({ current }) => {
    const which = scope(),
      input = request(which),
      selected = selection(which);
    body.append(node('h2', which === 'colab' ? 'Context for this Colab chat' : 'Context for this Assistant chat'));
    body.append(
      node(
        'p',
        'Choose the optional material ATLAS adds to your next request. Changes apply to this chat for this app session.',
      ),
    );
    for (const [id, label] of [
      ['instructions', 'Project instructions'],
      ['memories', 'Saved memories (Assistant)'],
      ['history', 'Earlier conversation'],
      ['attachments', 'Selected attachments'],
      ['project', 'Relevant project excerpts'],
    ]) {
      const row = node('label');
      row.className = 'power-toggle';
      const box = node('input');
      box.type = 'checkbox';
      box.checked = selected[id];
      box.dataset.context = id;
      if (which === 'colab' && id === 'memories') box.disabled = true;
      box.onchange = () => {
        selected[id] = box.checked;
        saveSelection(which, selected);
        status.textContent = 'Context selection saved for the next request.';
      };
      row.append(box, node('span', label));
      body.append(row);
    }
    const actions = node('div');
    actions.className = 'power-actions';
    body.append(actions);
    const preview = node('div');
    body.append(preview);
    button(
      'Draft a conversation handover request',
      () => {
        const field = document.getElementById(which === 'colab' ? 'colabTask' : 'prompt');
        field.value +=
          (field.value ? '\n\n' : '') +
          'Prepare a concise handover of this conversation: objective, decisions, changed files, checks, unresolved issues and next steps. Clearly distinguish verified results from assumptions. Do not change files.';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        status.textContent =
          'Handover request added to the unsent draft. Send it to generate a summary before starting a fresh conversation.';
      },
      actions,
    );
    button(
      'Refresh preview',
      async () => {
        status.textContent = 'Reading selected context locally…';
        const result = await api.contextPreview({ ...input, selection: selected });
        if (!current()) return;
        preview.replaceChildren();
        const included =
          (result.sections || [])
            .filter((section) => section.included)
            .map((section) => section.text || '')
            .join('\n') + (result.indexed?.results || []).map((file) => file.excerpt || '').join('\n');
        preview.append(
          node('h3', 'Estimated optional context: ~' + Math.ceil(included.length / 4).toLocaleString() + ' tokens'),
        );
        preview.append(
          node(
            'p',
            'Estimate uses four characters per token. Provider sessions, tools and file reads add context; provider compaction is managed by the provider and is not exposed to ATLAS.',
          ),
        );
        for (const section of result.sections || []) {
          const details = node('details');
          details.append(
            node('summary', section.label + (section.included ? ' · included' : ' · excluded')),
            node('pre', section.text || 'No material in this category.'),
          );
          preview.append(details);
        }
        if (result.indexed) {
          preview.append(
            node(
              'h3',
              `${result.indexed.indexed} source files indexed${result.indexed.truncated ? ' · scan limited' : ''}`,
            ),
          );
          for (const file of result.indexed.results) {
            const details = node('details');
            details.append(node('summary', file.path + ':' + file.line), node('pre', file.excerpt));
            button(
              'Exclude this file',
              () => {
                selected.files = [...new Set([...selected.files, file.path])];
                saveSelection(which, selected);
                details.remove();
                status.textContent = 'Excluded ' + file.path + ' from ATLAS project context.';
              },
              details,
            );
            preview.append(details);
          }
        }
        if (selected.files.length)
          button(
            'Clear file exclusions (' + selected.files.length + ')',
            () => {
              selected.files = [];
              saveSelection(which, selected);
              status.textContent = 'File exclusions cleared. Refresh to view excerpts.';
            },
            preview,
          );
        status.textContent = result.note;
      },
      actions,
    );
    if (input.prompt)
      [...actions.querySelectorAll('button')].find((button) => button.textContent === 'Refresh preview').click();
    else
      status.textContent =
        'Write a message first, then refresh the preview. Excerpts are opt-in; the source cache stays in memory on this PC.';
  });
  register('Performance', async ({ current }) => {
    const value = await api.performance();
    if (!current()) return;
    body.append(
      node('h2', 'This ATLAS session'),
      node(
        'p',
        'Measurements stay on this PC. Main-process memory excludes the window, model servers and provider processes.',
      ),
    );
    const metrics = node('div');
    metrics.className = 'power-metrics';
    for (const [label, figure] of [
      ['Window startup', value.startupMs == null ? '—' : value.startupMs + ' ms'],
      ['Main process memory', value.mainProcessRssMB + ' MB'],
      ['Running tasks', value.runningTasks],
      [
        'History / index workers',
        [value.historyWorkerActive, value.knowledgeWorkerActive]
          .map((active) => (active ? 'active' : 'idle'))
          .join(' / '),
      ],
    ]) {
      const item = node('div', label);
      item.append(node('strong', figure));
      metrics.append(item);
    }
    body.append(metrics);
    for (const [name, sample] of Object.entries(value.samples || {}))
      body.append(
        node(
          'p',
          `${name}: latest ${sample.latestMs} ms; median ${sample.medianMs} ms across ${sample.count} recent requests.`,
        ),
      );
    button('Refresh measurements', () => show('Performance'));
    status.textContent = 'History and project-index workers release their in-memory caches after two idle minutes.';
  });
  for (const parent of [document.querySelector('.composer'), document.querySelector('.colab-composer')])
    if (parent) {
      const item = button('Context', () => show('Context'), parent);
      item.className = 'quiet-button';
      item.style.marginTop = '8px';
    }
  const tools = button(
    'Project tools',
    () => show('Context'),
    document.querySelector('.workspace-nav') || document.body,
  );
  tools.className = 'nav-item';
  tools.id = 'powerToolsOpen';
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.5',
    'aria-hidden': 'true',
  }))
    icon.setAttribute(name, value);
  const shape = document.createElementNS(icon.namespaceURI, 'path');
  shape.setAttribute('d', 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z');
  icon.append(shape);
  tools.prepend(icon);
  window.atlasPower = {
    selection,
    setSelection: saveSelection,
    show,
    register,
    request,
    node,
    button,
    dialog,
    close: () => {
      if (embedded) embedded.onClose();
      else dialog.close();
    },
    mount: async (name, host, onClose) => {
      embedded?.restore();
      if (dialog.open) dialog.close();
      const restore = () => {
        if (embedded?.restore !== restore) return;
        embedded = null;
        sequence++;
        dialog.append(body, status);
      };
      embedded = { restore, onClose };
      host.append(body, status);
      await show(name);
      return restore;
    },
    body,
    status,
    currentView: () => currentView,
  };
})();
