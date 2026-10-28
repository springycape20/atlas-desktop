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
  search.placeholder = 'Search pages, tools and settings';
  search.setAttribute('aria-label', 'Search navigation');
  const results = node('div', undefined, 'command-results');
  results.id = 'commandResults';
  search.setAttribute('aria-controls', results.id);
  const status = node('p');
  status.setAttribute('role', 'status');
  dialog.append(header, search, status, results);
  document.body.append(dialog);
  const actions = [
    ['Chat', () => document.querySelector('[data-chat-workspace="assistant"]').click()],
    ['Colab', () => document.querySelector('[data-chat-workspace="colab"]').click()],
    ['Projects', () => window.atlasWorkspace.open.projects()],
    ['Conversation history', () => window.atlasWorkspace.open.history()],
    ...['Running', 'Queue', 'Parallel', 'Recovery', 'Reminders', 'Approvals'].map((name) => [
      'Tasks · ' + name,
      () => window.atlasUi.open('tasks', name),
    ]),
    ...['Memories', 'Workflows'].map((name) => ['Library · ' + name, () => window.atlasUi.open('library', name)]),
    ...[
      'Provider accounts',
      'Models',
      'Appearance',
      'Provider activity',
      'Permissions',
      'Voice',
      'App updates',
      'Diagnostics',
    ].map((name) => ['Settings · ' + name, () => window.atlasUi.settings(name)]),
  ];
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
    for (const [label, run] of actions.filter(([label]) =>
      query.split(/\s+/).every((word) => label.toLowerCase().includes(word)),
    )) {
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
