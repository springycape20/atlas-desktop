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
  let menuId = 0;
  function actionMenu(parent, label, items) {
    const wrap = node('span', undefined, 'action-menu'),
      trigger = node('button', label + ' ▾', 'quiet-button'),
      panel = node('div', undefined, 'action-menu-panel');
    trigger.type = 'button';
    panel.id = 'atlas-action-menu-' + ++menuId;
    panel.setAttribute('popover', 'auto');
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', label);
    trigger.setAttribute('popovertarget', panel.id);
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    for (const item of items) {
      item.setAttribute('role', 'menuitem');
      panel.append(item);
    }
    const available = () => [...panel.querySelectorAll('button')].filter((item) => !item.disabled && !item.hidden);
    panel.addEventListener('toggle', (event) => {
      trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
      if (event.newState === 'open') {
        const rect = trigger.getBoundingClientRect();
        panel.style.left = Math.max(8, Math.min(rect.left, innerWidth - Math.min(300, innerWidth - 16) - 8)) + 'px';
        panel.style.top =
          Math.max(8, Math.min(rect.bottom + 5, innerHeight - Math.min(panel.scrollHeight, 340) - 8)) + 'px';
        available()[0]?.focus();
      }
    });
    panel.addEventListener('click', (event) => {
      if (event.target.closest('button')) panel.hidePopover();
    });
    panel.addEventListener('keydown', (event) => {
      const buttons = available(),
        index = buttons.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        buttons[
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        ]?.focus();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        panel.hidePopover();
        trigger.focus();
      }
    });
    trigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        panel.showPopover();
      }
    });
    wrap.append(trigger, panel);
    parent.append(wrap);
    return wrap;
  }
  function compactActions(parent, keep = 2, label = 'More actions') {
    if (!parent || parent.dataset.compactActions) return;
    const buttons = [...parent.children].filter((item) => item.tagName === 'BUTTON');
    if (buttons.length <= keep + 1) return;
    parent.dataset.compactActions = 'true';
    actionMenu(parent, label, buttons.slice(keep));
  }
  function toolSections(body, labels) {
    const children = [...body.children],
      bar = node('nav', undefined, 'tool-section-tabs'),
      sections = [];
    bar.setAttribute('aria-label', 'Tool views');
    bar.setAttribute('role', 'tablist');
    let current;
    const select = (chosen) => {
      for (const row of sections) {
        row.panel.hidden = row !== chosen;
        row.button.setAttribute('aria-selected', String(row === chosen));
        row.button.tabIndex = row === chosen ? 0 : -1;
      }
    };
    for (const child of children) {
      const label = child.tagName === 'H3' ? labels[child.textContent] : !current ? labels.default : null;
      if (label) {
        const panel = node('section', undefined, 'tool-section'),
          button = node('button', label),
          row = { panel, button };
        panel.id = 'atlas-tool-section-' + ++menuId;
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', panel.id);
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-label', label);
        button.onclick = () => select(row);
        panel._reveal = () => select(row);
        sections.push(row);
        current = panel;
        bar.append(button);
        body.append(panel);
      }
      current.append(child);
    }
    for (const [index, row] of sections.entries())
      row.button.onkeydown = (event) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const target =
            sections[
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? sections.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + sections.length) % sections.length
            ];
          select(target);
          target.button.focus();
        }
      };
    body.prepend(bar);
    select(sections[0]);
    for (const row of sections) {
      const direct = [...row.panel.children].filter((item) => item.tagName === 'BUTTON');
      if (row.button.textContent === 'Browser checks')
        direct.sort(
          (a, b) => Number(b.textContent.startsWith('Run browser')) - Number(a.textContent.startsWith('Run browser')),
        );
      if (direct.length > 3) {
        const actions = node('div', undefined, 'power-actions');
        row.panel.append(actions);
        for (const button of direct) actions.append(button);
        compactActions(actions, 2);
      }
    }
  }
  const routeButton = (label, route, icon) => {
    // Main destinations stay visible; secondary toolbars use the shared action menu below.
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
  const groups = node('nav', undefined, 'shell-hub-groups');
  groups.setAttribute('aria-label', 'Section groups');
  const tabs = node('nav');
  tabs.setAttribute('aria-label', 'Sections');
  tabs.setAttribute('role', 'tablist');
  const content = node('section');
  content.className = 'shell-hub-content';
  content.id = 'shellHubContent';
  content.setAttribute('role', 'tabpanel');
  hub.append(header, groups, tabs, content);
  const rail = node('aside', undefined, 'shell-hub-rail'),
    categoryLabel = node('label', 'Category'),
    category = node('select'),
    filterLabel = node('label', 'Find a tool'),
    filter = node('input');
  category.setAttribute('aria-label', 'Tool category');
  categoryLabel.append(category);
  filter.type = 'search';
  filter.placeholder = 'Filter tools…';
  filter.setAttribute('aria-label', 'Filter tools');
  filterLabel.append(filter);
  rail.append(categoryLabel, filterLabel, tabs);
  hub.append(rail);
  const sectionLabel = node('label', 'Tool'),
    sectionPicker = node('select');
  sectionLabel.className = 'shell-section-picker';
  sectionPicker.setAttribute('aria-label', 'Open tool');
  sectionLabel.append(sectionPicker);
  rail.append(sectionLabel);
  sectionPicker.onchange = () => renderTab(currentRoute, sectionPicker.value);
  let currentRoute, activeSection;
  filter.oninput = () => {
    const query = filter.value.trim().toLowerCase();
    if (!query) {
      shownGroup = null;
      showGroup(currentRoute, groupOf(currentRoute, activeSection));
      return;
    }
    tabs.hidden = false;
    tabs.replaceChildren();
    content.setAttribute('aria-label', activeSection);
    for (const name of Object.keys(sections[currentRoute]).filter((name) => name.toLowerCase().includes(query))) {
      const button = actionButton(name, () => renderTab(currentRoute, name), tabs);
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(name === activeSection));
      button.setAttribute('aria-controls', content.id);
      button.title = groupOf(currentRoute, name) || name;
      button.onkeydown = (event) => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault();
          const buttons = [...tabs.children],
            index = buttons.indexOf(button);
          buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        }
      };
    }
  };
  filter.onkeydown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      tabs.querySelector('button')?.focus();
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      tabs.querySelector('button')?.click();
    }
  };
  category.onchange = () => renderTab(currentRoute, sectionsIn(currentRoute, category.value)[0]);
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
      'Task centre': panel(jobsPanel),
      Queue: workbench('Queue'),
      Parallel: power('Parallel'),
      Recovery: power('Recovery'),
      Reminders: panel(agendaPanel, () => void refreshAgenda()),
      Approvals: workbench('Approvals'),
    },
    library: { Memories: panel(memoryPanel, () => void refreshMemory()), Workflows: power('Workflows') },
    diagnostics: { Performance: power('Performance'), 'Response timing': panel(latencyPanel) },
  };
  // Registered task sections missing from this list appear under More.
  const taskGroups = {
    Work: [
      'Task centre',
      'Queue',
      'Plan a task',
      'Progress',
      'Parallel',
      'Task dependencies',
      'Reminders',
      'Recovery',
      'Repair loops',
      'Task budgets',
      'Milestone handovers',
    ],
    Review: [
      'Approvals',
      'Review centre',
      'Review inbox',
      'Selective changes',
      'Task comparison',
      'Test results',
      'Check logs',
      'Acceptance evidence',
      'Saved task evidence',
      'Workflow benchmarks',
    ],
    Project: [
      'Live preview',
      'Project editor',
      'Find and replace',
      'Terminal',
      'Debugger',
      'Saved workspace',
      'Git',
      'Services',
      'Environment preflight',
      'Project setup assistant',
      'Permissions',
      'Named checkpoints',
      'Trial checkpoints',
      'Trial promotion',
    ],
    Context: [
      'Project intelligence',
      'Language intelligence',
      'Project map',
      'Context selection',
      'Context freshness',
      'Document context',
      'Multi-root workspaces',
    ],
    Connect: ['Model handoff', 'Offline preparation', 'API requests', 'Integration manifests', 'Bug report builder'],
    'Power tools': ['Power tools'],
  };
  const groupOf = (route, name) =>
    route === 'tasks' ? Object.keys(taskGroups).find((group) => taskGroups[group].includes(name)) || 'More' : null;
  const sectionsIn = (route, group) =>
    (taskGroups[group] || Object.keys(sections[route])).filter(
      (name) => sections[route][name] && groupOf(route, name) === group,
    );
  let shownGroup;
  function showGroup(route, group) {
    if (shownGroup === route + ':' + group) return;
    shownGroup = route + ':' + group;
    category.value = group || '';
    filter.value = '';
    for (const button of groups.querySelectorAll('button'))
      button.setAttribute('aria-pressed', String(button.textContent === group));
    const names = sectionsIn(route, group);
    sectionPicker.replaceChildren(...names.map((name) => new Option(name, name)));
    tabs.hidden = names.length < 2;
    tabs.setAttribute('aria-orientation', 'vertical');
    tabs.replaceChildren();
    for (const section of names) {
      const button = actionButton(section, () => renderTab(route, section), tabs);
      button.dataset.section = section;
      button.id = 'shell-tab-' + section.replaceAll(' ', '-');
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', content.id);
      button.onkeydown = (event) => {
        const buttons = [...tabs.querySelectorAll('button')],
          index = buttons.indexOf(button);
        const target = ['ArrowRight', 'ArrowDown'].includes(event.key)
          ? buttons[(index + 1) % buttons.length]
          : ['ArrowLeft', 'ArrowUp'].includes(event.key)
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
  }
  async function renderTab(route, name) {
    activeSection = name;
    const revision = ++generation;
    cleanup?.();
    cleanup = null;
    content.replaceChildren();
    showGroup(route, groupOf(route, name));
    sectionPicker.value = name;
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
    if (route === 'tasks' && name === 'Running') name = 'Task centre';
    if (route === 'settings') return settingsButton.click();
    if (!sections[route]) return;
    currentRoute = route;
    categoryLabel.hidden = route !== 'tasks';
    category.replaceChildren(
      ...[...Object.keys(taskGroups), 'More']
        .filter((group) => sectionsIn(route, group).length)
        .map((group) => new Option(group, group)),
    );
    focusBefore = document.activeElement;
    title.textContent = route === 'tasks' ? 'Tasks' : route === 'library' ? 'Library' : 'Diagnostics';
    shownGroup = null;
    groups.replaceChildren();
    groups.hidden = route !== 'tasks';
    if (route === 'tasks')
      for (const group of [...Object.keys(taskGroups), 'More'].filter((row) => sectionsIn(route, row).length))
        actionButton(group, () => renderTab(route, sectionsIn(route, group)[0]), groups);
    if (!hub.open) hub.showModal();
    await renderTab(route, name && sections[route][name] ? name : Object.keys(sections[route])[0]);
  }
  hub.addEventListener('close', () => {
    // The event is queued: a section opened right after closing must not be torn down by it.
    if (hub.open) return;
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
  for (const id of ['colabRename', 'colabPin', 'colabMoveFolder', 'colabArchive', 'colabExport']) {
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
  window.atlasUi = {
    actionMenu,
    compactActions,
    toolSections,
    reveal: (element) => {
      element?.closest('.tool-section')?._reveal?.();
    },
    open: openHub,
    settings: openSettings,
    hub,
    node,
    actionButton,
    setListWidth,
    pages: () =>
      Object.keys(sections).flatMap((route) => Object.keys(sections[route]).map((name) => ({ route, name }))),
    register: (route, name, view = name) => {
      if (sections[route]) sections[route][name] = power(view);
    },
  };
})();
