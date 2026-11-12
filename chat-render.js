(function (root) {
  function memo(cache, key, signature, create) {
    const old = cache.get(key);
    if (
      old &&
      old.signature.length === signature.length &&
      signature.every((value, i) => Object.is(value, old.signature[i]))
    )
      return old.value;
    const value = create();
    cache.set(key, { signature, value });
    return value;
  }
  function reconcilePlain(parent, nodes) {
    let cursor = parent.firstChild;
    for (const node of nodes) {
      if (node === cursor) cursor = cursor.nextSibling;
      else parent.insertBefore(node, cursor);
    }
    while (cursor) {
      const next = cursor.nextSibling;
      cursor.remove();
      cursor = next;
    }
  }
  const windows = new WeakMap();
  function reconcile(parent, nodes) {
    const enabled = parent.classList.contains('atlas-large-history') && parent.dataset.finding !== 'true';
    let state = windows.get(parent);
    if (!enabled) {
      if (state) {
        state.root.removeEventListener('scroll', state.refresh);
        state.observer?.disconnect();
        windows.delete(parent);
      }
      reconcilePlain(parent, nodes);
      return;
    }
    if (!state) {
      const root = parent.closest('.response,.colab-transcript');
      state = { slots: new Map(), root, painting: false };
      state.refresh = () => {
        if (state.painting || windows.get(parent) !== state || !root.clientHeight || !root.getClientRects().length)
          return;
        state.painting = true;
        const viewport = root.getBoundingClientRect(),
          atBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 60;
        try {
          for (const [item, slot] of state.slots) {
            const before = slot.getBoundingClientRect(),
              near = before.bottom >= viewport.top - 600 && before.top <= viewport.bottom + 600;
            if (near && !slot.firstChild) {
              const above = before.bottom < viewport.top;
              slot.style.height = '';
              slot.append(item);
              if (above) root.scrollTop += slot.getBoundingClientRect().height - before.height;
            } else if (!near && slot.firstChild && !slot.contains(document.activeElement)) {
              slot.style.height = Math.max(1, before.height) + 'px';
              slot.replaceChildren();
            }
          }
          if (atBottom) root.scrollTop = root.scrollHeight;
        } finally {
          state.painting = false;
        }
      };
      root.addEventListener('scroll', state.refresh, { passive: true });
      state.observer = new ResizeObserver(state.refresh);
      state.observer.observe(root);
      windows.set(parent, state);
    }
    const alive = new Set(nodes),
      visible = nodes.map((item) => {
        if (!item.matches?.('.assistant-turn,.colab-message')) return item;
        let slot = state.slots.get(item);
        if (!slot) {
          slot = document.createElement('div');
          slot.className = 'atlas-message-slot';
          slot.style.height = '220px';
          state.slots.set(item, slot);
        }
        return slot;
      });
    for (const [item] of state.slots) if (!alive.has(item)) state.slots.delete(item);
    reconcilePlain(parent, visible);
    state.refresh();
    setTimeout(state.refresh, 0);
  }
  const ARCHIVED = '\0archived';
  // An archived chat stays out of the list unless you ask for it: under Archived, in a search, or while it is open.
  function chatVisible({ folder = '', archived = false }, filter, { searching = false, selected = false } = {}) {
    if (filter === ARCHIVED) return archived;
    if (filter && folder !== filter) return false;
    return !archived || searching || selected;
  }
  function fillFolderFilter(select, folders) {
    const value = select.value,
      names = [...new Set(folders.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.replaceChildren(
      new Option('All chats', ''),
      ...names.map((name) => new Option(name, name)),
      new Option('Archived', ARCHIVED),
    );
    select.value = value === ARCHIVED || names.includes(value) ? value : '';
  }
  function messagePage(items, query = '', page = 0, size = 150) {
    const needle = query.trim().toLowerCase(),
      indices = [];
    for (let i = 0; i < items.length; i++)
      if (
        items.length <= size ||
        !needle ||
        String(items[i].content || '')
          .toLowerCase()
          .includes(needle)
      )
        indices.push(i);
    const pages = Math.max(1, Math.ceil(indices.length / size));
    page = Math.max(0, Math.min(pages - 1, page));
    const end = Math.max(0, indices.length - page * size);
    return { indices: indices.slice(Math.max(0, end - size), end), page, pages, total: indices.length };
  }
  const api = { memo, reconcile, ARCHIVED, chatVisible, fillFolderFilter, messagePage };
  if (typeof module === 'object') module.exports = api;
  else root.atlasChatRender = api;
})(globalThis);
