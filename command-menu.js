(() => {
  const { node, actionButton } = window.atlasUi;
  const dialog = node('dialog', undefined, 'command-menu');
  dialog.setAttribute('aria-labelledby', 'commandMenuTitle');
  const header = node('header');
  const heading = node('h2', 'Go to…');
  heading.id = 'commandMenuTitle';
  header.append(heading);
  actionButton('Close', () => dialog.close(), header);
  const search = node('input');
  search.type = 'search';
  search.placeholder = 'Search pages, tools, settings and chats';
  search.setAttribute('aria-label', 'Search navigation');
  const results = node('div', undefined, 'command-results');
  results.id = 'commandResults';
  search.setAttribute('aria-controls', results.id);
  const status = node('p');
  status.setAttribute('role', 'status');
  dialog.append(header, search, status, results);
  document.body.append(dialog);
  const routeNames = { tasks: 'Tasks', library: 'Library', diagnostics: 'Diagnostics' };
  const showChat = () => document.querySelector('[data-chat-workspace="assistant"]').click();
  const showColab = () => document.querySelector('[data-chat-workspace="colab"]').click();
  // Chats sit behind every dialog, so close the ones that would cover them.
  const inWorkspace = (run) => () => {
    for (const cover of [window.atlasUi.hub, window.atlasPower.dialog, document.getElementById('settingsDialog')])
      cover.close();
    return run();
  };
  const matches = (label, query) => query.split(/\s+/).every((word) => label.toLowerCase().includes(word));
  const chats = (query) =>
    [
      ...window.atlasAssistant.chats().map((chat) => ({
        ...chat,
        prefix: 'Chat · ',
        run: () => window.atlasAssistant.open(chat.id),
      })),
      ...window.atlasColab
        .history()
        .filter((chat) => chat.turns?.length || chat.title !== 'New Colab chat')
        .map((chat) => ({
          ...chat,
          prefix: 'Colab · ',
          run: () => window.atlasColab.selectChat(chat.id),
        })),
    ]
      .filter((chat) => query || !chat.archived)
      .map((chat) => ({ ...chat, label: chat.prefix + chat.title + (chat.archived ? ' (archived)' : '') }))
      .filter((chat) => matches(chat.label, query))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, query ? 20 : 5)
      .map((chat) => [chat.label, inWorkspace(chat.run)]);
  // Listed when the menu opens, because pages keep registering after this script loads.
  const destinations = (query) => {
    const pages = window.atlasUi.pages(),
      hubNames = new Set(pages.map((page) => page.name));
    return [
      ['Activity', inWorkspace(() => window.atlasActivity.open())],
      ['Search all work', () => window.atlasUi.open('library', 'Search all work')],
      [
        'New chat',
        inWorkspace(() => {
          showChat();
          window.atlasAssistant.newChat();
        }),
      ],
      [
        'New Colab chat',
        inWorkspace(() => {
          showColab();
          document.getElementById('colabNewChat').click();
        }),
      ],
      ['Chat', inWorkspace(showChat)],
      ['Colab', inWorkspace(showColab)],
      [
        'Projects',
        () => (window.atlasProjectHome ? window.atlasProjectHome.open() : window.atlasWorkspace.open.projects()),
      ],
      ['Conversation history', () => window.atlasWorkspace.open.history()],
      // Recent chats come early in the full list; found chats come after pages of the same rank.
      ...(query ? [] : chats(query)),
      ...pages
        .filter((page) => page.name !== 'Search all work')
        .map(({ route, name }) => [routeNames[route] + ' · ' + name, () => window.atlasUi.open(route, name)]),
      ...window.atlasPower
        .names()
        .filter((name) => !hubNames.has(name))
        .map((name) => ['Tools · ' + name, () => window.atlasPower.show(name)]),
      ...window.atlasSettings.sections().map((name) => ['Settings · ' + name, () => window.atlasUi.settings(name)]),
      ...(query ? chats(query) : []),
    ];
  };
  // Exact names first, then names that start with the search, otherwise keep the listed order.
  const rank = (label, query) => {
    const name = label.split(' · ').at(-1).toLowerCase();
    return name === query ? 0 : name.startsWith(query) ? 1 : 2;
  };
  let active = 0,
    origin;
  const buttons = () => [...results.querySelectorAll('button')];
  const highlight = () => {
    buttons().forEach((button, index) => button.setAttribute('aria-current', String(index === active)));
    buttons()[active]?.scrollIntoView({ block: 'nearest' });
    if (buttons().length)
      status.textContent = `${buttons()[active].textContent}. ${active + 1} of ${buttons().length} destinations. Use arrow keys and Enter.`;
  };
  const render = () => {
    const query = search.value.toLowerCase().trim();
    active = 0;
    results.replaceChildren();
    for (const [label, run] of destinations(query)
      .filter(([label]) => matches(label, query))
      .sort(([a], [b]) => rank(a, query) - rank(b, query))) {
      actionButton(
        label,
        async () => {
          dialog.close();
          await run();
        },
        results,
      );
    }
    status.textContent = results.children.length
      ? `${results.children.length} destinations. Use arrow keys and Enter.`
      : 'No matching destinations.';
    highlight();
  };
  const open = () => {
    if (dialog.open) {
      search.focus();
      return;
    }
    origin = document.activeElement;
    search.value = '';
    render();
    dialog.showModal();
    search.focus();
  };
  search.addEventListener('input', render);
  search.addEventListener('keydown', (event) => {
    const count = buttons().length;
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && count) {
      event.preventDefault();
      active = (active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      highlight();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      buttons()[active]?.click();
    }
  });
  dialog.addEventListener('close', () => {
    if (origin?.isConnected) origin.focus();
  });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      open();
    }
  });
  const trigger = actionButton('Search · Ctrl+K', open, document.querySelector('.topright'));
  trigger.classList.add('command-trigger');
  trigger.setAttribute('aria-keyshortcuts', 'Control+k Meta+k');
  window.atlasCommandMenu = { open, dialog };
})();
