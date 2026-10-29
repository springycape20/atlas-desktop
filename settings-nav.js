// Settings navigation: a section list with search, one section shown at a time, and an
// unsaved-changes indicator. Sections are found by their h3 titles, so sections that other
// scripts add (such as App updates) join the list automatically.
(() => {
  const dialog = document.getElementById('settingsDialog');
  if (!dialog) return;
  const body = dialog.querySelector('.settings-body'),
    footer = dialog.querySelector('.settings-footer'),
    savedNote = document.getElementById('settingsSaved');
  const ORDER = [
    'Provider accounts',
    'Models',
    'Appearance',
    'Provider activity',
    'Assistant',
    'Voice',
    'Microphone',
    'Permissions',
    'Transparency',
    'Startup',
    'App updates',
    'Optional statistics report',
    'Automatic statistics',
    'Tools and data',
  ];
  const HINTS = {
    'Provider accounts': 'Sign-in and connection checks',
    Models: 'Codex and Claude models',
    Appearance: 'Theme, text size and spacing',
    'Provider activity': 'Local tasks and limit cooldowns',
    Assistant: 'Routing, timeouts and replies',
    Voice: 'Speech engine and voice',
    Microphone: 'Input, wake word and listening',
    Permissions: 'Workspace access and approvals',
    Transparency: 'Model reasoning summaries',
    Startup: 'Launch at sign-in',
    'App updates': 'Version and updates',
    'Optional statistics report': 'Review and save a voluntary local report',
    'Automatic statistics': 'Off by default; separate opt-in required',
    'Tools and data': 'Plugins, chat import and log',
  };
  const STORAGE_KEY = 'atlas.settings.section';
  const defaultNote = savedNote?.textContent || '';
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  const layout = el('div', 'settings-layout'),
    nav = el('nav', 'settings-nav'),
    search = el('input', 'settings-search'),
    list = el('div', 'settings-nav-list'),
    empty = el('p', 'settings-empty');
  nav.setAttribute('aria-label', 'Settings sections');
  search.type = 'search';
  search.placeholder = 'Search settings';
  search.setAttribute('aria-label', 'Search settings');
  empty.hidden = true;
  empty.setAttribute('role', 'status');
  nav.append(search, list);
  body.before(layout);
  layout.append(nav, body);
  body.append(empty);

  const title = (section) => section.querySelector('h3')?.textContent.trim() || '';
  const sections = () => [...body.querySelectorAll(':scope > .setting-section')];
  const rank = (name) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);
  let current = null;
  try {
    current = localStorage.getItem(STORAGE_KEY);
  } catch {}

  function arrange() {
    const ordered = sections().sort((a, b) => rank(title(a)) - rank(title(b)));
    for (const section of ordered) body.insertBefore(section, empty);
    list.replaceChildren(
      ...ordered.map((section) => {
        const name = title(section),
          button = el('button', 'settings-nav-item', name);
        button.type = 'button';
        button.dataset.section = name;
        if (HINTS[name]) button.append(el('small', '', HINTS[name]));
        button.onclick = () => {
          search.value = '';
          show(name);
        };
        return button;
      }),
    );
    if (!ordered.some((section) => title(section) === current)) current = title(ordered[0] || body);
    if (search.value.trim()) filter();
    else show(current, { keepScroll: true });
  }

  function show(name, { keepScroll = false } = {}) {
    if (name === 'Provider activity') void window.atlasProviderActivity?.refresh();
    current = name;
    try {
      localStorage.setItem(STORAGE_KEY, name);
    } catch {}
    clearFilter();
    layout.classList.remove('settings-searching');
    for (const section of sections()) section.hidden = title(section) !== name;
    for (const button of list.children) {
      button.setAttribute('aria-current', String(button.dataset.section === name));
      if (button.dataset.section === name && dialog.open)
        button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    empty.hidden = true;
    if (!keepScroll) body.scrollTop = 0;
  }

  // Text that identifies a setting: its labels, descriptions, option names and placeholders.
  const searchable = (node) =>
    [
      node.textContent,
      ...[...node.querySelectorAll('option')].map((option) => option.textContent),
      ...[...node.querySelectorAll('[placeholder],[aria-label]')].map(
        (item) => (item.getAttribute('placeholder') || '') + ' ' + (item.getAttribute('aria-label') || ''),
      ),
    ]
      .join(' ')
      .toLowerCase();
  function clearFilter() {
    for (const node of body.querySelectorAll('.settings-filtered-out')) node.classList.remove('settings-filtered-out');
    for (const button of list.children) button.classList.remove('settings-no-match');
  }
  function filter() {
    const query = search.value.trim().toLowerCase();
    if (!query) return show(current);
    clearFilter();
    layout.classList.add('settings-searching');
    let matches = 0;
    for (const section of sections()) {
      const name = title(section),
        rows = [...section.children].filter((child) => child.tagName !== 'H3'),
        sectionMatches = name.toLowerCase().includes(query);
      let shown = 0;
      for (const row of rows) {
        const hit = sectionMatches || searchable(row).includes(query);
        row.classList.toggle('settings-filtered-out', !hit);
        // Rows hidden on purpose (such as another speech engine's options) are not results.
        if (hit && !row.hidden) shown++;
      }
      section.hidden = !shown;
      matches += shown;
      const button = list.querySelector(`[data-section="${CSS.escape(name)}"]`);
      button?.classList.toggle('settings-no-match', !shown);
      button?.setAttribute('aria-current', 'false');
    }
    empty.textContent = `No settings match “${search.value.trim()}”.`;
    empty.hidden = Boolean(matches);
    body.scrollTop = 0;
  }
  search.addEventListener('input', filter);
  search.addEventListener('keydown', (event) => {
    // Escape clears the search first instead of closing Settings.
    if (event.key === 'Escape' && search.value) {
      event.preventDefault();
      search.value = '';
      show(current);
    }
  });
  list.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...list.children],
      at = buttons.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (at + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });

  // Unsaved changes: Save collects every field at once, so any edit marks the dialog dirty.
  let dirty = false,
    saveClicked = false;
  const markDirty = (event) => {
    if (event.target.closest('[data-ephemeral-settings]')) return;
    if (event.target === search || !event.target.closest('.settings-body')) return;
    if (!event.target.matches('input, select, textarea')) return;
    dirty = true;
    footer.classList.add('settings-dirty');
    if (savedNote) savedNote.textContent = 'Unsaved changes';
  };
  dialog.addEventListener('input', markDirty);
  dialog.addEventListener('change', markDirty);
  document.getElementById('settingsSave')?.addEventListener('click', () => (saveClicked = true), true);
  // Watch the open attribute rather than the close event, so every way of closing (×, Escape,
  // clicking outside, saving) is handled the same way.
  let wasOpen = dialog.open;
  new MutationObserver(() => {
    if (dialog.open === wasOpen) return;
    wasOpen = dialog.open;
    if (dialog.open) {
      // Opening Settings: start clean, with the search cleared and the last section shown.
      if (savedNote) savedNote.textContent = defaultNote;
      search.value = '';
      show(current);
      return;
    }
    const saved = saveClicked && savedNote?.textContent === 'Saved on this computer';
    if (dirty && !saved)
      window.toast?.('Settings were not saved. Reopen Settings and choose Save settings to keep changes.');
    dirty = false;
    saveClicked = false;
    footer.classList.remove('settings-dirty');
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] });

  // Re-list only when the set of sections changes; arrange() itself moves sections around.
  let pending = 0,
    known = '';
  const names = () => sections().map(title).sort().join('\n');
  new MutationObserver(() => {
    if (names() === known) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      known = names();
      arrange();
    });
  }).observe(body, { childList: true });
  known = names();
  arrange();
  window.atlasSettings = {
    show: (name) => show(name),
    current: () => current,
    register: (section) => {
      body.append(section);
      known = names();
      arrange();
    },
  };
})();
