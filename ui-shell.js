(() => {
  document.body.classList.add('atlas-ui');
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const nav = document.querySelector('.workspace-nav');
  const legacy = [...nav.querySelectorAll('.nav-item')];
  const projectButton = nav.querySelector('[data-destination="projects"]');
  for (const button of legacy)
    if (!button.dataset.chatWorkspace && button !== projectButton) button.dataset.legacy = 'true';
  const chatButton = nav.querySelector('[data-chat-workspace="assistant"]');
  if (chatButton) chatButton.querySelector('span').textContent = 'Chat';
  const actionButton = (label, action, parent) => {
    const el = node('button', label, 'quiet-button');
    el.type = 'button';
    el.onclick = () =>
      Promise.resolve()
        .then(action)
        .catch((error) => window.toast?.(error.message));
    parent.append(el);
    return el;
  };
  const routeButton = (label, route, icon) => {
    const button = actionButton(label, () => openHub(route), nav);
    button.className = 'nav-item';
    button.dataset.mainRoute = route;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.5');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', icon);
    svg.append(path);
    button.prepend(svg);
    return button;
  };
  routeButton('Tasks', 'tasks', 'M5 6h14M5 12h14M5 18h14');
  routeButton('Library', 'library', 'M4 4h6v16H4zM14 4h6v16h-6z');
  const settingsButton = routeButton(
    'Settings',
    'settings',
    'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M5.5 18.5l2-2M16.5 7.5l2-2',
  );
  settingsButton.classList.add('shell-settings');
  settingsButton.onclick = () => document.getElementById('settingsOpen').click();
  if (projectButton) nav.insertBefore(projectButton, nav.querySelector('[data-main-route="tasks"]'));
  const hub = node('dialog', undefined, 'shell-hub');
  hub.setAttribute('aria-labelledby', 'shellHubTitle');
  const header = node('header'),
    title = node('h1');
  title.id = 'shellHubTitle';
  header.append(title);
  actionButton('Close', () => hub.close(), header);
  const tabs = node('nav');
  tabs.setAttribute('aria-label', 'Sections');
  tabs.setAttribute('role', 'tablist');
  const content = node('section');
  content.className = 'shell-hub-content';
  content.id = 'shellHubContent';
  content.setAttribute('role', 'tabpanel');
  hub.append(header, tabs, content);
  document.body.append(hub);
  let cleanup,
    generation = 0,
    focusBefore;
  const closeHub = () => hub.close();
  const panel = (element, refresh) => async () => {
    const parent = element.parentElement,
      next = element.nextSibling,
      hidden = element.hidden,
      open = element.open;
    content.append(element);
    element.hidden = false;
    element.open = true;
    refresh?.();
    return () => {
      parent.insertBefore(element, next?.parentElement === parent ? next : null);
      element.hidden = hidden;
      element.open = open;
    };
  };
  const power = (name) => () => window.atlasPower.mount(name, content, closeHub);
  const workbench = (name) => () => window.atlasWorkbench.mount(name, content);
  const sections = {
    tasks: {
      Running: panel(jobsPanel),
      Queue: workbench('Queue'),
      Parallel: power('Parallel'),
      Recovery: power('Recovery'),
      Reminders: panel(agendaPanel, () => void refreshAgenda()),
      Approvals: workbench('Approvals'),
    },
    library: { Memories: panel(memoryPanel, () => void refreshMemory()), Workflows: power('Workflows') },
    diagnostics: { Performance: power('Performance'), 'Response timing': panel(latencyPanel) },
  };
  async function renderTab(route, name) {
    const revision = ++generation;
    cleanup?.();
    cleanup = null;
    content.replaceChildren();
    for (const button of tabs.querySelectorAll('button')) {
      const active = button.dataset.section === name;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    }
    content.setAttribute('aria-labelledby', 'shell-tab-' + name.replaceAll(' ', '-'));
    const restore = await sections[route][name]();
    if (revision !== generation || !hub.open) restore?.();
    else cleanup = restore;
  }
  async function openHub(route, name) {
    if (route === 'settings') return settingsButton.click();
    if (!sections[route]) return;
    focusBefore = document.activeElement;
    title.textContent = route === 'tasks' ? 'Tasks' : route === 'library' ? 'Library' : 'Diagnostics';
    tabs.replaceChildren();
    for (const section of Object.keys(sections[route])) {
      const button = actionButton(section, () => renderTab(route, section), tabs);
      button.dataset.section = section;
      button.id = 'shell-tab-' + section.replaceAll(' ', '-');
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', content.id);
      button.onkeydown = (event) => {
        const buttons = [...tabs.querySelectorAll('button')],
          index = buttons.indexOf(button);
        const target =
          event.key === 'ArrowRight'
            ? buttons[(index + 1) % buttons.length]
            : event.key === 'ArrowLeft'
              ? buttons[(index + buttons.length - 1) % buttons.length]
              : event.key === 'Home'
                ? buttons[0]
                : event.key === 'End'
                  ? buttons.at(-1)
                  : null;
        if (target) {
          event.preventDefault();
          target.focus();
          target.click();
        }
      };
    }
    if (!hub.open) hub.showModal();
    await renderTab(route, name && sections[route][name] ? name : Object.keys(sections[route])[0]);
  }
  hub.addEventListener('close', () => {
    generation++;
    cleanup?.();
    cleanup = null;
    if (focusBefore?.isConnected && !document.querySelector('dialog[open]')) focusBefore.focus();
  });
  const openSettings = async (name) => {
    if (!document.getElementById('settingsDialog').open) document.getElementById('settingsOpen').click();
    for (let i = 0; i < 100 && !document.getElementById('settingsDialog').open; i++)
      await new Promise((resolve) => setTimeout(resolve, 10));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.atlasSettings?.show(name);
  };
  const settingsBody = document.querySelector('#settingsDialog .settings-body');
  const models = [...settingsBody.querySelectorAll('.setting-section')].find(
    (section) => section.querySelector('h3')?.textContent === 'Models',
  );
  actionButton(
    'Configure local models',
    () => {
      document.getElementById('settingsDialog').close();
      return window.atlasPower.show('Local models');
    },
    models,
  );
  const diagnostics = node('section', undefined, 'setting-section');
  diagnostics.append(node('h3', 'Diagnostics'), node('p', 'Check connections, resource use and response timing.'));
  actionButton(
    'Connection diagnostics',
    () => {
      document.getElementById('settingsDialog').close();
      return window.atlasWorkspace.open.diagnostics();
    },
    diagnostics,
  );
  actionButton(
    'Performance and response timing',
    () => {
      document.getElementById('settingsDialog').close();
      return openHub('diagnostics');
    },
    diagnostics,
  );
  window.atlasSettings.register(diagnostics);
  const colabHeader = document.querySelector('.colab-chat-header');
  const more = node('div', undefined, 'shell-more');
  more.id = 'colabMoreActions';
  more.setAttribute('popover', 'auto');
  more.setAttribute('aria-label', 'Conversation actions');
  const moreButton = actionButton('More', () => {}, colabHeader);
  moreButton.popoverTargetElement = more;
  moreButton.setAttribute('aria-label', 'More conversation actions');
  colabHeader.append(more);
  for (const id of ['colabRename', 'colabPin', 'colabExport']) {
    const button = document.getElementById(id);
    if (button) {
      more.append(button);
      button.addEventListener('click', () => more.hidePopover());
    }
  }
  more.addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') {
      const rect = moreButton.getBoundingClientRect();
      more.style.left = Math.max(8, Math.min(innerWidth - 220, rect.right - 220)) + 'px';
      more.style.top = rect.bottom + 8 + 'px';
    }
  });
  const modeSummary = node('span', undefined, 'shell-mode-summary');
  document.getElementById('colabConfig').querySelector('summary').replaceChildren(modeSummary);
  const updateMode = () => {
    const chat = window.atlasColab.current();
    const label = { build: 'Build and review', debug: 'Debug', plan: 'Plan', compare: 'Compare approaches' }[
      chat.mode || 'build'
    ];
    modeSummary.textContent =
      label +
      ' · ' +
      (chat.mode === 'compare'
        ? 'Independent proposals'
        : chat.mode === 'plan'
          ? 'Read-only planning'
          : chat.roles === 'claude-builds'
            ? 'Claude builds → Codex reviews'
            : 'Codex builds → Claude reviews') +
      ' · Change options';
  };
  window.addEventListener('atlas-colab-chat-change', updateMode);
  updateMode();
  for (const [scope, selector, formId, sendId] of [
    ['assistant', '.composer', 'form', 'send'],
    ['colab', '.colab-composer', 'colabForm', 'colabStart'],
  ]) {
    const composer = document.querySelector(selector),
      toolbar = node('div', undefined, 'shell-composer-tools');
    toolbar.setAttribute('aria-label', 'Message actions');
    const attach = composer.querySelector('.attachment-add');
    if (attach) {
      attach.textContent = 'Attach';
      toolbar.append(attach);
    }
    if (scope === 'assistant') {
      const mic = document.getElementById('mic');
      mic.append(document.createTextNode('Voice'));
      toolbar.append(mic);
      if (typeof stopButton !== 'undefined') toolbar.append(stopButton);
    }
    const context = [...composer.querySelectorAll('button')].find((button) => button.textContent === 'Context');
    if (context) {
      context.style.marginTop = '';
      toolbar.append(context);
    }
    if (scope === 'colab') actionButton('Workflow', () => openHub('library', 'Workflows'), toolbar);
    if (scope === 'assistant') {
      const options = node('div', undefined, 'shell-more');
      options.id = 'assistantMessageOptions';
      options.setAttribute('popover', 'auto');
      options.setAttribute('aria-label', 'Project and effort options');
      const oldTools = composer.querySelector('.attachment-toolbar');
      if (oldTools) options.append(oldTools);
      composer.querySelector('.attachment-bar').append(options);
      const trigger = actionButton('Options', () => {}, toolbar);
      trigger.popoverTargetElement = options;
      options.addEventListener('toggle', (event) => {
        if (event.newState === 'open') {
          const rect = trigger.getBoundingClientRect(),
            height = options.getBoundingClientRect().height;
          options.style.left = Math.max(8, Math.min(innerWidth - 240, rect.left)) + 'px';
          options.style.top = Math.max(8, rect.top - height - 8) + 'px';
        }
      });
    }
    if (scope === 'colab') toolbar.append(document.getElementById('colabStop'));
    const send = document.getElementById(sendId);
    send.setAttribute('form', formId);
    send.classList.add('shell-send');
    if (scope === 'assistant') send.textContent = 'Send';
    toolbar.append(send);
    if (scope === 'assistant') {
      document.getElementById(formId).after(toolbar);
      composer.querySelector('.voice-bar').hidden = true;
    } else document.getElementById('colabTask').after(toolbar);
  }
  let listWidth = 250;
  try {
    const saved = Number(localStorage.getItem('atlas.chatListWidth'));
    if (saved >= 200 && saved <= 380) listWidth = saved;
  } catch {}
  const resizers = [];
  const setListWidth = (value, save = false) => {
    listWidth = Math.max(200, Math.min(380, Math.round(value)));
    document.documentElement.style.setProperty('--atlas-chat-width', listWidth + 'px');
    for (const handle of resizers) handle.setAttribute('aria-valuenow', listWidth);
    if (save)
      try {
        localStorage.setItem('atlas.chatListWidth', listWidth);
      } catch {}
  };
  for (const host of document.querySelectorAll('.assistant-workspace, .colab-workspace')) {
    const handle = node('div', undefined, 'shell-chat-resize');
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize conversation list');
    handle.setAttribute('aria-valuemin', '200');
    handle.setAttribute('aria-valuemax', '380');
    handle.title = 'Drag to resize the conversation list. Arrow keys also work.';
    host.children[0].after(handle);
    resizers.push(handle);
    let drag;
    handle.onpointerdown = (event) => {
      drag = { x: event.clientX, width: listWidth };
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    handle.onpointermove = (event) => {
      if (drag) setListWidth(drag.width + event.clientX - drag.x);
    };
    handle.onpointerup = () => {
      drag = null;
      setListWidth(listWidth, true);
    };
    handle.onlostpointercapture = () => {
      drag = null;
    };
    handle.ondblclick = () => setListWidth(250, true);
    handle.onkeydown = (event) => {
      const value =
        event.key === 'ArrowRight'
          ? listWidth + 10
          : event.key === 'ArrowLeft'
            ? listWidth - 10
            : event.key === 'Home'
              ? 200
              : event.key === 'End'
                ? 380
                : null;
      if (value !== null) {
        event.preventDefault();
        setListWidth(value, true);
      }
    };
  }
  setListWidth(listWidth);
  const titleTooltips = () => {
    for (const button of document.querySelectorAll('.assistant-chat-item, .colab-chat-item'))
      button.title = button.querySelector('span')?.textContent || button.title;
  };
  new MutationObserver(titleTooltips).observe(document.querySelector('.layout'), { childList: true, subtree: true });
  titleTooltips();
  window.atlasUi = { open: openHub, settings: openSettings, hub, node, actionButton, setListWidth };
})();
